---
name: codebase-graph-storage
description: "Use this skill for all SQLite read/write operations on the codebase graph. Covers the full schema (nodes, edges, clusters, pagerank, tailwind_classes, api_calls, file_hashes), connection setup, query helpers, and performance guidelines. Must be read before writing any data to graph.db. All other skills in this library call into this one — it is the single source of truth for the data layer."
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


# Graph Storage — SQLite Schema & Query Reference

## Overview

All graph data lives in `.codebase-graph/graph.db`.  
SQLite in WAL mode is used for concurrent reads during live-sync.  
Target: structural queries complete in **< 100ms**.

---

## Connection Setup

```python
import sqlite3, json
from pathlib import Path

DB_PATH = Path('.codebase-graph/graph.db')

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA cache_size=-64000")   # 64 MB page cache
    conn.execute("PRAGMA synchronous=NORMAL")  # Safe + fast with WAL
    return conn
```

---

## Schema Init

Run `schema_init()` exactly once during `init` Phase 0.

```sql
-- ─── Core Nodes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nodes (
    id          TEXT PRIMARY KEY,        -- SHA1(node_type:file_path:name)
    node_type   TEXT NOT NULL,           -- see NODE_TYPES below
    name        TEXT NOT NULL,           -- class/function/route name
    file_path   TEXT NOT NULL,           -- relative to repo root
    line_start  INTEGER,
    line_end    INTEGER,
    metadata    TEXT DEFAULT '{}',       -- JSON blob (type-specific fields)
    cluster_id  INTEGER,                 -- Louvain community id
    pagerank    REAL DEFAULT 0.0,        -- PageRank hotspot score
    dead_candidate INTEGER DEFAULT 0,   -- 1 if no inbound edges after bridge
    last_indexed TEXT                    -- ISO timestamp
);

-- ─── Edges ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS edges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    to_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    edge_type   TEXT NOT NULL,           -- see EDGE_TYPES below
    metadata    TEXT DEFAULT '{}',       -- JSON (method, url, line, etc.)
    UNIQUE(from_id, to_id, edge_type)    -- no duplicate edges
);

-- ─── File Hashes (for incremental sync) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS file_hashes (
    file_path   TEXT PRIMARY KEY,
    mtime       REAL NOT NULL,           -- os.path.getmtime()
    sha256      TEXT NOT NULL,           -- full content hash
    last_indexed TEXT NOT NULL
);

-- ─── Tailwind Classes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tailwind_classes (
    class_name       TEXT PRIMARY KEY,
    first_seen_file  TEXT
);

CREATE TABLE IF NOT EXISTS node_tailwind (
    node_id    TEXT REFERENCES nodes(id) ON DELETE CASCADE,
    class_name TEXT REFERENCES tailwind_classes(class_name),
    PRIMARY KEY (node_id, class_name)
);

-- ─── API Call Staging (bridge phase) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_calls_staging (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path       TEXT NOT NULL,
    line            INTEGER,
    method          TEXT NOT NULL,       -- GET POST PUT PATCH DELETE
    url_raw         TEXT NOT NULL,
    url_normalised  TEXT NOT NULL,
    matched_route_id TEXT REFERENCES nodes(id)
);
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_nodes_type      ON nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_nodes_file      ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_cluster   ON nodes(cluster_id);
CREATE INDEX IF NOT EXISTS idx_edges_from      ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to        ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_type      ON edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_file_hashes     ON file_hashes(file_path);
```

---

## Node Types Reference

```
Backend:   migration | model | controller | observer | provider
           job | event | listener | middleware | route
           form_request | resource | service | policy

Frontend:  component | page | layout | hook | store | lib | type_def

Bridge:    (edges only — no dedicated node type)
```

---

## Edge Types Reference

```
Backend:
  CREATES_TABLE      migration    → table (logical)
  DEPENDS_ON         migration    → migration
  BACKED_BY          model        → migration
  HAS_MANY           model        → model
  BELONGS_TO         model        → model
  BELONGS_TO_MANY    model        → model
  HAS_ONE            model        → model
  MORPH_TO           model        → model (polymorphic)
  OBSERVED_BY        model        → observer
  QUERIES            controller   → model
  VALIDATED_BY       controller   → form_request
  TRANSFORMS_VIA     controller   → resource
  DEPENDS_ON         controller   → service
  DISPATCHES         controller   → job
  FIRES              controller   → event
  HANDLED_BY         route        → controller (method-level)
  PROTECTED_BY       route        → middleware
  TRIGGERS           event        → listener
  BINDS              provider     → service

Frontend:
  RENDERS            component    → component
  USES_HOOK          component    → hook
  USES_HOOK          page         → hook
  READS_STORE        component    → store
  USES               page         → component
  WRAPPED_BY         page         → layout
  PARAMETERISED_BY   page         → type_def
  MIRRORS            store        → model

Bridge:
  CALLS_API          hook/page/component → route
```

---

