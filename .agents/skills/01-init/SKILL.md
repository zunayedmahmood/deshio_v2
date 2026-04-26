---
name: codebase-graph-init
description: "Use this skill when running `/codebase-graph init` to bootstrap a new graph session for a Laravel/Next.js/Tailwind monorepo or separate repos. Covers stack detection, SQLite schema creation, Tree-sitter parser installation, and phased indexing orchestration. Trigger when the user wants to initialise the codebase graph for the first time, or re-initialise after major structural changes."
---

# Codebase Graph — Init

## Purpose

Bootstraps the static analysis graph for a Laravel (backend) + Next.js/Tailwind (frontend) codebase.  
All graph data is stored locally in `.codebase-graph/graph.db` (SQLite).  
On first run every file is parsed, every relation is extracted, and the graph is fully populated.

---

## Command Signature

```bash
/codebase-graph init              # Full-stack (backend + frontend + bridge)
/codebase-graph init -b           # Backend only  (Laravel)
/codebase-graph init -f           # Frontend only (Next.js / Tailwind)
/codebase-graph init --reset      # Wipe graph.db and re-index from scratch
/codebase-graph init --dry-run    # Detect stack, print plan, do not write
```

---

## Stack Auto-Detection

Run these checks **in order** before any indexing begins.

| Signal | Detected Stack |
|--------|---------------|
| `composer.json` with `laravel/framework` | Backend: Laravel |
| `artisan` file in root | Backend: Laravel (confirm) |
| `package.json` with `next` dependency | Frontend: Next.js |
| `tailwind.config.*` present | Frontend: Tailwind confirmed |
| Both sets detected | Full-stack mode |

```python
# Detection pseudocode
def detect_stack(root: Path) -> dict:
    backend  = (root / "artisan").exists() or _has_dep(root / "composer.json", "laravel/framework")
    frontend = _has_dep(root / "package.json", "next")
    tailwind = bool(list(root.glob("tailwind.config.*")))
    return {"backend": backend, "frontend": frontend, "tailwind": tailwind}
```

---

## Directory Layout Created

```
.codebase-graph/
├── graph.db            ← SQLite: all nodes, edges, metadata
├── graph.db-wal        ← WAL journal (auto-managed)
├── config.json         ← stack config, root paths, last-indexed timestamps
├── parsers/            ← compiled Tree-sitter grammars (PHP, JS/TS)
├── cache/              ← per-file AST caches (invalidated on mtime change)
└── logs/
    └── init.log
```

---

## Initialisation Phases

The AI model **must execute these phases in strict order**.  
Each phase builds on the previous one. Do not skip or reorder.

### Phase 0 — Environment Setup
1. Create `.codebase-graph/` directory at the repo root.
2. Write `config.json` with detected stack, root paths, and timestamp.
3. Install / verify Tree-sitter grammars (see `02-backend-analysis/SKILL.md` and `03-frontend-analysis/SKILL.md`).
4. Run `05-graph-storage/SKILL.md` → `schema_init()` to create SQLite tables.

### Phase 1 — Backend Indexing (if `-b` or full-stack)
Execute in this exact sub-order (each step is a separate command listed in `02-backend-analysis/SKILL.md`):
```
1a. Migrations  →  extract table schemas, column types, indexes, FKs
1b. Models      →  $fillable, $casts, relationships (hasMany, belongsTo, etc.)
1c. Controllers →  methods, route binding, calls to models/services
1d. Observers, Providers, Jobs, Events, Listeners, Middleware, Policies
1e. Routes      →  web.php, api.php  →  map URI + verb → controller@method
```

### Phase 2 — Frontend Indexing (if `-f` or full-stack)
```
2a. Components  →  props interface, emitted events, imported subcomponents
2b. Pages       →  route segment, data-fetching pattern (SSR/SSG/CSR), components used
```

### Phase 3 — API Bridge (full-stack only)
```
3.  Map every frontend fetch/axios/useQuery call → backend route → controller@method
    (see 04-api-bridge/SKILL.md)
```

### Phase 4 — Finalise
1. Compute Louvain community clusters → store `cluster_id` on every node.
2. Compute PageRank hotspot scores → store `pagerank` on every node.
3. Build reachability index for dead-code detection.
4. Write final stats to `config.json`: node count, edge count, duration.
5. Print summary to stdout.

---

## config.json Schema

```json
{
  "version": 1,
  "stack": { "backend": true, "frontend": true, "tailwind": true },
  "roots": {
    "backend":  "./",
    "frontend": "./"
  },
  "last_init":    "2025-01-01T00:00:00Z",
  "last_sync":    "2025-01-01T00:00:00Z",
  "node_count":   0,
  "edge_count":   0,
  "watch_active": false
}
```

---

## Output (stdout on success)

```
✓ Stack detected   : Laravel 11  +  Next.js 14  +  Tailwind 3
✓ SQLite schema    : .codebase-graph/graph.db
✓ Backend indexed  : 312 nodes  (migrations:14  models:28  controllers:41  routes:87 ...)
✓ Frontend indexed : 198 nodes  (components:112  pages:34  hooks:22 ...)
✓ API bridge       : 67 edges mapped (frontend → backend)
✓ Clusters         : 8 Louvain communities
✓ PageRank         : computed
✓ Total time       : 4.2s
  Run `/codebase-graph read` to load context for your next prompt.
```

---

## Critical Rules

- **Always read** `05-graph-storage/SKILL.md` before writing anything to SQLite.
- **Never re-parse** a file whose `mtime` matches the cached value in `graph.db` — use the cached AST.
- **Phase order is mandatory.** Models must be indexed before Controllers; Components before Pages.
- If `--reset` is not passed and `graph.db` exists, print a warning and exit rather than overwriting silently.
- The graph **must not** store file contents — only structural metadata (paths, names, line numbers, types, relations).
- For monorepos where backend and frontend share the same root, use path-prefix filtering (`app/`, `database/` for Laravel; `src/`, `pages/`, `components/` for Next).
