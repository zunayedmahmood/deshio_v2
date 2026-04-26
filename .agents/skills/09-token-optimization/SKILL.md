---
name: codebase-graph-token-optimization
description: "Use this skill when minimizing token usage while preserving structural context for AI model prompts. Covers subgraph pruning strategies, PageRank-based node selection, cluster-aware context windowing, compact serialization formats, and incremental context diffing between prompts. Trigger when prompt context is approaching token limits, when optimizing cost, or when building the final context block for any AI prompt."
---

# Token Optimization — Minimal Context, Maximum Signal

## Overview

The graph holds hundreds of nodes — far too many to include verbatim in every prompt.  
This skill defines strategies for selecting and serializing the **minimum context** that gives the AI model everything it needs to answer correctly.

**Core principle:** *Structural signal, not content. Paths and relations, not file bodies.*

---

## Strategy 1 — PageRank-Gated Selection

Only include nodes above a PageRank threshold for global summaries.  
High-PageRank nodes are architectural load-bearers — they appear in many paths.

```python
def pagerank_gated_nodes(conn, threshold: float = 0.02, limit: int = 30) -> list:
    return conn.execute("""
        SELECT id, node_type, name, file_path, cluster_id, pagerank
        FROM nodes
        WHERE pagerank >= ?
        ORDER BY pagerank DESC
        LIMIT ?
    """, (threshold, limit)).fetchall()
```

**Typical thresholds:**

| Context Size | PageRank Threshold | Expected Nodes |
|-------------|-------------------|----------------|
| 1 000 tokens | 0.05 | ~8 nodes |
| 2 000 tokens | 0.02 | ~20 nodes |
| 4 000 tokens | 0.01 | ~50 nodes |
| 8 000 tokens | 0.005 | ~100 nodes |

---

## Strategy 2 — Depth-Limited Subgraph Extraction

For file-focused reads, limit traversal depth based on remaining token budget.

```python
def budget_aware_depth(token_budget: int) -> int:
    """Map token budget to max BFS depth."""
    if token_budget >= 6000: return 4
    if token_budget >= 3000: return 3
    if token_budget >= 1500: return 2
    return 1
```

At each depth level, **prune by edge weight** (see `06-blast-radius/SKILL.md`):
- Budget tight → only include edges with weight ≥ 7
- Budget comfortable → include all edges

---

## Strategy 3 — Cluster-Window Context

When the prompt is clearly within one architectural domain (e.g. "auth system"), load only that cluster plus its bridge edges.

```python
def cluster_window(conn, cluster_id: int, include_bridge: bool = True) -> list:
    nodes = conn.execute(
        "SELECT * FROM nodes WHERE cluster_id = ? ORDER BY pagerank DESC",
        (cluster_id,)
    ).fetchall()

    if include_bridge:
        # Include nodes from OTHER clusters that have edges INTO this cluster
        bridge_nodes = conn.execute("""
            SELECT DISTINCT n.* FROM nodes n
            JOIN edges e ON e.from_id = n.id
            JOIN nodes target ON target.id = e.to_id
            WHERE target.cluster_id = ? AND n.cluster_id != ?
            ORDER BY n.pagerank DESC
            LIMIT 10
        """, (cluster_id, cluster_id)).fetchall()
        nodes = list(nodes) + list(bridge_nodes)

    return nodes
```

---

## Strategy 4 — Incremental Context Diff

Between consecutive prompts in the same session, only send **what changed** since the last read.

```python
class ContextSession:
    def __init__(self):
        self.last_node_set: set[str] = set()    # node IDs from previous read
        self.last_read_time: str     = None

    def diff_context(self, conn, current_node_ids: set[str]) -> dict:
        added   = current_node_ids - self.last_node_set
        removed = self.last_node_set - current_node_ids
        same    = current_node_ids & self.last_node_set

        # Only serialize new nodes in full; reference unchanged ones by ID
        added_nodes   = [get_node(conn, nid) for nid in added]
        removed_names = [get_node(conn, nid)['name'] for nid in removed if get_node(conn, nid)]

        self.last_node_set = current_node_ids
        return {
            'added':   added_nodes,
            'removed': removed_names,
            'unchanged_count': len(same)
        }
```

**Format for diff output** (very compact):

```
CONTEXT DELTA since last read:
  + UserProfile [component]  src/components/UserProfile.tsx
  + useProfile [hook]        src/hooks/useProfile.ts
  - OldDashboard [page]      removed from graph (file deleted)
  = 47 nodes unchanged
```

---

## Compact Serialization Formats

### Format A: Relation Table (most token-efficient)

