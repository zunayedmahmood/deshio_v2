---
name: codebase-graph-blast-radius
description: "Use this skill when computing the blast radius of a change — i.e., finding all files and nodes that must be reviewed or updated when a given file or function is modified. Covers BFS/DFS traversal of the graph, edge-type weighting, cluster-aware pruning, and human-readable impact reports. Trigger when the user asks 'what does changing X affect', 'what files need to change if I edit Y', or when the AI model is about to modify a file and needs to understand downstream impact."
---

## ⚙ Linux — Python Environment

> **Always use the venv wrapper instead of bare `python3`.**  
> Run `.codebase-graph/setup.sh` once to create it (included in the skill library root).

```bash
# Every python invocation in this skill must use:
.codebase-graph/cg-python your_script.py
# or inline:
.codebase-graph/cg-python -c "import tree_sitter; ..."
```

Never call bare `python3 script.py` — it will miss `tree-sitter` and `watchdog`.

---


# Blast Radius Algorithm

## Overview

Given one or more **changed nodes** (files, classes, methods, routes), the blast radius algorithm:
1. Traverses the graph outward (and optionally inward) through typed edges
2. Collects all transitively reachable nodes up to a configurable depth
3. Groups them by **cluster** and **file**
4. Returns a ranked, deduplicated impact list

Target: **< 100ms** for typical codebases (< 5 000 nodes, depth ≤ 5).

---

## Command

```bash
/codebase-graph blast-radius --file app/Models/User.php
/codebase-graph blast-radius --file app/Http/Controllers/UserController.php --method index
/codebase-graph blast-radius --file src/components/UserCard.tsx
/codebase-graph blast-radius --node <node_id>
/codebase-graph blast-radius --file X --depth 3          # override max depth (default 5)
/codebase-graph blast-radius --file X --direction both   # upstream + downstream (default: downstream)
```

---

## Algorithm

### Step 1 — Seed Nodes

Identify all graph nodes that belong to the changed file:

```python
def get_seed_nodes(conn, file_path: str, method_name: str = None) -> list[str]:
    nodes = get_file_nodes(conn, file_path)   # from 05-graph-storage
    if method_name:
        # Filter to the specific method node if provided
        nodes = [n for n in nodes if n['name'].endswith(f'::{method_name}')]
    return [n['id'] for n in nodes]
```

### Step 2 — BFS Traversal

```python
from collections import deque

def compute_blast_radius(
    conn,
    seed_ids: list[str],
    max_depth: int = 5,
    direction: str = 'downstream'   # 'downstream' | 'upstream' | 'both'
) -> dict[str, dict]:
    """
    Returns: { node_id: { node, depth, path, edge_types_traversed } }
    """
    visited = {}   # node_id → {depth, path}
    queue   = deque()

    for sid in seed_ids:
        queue.append((sid, 0, [sid]))

    while queue:
        current_id, depth, path = queue.popleft()

        if current_id in visited:
            continue
        if depth > max_depth:
            continue

        visited[current_id] = {
            'node':  get_node(conn, current_id),
            'depth': depth,
            'path':  path
        }

        # Determine traversal direction
        edges = []
        if direction in ('downstream', 'both'):
            edges += get_outbound_edges(conn, current_id)
        if direction in ('upstream', 'both'):
            edges += get_inbound_edges(conn, current_id)

        for edge in edges:
            neighbor_id = edge['to_id'] if direction == 'downstream' else edge['from_id']
            if neighbor_id not in visited:
                queue.append((neighbor_id, depth + 1, path + [neighbor_id]))

    return visited
```

### Step 3 — Edge-Type Weights (Priority Ordering)

Not all edges carry equal blast risk. Apply weights when **sorting** the impact report:

| Edge Type | Weight | Rationale |
|-----------|--------|-----------|
| `BACKED_BY` (model→migration) | 10 | Schema change = DB migration |
| `HAS_MANY` / `BELONGS_TO` | 9 | Relationship change cascades across features |
| `HANDLED_BY` (route→controller) | 8 | Route change breaks API contract |
| `CALLS_API` (frontend→route) | 8 | Frontend breaks if route changes |
| `QUERIES` (controller→model) | 7 | Query change affects data shape |
| `RENDERS` (component→component) | 6 | Visual regression risk |
| `USES_HOOK` | 5 | Logic change propagates |
| `DEPENDS_ON` | 4 | Service-level coupling |
| `PROTECTED_BY` | 3 | Auth change — lower structural risk |
| `OBSERVED_BY` | 3 | Side-effect risk |

