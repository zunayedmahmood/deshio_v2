---
name: codebase-graph-read
description: "Use this skill at the start of every AI prompt session to load the codebase graph into working context. Covers the /codebase-graph read command, subgraph retrieval strategy, cluster-aware context selection, token-budget enforcement, and the structured context block format injected into the AI's prompt. This is the primary daily-use command — read this skill before answering any prompt that involves modifying or understanding the codebase."
---

# Graph Read — Context Loading for AI Prompts

## Overview

`/codebase-graph read` is run **before every prompt** that involves understanding or modifying the codebase.  
It retrieves a **token-efficient subgraph** from `graph.db` and formats it as a structured context block.  
The AI model uses this as its source of truth for architecture, relations, and impact.

---

## Command

```bash
/codebase-graph read                          # Full architecture summary (default)
/codebase-graph read --file app/Models/User.php    # Focused: subgraph around this file
/codebase-graph read --query "authentication"      # Semantic cluster search
/codebase-graph read --cluster 3                   # All nodes in Louvain cluster 3
/codebase-graph read --hotspots                    # PageRank top-20 nodes only
/codebase-graph read --budget 2000                 # Hard token budget (default: 4000)
```

---

## What the AI Model MUST Do When Prompted

Before answering any prompt about the codebase, the AI model should:

1. Run (or simulate) `/codebase-graph read` to load context.
2. Run `/codebase-graph blast-radius` for any file that will be modified.
3. Use the context block as the **authoritative source of truth** for file locations, class names, relationships, and architecture.
4. **Never assume** file structure from memory — always confirm from the graph.

---

## Read Modes

### Mode A: Full Architecture Summary (default)

Returns a high-level view of every cluster with top nodes by PageRank.  
Ideal for orientation prompts ("explain the architecture", "where is X?").

```python
def read_full_summary(conn, token_budget=4000) -> str:
    clusters = conn.execute("""
        SELECT cluster_id, COUNT(*) as size,
               GROUP_CONCAT(node_type) as types
        FROM nodes
        GROUP BY cluster_id
        ORDER BY size DESC
    """).fetchall()

    hotspots = conn.execute("""
        SELECT name, node_type, file_path, pagerank
        FROM nodes
        ORDER BY pagerank DESC
        LIMIT 20
    """).fetchall()

    return format_summary(clusters, hotspots, token_budget)
```

### Mode B: File-Focused Subgraph

Returns the node(s) for the given file plus all neighbours up to depth 2.  
Ideal for "what touches this file" and pre-modification context.

```python
def read_file_subgraph(conn, file_path: str, token_budget=4000) -> str:
    seed_nodes = get_file_nodes(conn, file_path)
    subgraph   = {}

    for seed in seed_nodes:
        neighbours = compute_blast_radius(
            conn,
            [seed['id']],
            max_depth=2,
            direction='both'     # upstream + downstream
        )
        subgraph.update(neighbours)

    return format_subgraph(subgraph, seed_nodes, token_budget)
```

### Mode C: Semantic Cluster Search

Matches the query string against node names, file paths, and metadata.  
Returns the matching nodes plus their cluster neighbours.

```python
def read_query(conn, query: str, token_budget=4000) -> str:
    # Full-text search across name, file_path, metadata
    matches = conn.execute("""
        SELECT * FROM nodes
        WHERE name LIKE ?
           OR file_path LIKE ?
           OR metadata LIKE ?
        ORDER BY pagerank DESC
        LIMIT 10
    """, (f'%{query}%', f'%{query}%', f'%{query}%')).fetchall()

    if not matches:
        return f"No nodes found matching '{query}'"

    # Expand to cluster neighbours
    cluster_ids = {r['cluster_id'] for r in matches}
    cluster_nodes = conn.execute(f"""
        SELECT * FROM nodes
        WHERE cluster_id IN ({','.join('?' * len(cluster_ids))})
        ORDER BY pagerank DESC
        LIMIT 30
    """, list(cluster_ids)).fetchall()

    return format_cluster_view(matches, cluster_nodes, token_budget)
```

---

## Output Format — Context Block

The context block is injected **at the top of the AI's working context** before the user's prompt.