## Node ID Generation

```python
import hashlib

def make_node_id(node_type: str, file_path: str, name: str) -> str:
    key = f"{node_type}:{file_path}:{name}"
    return hashlib.sha1(key.encode()).hexdigest()
```

Using a deterministic ID means the same logical node always gets the same ID — safe for upserts and incremental sync.

---

## Upsert Pattern

Always use `INSERT OR REPLACE` (or `ON CONFLICT DO UPDATE`) when writing nodes — never assume a node doesn't exist.

```python
def upsert_node(conn, node: dict):
    conn.execute("""
        INSERT INTO nodes (id, node_type, name, file_path, line_start, line_end, metadata, last_indexed)
        VALUES (:id, :node_type, :name, :file_path, :line_start, :line_end, :metadata, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            name        = excluded.name,
            line_start  = excluded.line_start,
            line_end    = excluded.line_end,
            metadata    = excluded.metadata,
            last_indexed = excluded.last_indexed
    """, {**node, 'metadata': json.dumps(node.get('metadata', {}))})

def upsert_edge(conn, from_id: str, to_id: str, edge_type: str, meta: dict = {}):
    conn.execute("""
        INSERT OR IGNORE INTO edges (from_id, to_id, edge_type, metadata)
        VALUES (?, ?, ?, json(?))
    """, (from_id, to_id, edge_type, json.dumps(meta)))
```

---

## Common Query Helpers

```python
def get_node(conn, node_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM nodes WHERE id = ?", (node_id,)).fetchone()
    return dict(row) if row else None

def get_neighbours(conn, node_id: str, direction='both', edge_types=None) -> list:
    """Return all directly connected nodes."""
    wheres, params = [], [node_id, node_id]
    if edge_types:
        placeholders = ','.join('?' * len(edge_types))
        wheres.append(f"e.edge_type IN ({placeholders})")
        params += edge_types * 2
    where_clause = ('AND ' + ' AND '.join(wheres)) if wheres else ''

    if direction == 'both':
        q = f"""
            SELECT n.*, e.edge_type, e.from_id, e.to_id FROM nodes n
            JOIN edges e ON (e.to_id = n.id AND e.from_id = ? OR e.from_id = n.id AND e.to_id = ?)
            WHERE 1=1 {where_clause}
        """
    elif direction == 'out':
        q = f"SELECT n.*, e.edge_type FROM nodes n JOIN edges e ON e.to_id=n.id WHERE e.from_id=? {where_clause}"
        params = [node_id] + (edge_types or [])
    else:  # in
        q = f"SELECT n.*, e.edge_type FROM nodes n JOIN edges e ON e.from_id=n.id WHERE e.to_id=? {where_clause}"
        params = [node_id] + (edge_types or [])
    return [dict(r) for r in conn.execute(q, params)]

def get_file_nodes(conn, file_path: str) -> list:
    return [dict(r) for r in conn.execute(
        "SELECT * FROM nodes WHERE file_path = ?", (file_path,)
    )]
```

---

## Performance Guidelines

| Query Type | Target | Approach |
|-----------|--------|----------|
| Node lookup by id | < 1ms | Primary key |
| Neighbours (1-hop) | < 5ms | Indexed `from_id` / `to_id` |
| Subgraph (2-3 hops) | < 50ms | Recursive CTE with depth limit |
| Full blast radius | < 100ms | BFS with visited set, depth ≤ 5 |
| Cluster members | < 10ms | Indexed `cluster_id` |
| File → nodes | < 5ms | Indexed `file_path` |

```sql
-- Recursive BFS for blast radius (depth-limited)
WITH RECURSIVE reachable(id, depth) AS (
    SELECT ?, 0
    UNION
    SELECT e.to_id, r.depth + 1
    FROM edges e
    JOIN reachable r ON e.from_id = r.id
    WHERE r.depth < 5
)
SELECT DISTINCT n.* FROM nodes n JOIN reachable r ON n.id = r.id;
```

---

## Deletion on File Remove

When a file is deleted from the codebase, cascade-delete all its nodes (edges auto-cascade via FK):

```python
def delete_file_nodes(conn, file_path: str):
    conn.execute("DELETE FROM nodes WHERE file_path = ?", (file_path,))
    conn.execute("DELETE FROM file_hashes WHERE file_path = ?", (file_path,))
    conn.commit()
```

---

## Critical Rules

- **Never store file contents** in the graph — paths and line numbers only.
- **Always commit in batches.** Wrap per-file parsing in a single transaction; do not auto-commit per node.
- **WAL mode must always be on.** The file watcher writes while the AI reads.
- **JSON metadata is opaque** to the schema — parse it in application code, not SQL.
- **SHA1 node IDs are collision-safe** for codebase sizes (< 100k nodes). If a project has > 500k nodes, switch to SHA256 prefix.
- **Foreign key enforcement** (`PRAGMA foreign_keys=ON`) must be set per connection, not globally.