```python
EDGE_WEIGHTS = {
    'BACKED_BY': 10, 'HAS_MANY': 9, 'BELONGS_TO': 9, 'BELONGS_TO_MANY': 9,
    'HANDLED_BY': 8, 'CALLS_API': 8, 'QUERIES': 7, 'RENDERS': 6,
    'USES_HOOK': 5, 'DEPENDS_ON': 4, 'PROTECTED_BY': 3, 'OBSERVED_BY': 3,
}

def score_node(node_entry: dict, edges_traversed: list) -> float:
    base = 1.0 / (node_entry['depth'] + 1)   # closer = higher score
    edge_bonus = max((EDGE_WEIGHTS.get(e, 1) for e in edges_traversed), default=1)
    pagerank_bonus = node_entry['node'].get('pagerank', 0.0)
    return base * edge_bonus + pagerank_bonus
```

### Step 4 — Cluster-Aware Pruning

Nodes in the **same Louvain cluster** as the seed are more likely to be co-changed.  
Nodes in **distant clusters** are lower priority.

```python
def cluster_score_adjustment(seed_cluster: int, node_cluster: int) -> float:
    if node_cluster == seed_cluster:
        return 1.5    # boost: same architectural domain
    return 1.0        # neutral
```

---

## Output Structure

```python
@dataclass
class BlastRadiusReport:
    changed_file:    str
    seed_nodes:      list[dict]
    total_affected:  int
    by_depth:        dict[int, list[dict]]   # depth → nodes at that depth
    by_file:         dict[str, list[dict]]   # file_path → nodes in that file
    high_risk_edges: list[dict]              # edges with weight >= 8
    files_to_review: list[str]              # unique sorted list of file paths
```

### Console Output

```
Blast Radius — app/Models/User.php
════════════════════════════════════════════════════════
Seed nodes (3):  User [model]  ·  UserObserver [observer]  ·  ...

Depth 1 — Direct dependents (8 nodes across 6 files):
  ⚠  app/Http/Controllers/UserController.php    [QUERIES]
  ⚠  app/Http/Controllers/AuthController.php    [QUERIES]
     app/Observers/UserObserver.php              [OBSERVED_BY]
     app/Http/Resources/UserResource.php         [TRANSFORMS_VIA]
     ...

Depth 2 — Indirect dependents (14 nodes across 9 files):
  ⚠  routes/api.php (Route: GET /api/users)     [HANDLED_BY]
     src/hooks/useUsers.ts                       [CALLS_API]
     src/components/UserTable.tsx                [USES_HOOK]
     ...

Depth 3 — (5 more nodes — run with --depth 4 to expand)

Files requiring review (15 total):
  CRITICAL  app/Models/User.php                  ← origin
  HIGH      app/Http/Controllers/UserController.php
  HIGH      routes/api.php
  HIGH      src/hooks/useUsers.ts
  MEDIUM    src/components/UserTable.tsx
  MEDIUM    src/components/UserCard.tsx
  LOW       src/pages/users/page.tsx
  ...
════════════════════════════════════════════════════════
```

---

## Risk Level Classification

| Level | Criteria |
|-------|----------|
| CRITICAL | The seed node itself |
| HIGH | Depth 1 OR edge weight ≥ 8 |
| MEDIUM | Depth 2 OR edge weight 5–7 |
| LOW | Depth 3+ AND edge weight < 5 |

---

## Automated Pre-Prompt Blast Radius

When the AI model is about to modify a file (triggered by the user's prompt), the system **automatically runs** a blast radius check and prepends the report to the model's working context.

```python
def pre_prompt_blast_radius(conn, files_mentioned_in_prompt: list[str]) -> str:
    reports = []
    for f in files_mentioned_in_prompt:
        if not Path(f).exists():
            continue
        seed_ids = get_seed_nodes(conn, f)
        result   = compute_blast_radius(conn, seed_ids, max_depth=3)
        reports.append(format_compact_report(result))

    return "\n".join(reports)
```

**Compact format** (for prepending to prompts — token-efficient):

```
[BLAST RADIUS: app/Models/User.php]
Files to check: UserController.php · AuthController.php · UserResource.php
                routes/api.php · useUsers.ts · UserTable.tsx · UserCard.tsx
High-risk edges: QUERIES(×4) CALLS_API(×2) HANDLED_BY(×1)
```

---

## Critical Rules

- **Always run blast radius before modifying any file.** Store the report in context.
- **Max depth = 5** for interactive use. Use depth 3 for compact pre-prompt injection.
- **Circular edges exist** (e.g. model → model via polymorphic). The `visited` set prevents infinite loops — never remove it.
- **Frontend-only changes** (components with no API calls) have bounded blast radius within the frontend cluster. Do not traverse into backend nodes unless a `CALLS_API` edge is found.
- **Migration changes are highest priority.** Any change to a migration file must surface the corresponding Model and all Controllers that query that model.
- **The blast radius report is not a to-do list** — it is a review checklist. Not all affected files need to be changed; they need to be verified for compatibility.