```
╔══════════════════════════════════════════════════════════════════╗
║  CODEBASE GRAPH CONTEXT  ·  graph.db  ·  synced 2s ago          ║
╚══════════════════════════════════════════════════════════════════╝

ARCHITECTURE CLUSTERS
─────────────────────
Cluster 0 — Auth & Users (42 nodes)
  Models:      User, Role, Permission
  Controllers: AuthController, UserController
  Routes:      POST /api/login, POST /api/register, GET /api/users
  Frontend:    useAuth, LoginPage, RegisterPage, UserCard

Cluster 1 — Content & Posts (31 nodes)
  Models:      Post, Category, Tag
  Controllers: PostController, CategoryController
  Routes:      GET /api/posts, POST /api/posts, GET /api/posts/{id}
  Frontend:    usePost, PostList, PostEditor, PostCard

Cluster 2 — Media & Files (18 nodes)
  Models:      Media, Attachment
  Jobs:        ProcessImage, GenerateThumbnail
  Frontend:    FileUpload, ImagePicker, useMedia

[... N more clusters ...]

TOP HOTSPOTS (by PageRank)
──────────────────────────
1. User [model]            app/Models/User.php                 pr=0.142
2. UserController [ctrl]   app/Http/Controllers/UserController pr=0.089
3. useAuth [hook]          src/hooks/useAuth.ts                pr=0.071
4. Post [model]            app/Models/Post.php                 pr=0.065
5. PostController [ctrl]   app/Http/Controllers/PostController pr=0.058
[... top 20 ...]

GRAPH STATS
───────────
Nodes: 312  ·  Edges: 847  ·  Clusters: 8
Backend: 189 nodes  ·  Frontend: 123 nodes
Bridge edges: 67  ·  Dead candidates: 4
Last sync: 2s ago  ·  Watcher: active
```

### File-Focused Subgraph Format

```
╔══════════════════════════════════════════════════════════════════╗
║  SUBGRAPH: app/Models/User.php  ·  Cluster 0 (Auth & Users)     ║
╚══════════════════════════════════════════════════════════════════╝

SEED NODES (this file)
  User [model]  ·  table: users  ·  fillable: name, email, password
                   casts: email_verified_at→datetime, settings→array

UPSTREAM (what this file depends on)
  ← database/migrations/2024_01_01_create_users_table.php [BACKED_BY]

DOWNSTREAM (what depends on this file)
  → UserController.php::index()        [QUERIES]  depth:1
  → UserController.php::show()         [QUERIES]  depth:1
  → AuthController.php::login()        [QUERIES]  depth:1
  → UserResource.php                   [TRANSFORMS_VIA]  depth:1
  → UserObserver.php                   [OBSERVED_BY]  depth:1
  → routes/api.php: GET /api/users     [HANDLED_BY→QUERIES]  depth:2
  → routes/api.php: GET /api/users/{id}[HANDLED_BY→QUERIES]  depth:2
  → src/hooks/useUsers.ts              [CALLS_API]  depth:3
  → src/components/UserTable.tsx       [USES_HOOK]  depth:4

RELATIONSHIPS
  hasMany  → Post (app/Models/Post.php)
  hasMany  → Media (app/Models/Media.php)
  belongsToMany → Role (app/Models/Role.php)
```

---

## Token Budget Enforcement

Context is trimmed to fit the `--budget` token limit (approximate: 1 token ≈ 4 chars).

```python
SECTION_PRIORITIES = [
    'seed_nodes',          # Always include
    'blast_radius_depth1', # Always include
    'blast_radius_depth2', # Include if budget allows
    'cluster_summary',     # Include if budget allows
    'hotspots',            # Include if budget allows
    'blast_radius_depth3', # Low priority
    'dead_candidates',     # Low priority
]

def trim_to_budget(sections: dict, budget_tokens: int) -> str:
    output = []
    used   = 0
    for key in SECTION_PRIORITIES:
        text = sections.get(key, '')
        cost = len(text) // 4   # rough token estimate
        if used + cost <= budget_tokens:
            output.append(text)
            used += cost
        else:
            output.append(f"[{key}: trimmed — {cost} tokens over budget]")
    return '\n'.join(output)
```

---

## Graph Freshness Check

Before returning context, verify the graph is not stale:

```python
def check_freshness(conn, config) -> tuple[bool, str]:
    last_sync = config.get('last_sync')
    watcher   = config.get('watch_active', False)

    if not watcher:
        return False, "⚠  File watcher is NOT running — graph may be stale. Run: /codebase-graph watch"

    # Check for files modified after last sync
    stale_files = conn.execute("""
        SELECT fh.file_path
        FROM file_hashes fh
        WHERE fh.last_indexed < datetime('now', '-60 seconds')
        LIMIT 5
    """).fetchall()

    if stale_files:
        names = ', '.join(r['file_path'] for r in stale_files)
        return False, f"⚠  Possibly stale: {names}"

    return True, "✓ Graph is current"
```

---

## Critical Rules

- **Run `/codebase-graph read` before every prompt involving code changes.** Without it, the AI model is operating blind.
- **The context block is the source of truth.** Do not contradict it with assumptions from training data.
- **Token budget is a hard limit.** Never exceed `--budget`. If context is trimmed, tell the user and suggest a more focused `--file` or `--cluster` read.
- **If the watcher is not running**, surface a warning in the context block header. Do not silently serve stale data.
- **File paths in the context block are relative to the repo root.** Always use them as-is when referencing files in responses.
- **PageRank hotspots = high-impact files.** When in doubt about what to review, start with high-pagerank nodes in the affected cluster.