Best for: blast radius reports, pre-modification checklists.

```
User [model] → UserController [ctrl] QUERIES
User [model] → UserObserver [obs]    OBSERVED_BY
User [model] → Post [model]          HAS_MANY
User [model] → Role [model]          BELONGS_TO_MANY
UserController → GET /api/users [route]   HANDLED_BY
GET /api/users → useUsers [hook]     CALLS_API
useUsers → UserTable [component]     USES_HOOK
```

Approximate: **~15 tokens per edge row**.

### Format B: Node Summary (for cluster overviews)

```
Auth cluster (42 nodes):
  models:      User·Role·Permission·PersonalAccessToken
  controllers: AuthController(8)·UserController(6)
  routes:      GET /api/user · POST /api/login · POST /api/logout · POST /api/register
  hooks:       useAuth·usePermissions
  pages:       /login · /register · /profile
```

Approximate: **~60 tokens per cluster**.

### Format C: Full Node Detail (for seed files only)

Only used for the file the user is actively editing.

```
User [model]  app/Models/User.php  lines 1-120  cluster:0  pr:0.142
  table: users
  fillable: name, email, password, avatar_url, settings
  casts: email_verified_at→datetime, settings→array, is_admin→boolean
  relationships:
    hasMany Post (app/Models/Post.php)
    hasMany Media (app/Models/Media.php)
    belongsToMany Role (app/Models/Role.php) pivot:role_user
  scopes: active, verified, admins
  traits: SoftDeletes, HasFactory, Notifiable
```

Approximate: **~80 tokens per node**.

---

## Token Estimation

```python
def estimate_tokens(text: str) -> int:
    """Rough estimate: 1 token ≈ 4 characters for English/code mixed text."""
    return len(text) // 4

def estimate_node_tokens(node: dict, format: str) -> int:
    return {
        'relation_row': 15,
        'cluster_line': 12,
        'cluster_summary': 60,
        'full_detail': 80,
    }[format]
```

---

## Context Assembly Pipeline

```python
def assemble_context(conn, prompt_analysis: dict, token_budget: int) -> str:
    """
    prompt_analysis = {
        'files_mentioned': [...],
        'cluster_hint':    int | None,
        'is_modification': bool,
        'query_terms':     [...]
    }
    """
    sections = {}
    used     = 0

    # 1. Always: freshness check header (~20 tokens)
    sections['header'] = build_header(conn)
    used += 20

    # 2. Seed file detail (80 tokens × N files mentioned)
    for f in prompt_analysis['files_mentioned']:
        nodes = get_file_nodes(conn, f)
        for n in nodes:
            sections[f'seed_{n["id"]}'] = serialize_node(n, format='full_detail')
            used += 80

    # 3. Blast radius depth 1 (15 tokens × edges)
    if prompt_analysis['is_modification']:
        blast  = compute_blast_radius(conn, seed_ids, max_depth=1)
        rows   = [serialize_edge_row(e) for e in blast['edges']]
        sections['blast_d1'] = '\n'.join(rows)
        used += 15 * len(rows)

    # 4. Cluster summary for related clusters
    if used < token_budget * 0.7 and prompt_analysis['cluster_hint']:
        sections['cluster'] = serialize_cluster_summary(conn, prompt_analysis['cluster_hint'])
        used += 60

    # 5. Hotspots (if budget remains)
    if used < token_budget * 0.85:
        sections['hotspots'] = serialize_hotspot_list(conn, limit=10)
        used += 15 * 10

    return trim_to_budget(sections, token_budget)
```

---

## What to NEVER Include in Context

These items waste tokens without adding structural signal:

- File contents or code snippets (the AI can read those directly if needed)
- Tailwind class lists (only include if the prompt is specifically about styling)
- Full migration column lists (only include FK/index info)
- Line numbers for nodes not in the blast radius
- Cluster membership for nodes not in the current focus
- Dead candidates unless the prompt is specifically about cleanup
- Timestamps and sync logs

---

## Critical Rules

- **Structure only, never content.** Relation tables convey more signal per token than prose descriptions.
- **The budget is a hard ceiling.** Trim aggressively — a focused context with 30 nodes is better than a bloated one with 200.
- **Seed file always gets full detail.** Never trim the node the user is actively working on.
- **Depth-1 blast radius always fits.** Ensure at minimum the direct dependents are included even under tight budgets.
- **Use Format A (relation table) by default.** Switch to Format C only for the seed node(s).
- **Incremental diff saves 60–80% of tokens** in multi-turn sessions. Always use it when a session already has a previous read.
