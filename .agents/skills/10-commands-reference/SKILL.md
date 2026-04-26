---
name: codebase-graph-commands-reference
description: "Use this skill as the master reference for all /codebase-graph commands, their options, the correct skill file to consult for each, and the daily workflow the AI model should follow. Trigger when the user asks 'what commands are available', 'how do I use codebase-graph', or when the AI model needs to decide which other skill to read. This is the entry-point skill for the entire library."
---

# Commands Reference — Master Index

## Daily AI Model Workflow

```
Before EVERY prompt involving code:
  1. /codebase-graph read               ← Load context (always)
  2. /codebase-graph blast-radius --file <files you'll touch>   ← Before modifying
  3. Make changes
  4. (Graph auto-updates via watcher)
```

---

## Full Command Index

### Initialisation

| Command | Description | Skill |
|---------|-------------|-------|
| `/codebase-graph init` | Full-stack init (backend + frontend + bridge) | `01-init/SKILL.md` |
| `/codebase-graph init -b` | Backend only (Laravel) | `01-init/SKILL.md` |
| `/codebase-graph init -f` | Frontend only (Next.js) | `01-init/SKILL.md` |
| `/codebase-graph init --reset` | Wipe graph.db and re-index | `01-init/SKILL.md` |
| `/codebase-graph init --dry-run` | Detect stack, print plan only | `01-init/SKILL.md` |

### Indexing (partial, on-demand)

| Command | Description | Skill |
|---------|-------------|-------|
| `/codebase-graph index-backend` | Re-index entire backend | `02-backend-analysis/SKILL.md` |
| `/codebase-graph index-backend --step migrations` | Migrations only | `02-backend-analysis/SKILL.md` |
| `/codebase-graph index-backend --step models` | Models only | `02-backend-analysis/SKILL.md` |
| `/codebase-graph index-backend --step controllers` | Controllers only | `02-backend-analysis/SKILL.md` |
| `/codebase-graph index-backend --step observers,providers,jobs` | Support layers | `02-backend-analysis/SKILL.md` |
| `/codebase-graph index-backend --step routes` | Routes only | `02-backend-analysis/SKILL.md` |
| `/codebase-graph index-frontend` | Re-index entire frontend | `03-frontend-analysis/SKILL.md` |
| `/codebase-graph index-frontend --step components` | Components only | `03-frontend-analysis/SKILL.md` |
| `/codebase-graph index-frontend --step pages` | Pages only | `03-frontend-analysis/SKILL.md` |
| `/codebase-graph index-frontend --step hooks` | Hooks only | `03-frontend-analysis/SKILL.md` |
| `/codebase-graph index-bridge` | Re-map frontend→backend API calls | `04-api-bridge/SKILL.md` |
| `/codebase-graph index-bridge --report` | Show unmapped calls | `04-api-bridge/SKILL.md` |

### Live Sync

| Command | Description | Skill |
|---------|-------------|-------|
| `/codebase-graph watch` | Start file watcher (foreground) | `07-live-sync/SKILL.md` |
| `/codebase-graph watch --daemon` | Start as background process | `07-live-sync/SKILL.md` |
| `/codebase-graph watch --stop` | Stop background watcher | `07-live-sync/SKILL.md` |
| `/codebase-graph watch --status` | Watcher status + last sync | `07-live-sync/SKILL.md` |

### Context Reading (primary AI command)

| Command | Description | Skill |
|---------|-------------|-------|
| `/codebase-graph read` | Full architecture summary | `08-query-read/SKILL.md` |
| `/codebase-graph read --file <path>` | Subgraph around a specific file | `08-query-read/SKILL.md` |
| `/codebase-graph read --query <term>` | Semantic cluster search | `08-query-read/SKILL.md` |
| `/codebase-graph read --cluster <id>` | All nodes in a Louvain cluster | `08-query-read/SKILL.md` |
| `/codebase-graph read --hotspots` | Top-20 PageRank nodes | `08-query-read/SKILL.md` |
| `/codebase-graph read --budget <tokens>` | Set token budget (default: 4000) | `08-query-read/SKILL.md` + `09-token-optimization/SKILL.md` |

### Blast Radius

| Command | Description | Skill |
|---------|-------------|-------|
| `/codebase-graph blast-radius --file <path>` | Impact of changing a file | `06-blast-radius/SKILL.md` |
| `/codebase-graph blast-radius --file <path> --method <name>` | Impact of changing a specific method | `06-blast-radius/SKILL.md` |
| `/codebase-graph blast-radius --node <id>` | Impact by node ID | `06-blast-radius/SKILL.md` |
| `/codebase-graph blast-radius --file <path> --depth <n>` | Custom depth (default: 5) | `06-blast-radius/SKILL.md` |
| `/codebase-graph blast-radius --file <path> --direction both` | Upstream + downstream | `06-blast-radius/SKILL.md` |

### Inspection & Debugging

| Command | Description | Skill |
|---------|-------------|-------|
| `/codebase-graph stats` | Node/edge counts, cluster sizes, dead candidates | `05-graph-storage/SKILL.md` |
| `/codebase-graph dead-code` | List dead candidates (no inbound edges) | `04-api-bridge/SKILL.md` + `05-graph-storage/SKILL.md` |
| `/codebase-graph hotspots` | Top nodes by PageRank | `08-query-read/SKILL.md` |
| `/codebase-graph clusters` | List all Louvain clusters with summaries | `08-query-read/SKILL.md` |
| `/codebase-graph verify` | Check graph integrity (dangling edges, missing nodes) | `05-graph-storage/SKILL.md` |

---

## Init Phase Order (Always Enforced)

```
Phase 0:  Environment setup + SQLite schema
          ↓
Phase 1a: Migrations
          ↓
Phase 1b: Models          (needs migration nodes)
          ↓
Phase 1c: Controllers     (needs model nodes)
          ↓
Phase 1d: Observers, Providers, Jobs, Events, Listeners, Middleware
          ↓
Phase 1e: Routes          (needs controller nodes)
          ↓
Phase 2a: Components      (frontend, independent of backend)
          ↓
Phase 2b: Pages           (needs component nodes)
          ↓
Phase 3:  API Bridge      (needs ALL backend routes + ALL frontend hooks/pages)
          ↓
Phase 4:  Louvain + PageRank + Reachability index
```

---

## Skill File Decision Tree

```
User runs a command →
  init?              → read 01-init/SKILL.md
  index-backend?     → read 02-backend-analysis/SKILL.md
  index-frontend?    → read 03-frontend-analysis/SKILL.md
  index-bridge?      → read 04-api-bridge/SKILL.md
  Need to write DB?  → read 05-graph-storage/SKILL.md (always)
  blast-radius?      → read 06-blast-radius/SKILL.md
  watch?             → read 07-live-sync/SKILL.md
  read?              → read 08-query-read/SKILL.md
  Token limit hit?   → read 09-token-optimization/SKILL.md
  Unknown command?   → read this file (10-commands-reference)
```

---

## Edge Type Quick Reference

```
Backend edges:
  CREATES_TABLE · DEPENDS_ON · BACKED_BY
  HAS_MANY · BELONGS_TO · BELONGS_TO_MANY · HAS_ONE · MORPH_TO
  OBSERVED_BY · QUERIES · VALIDATED_BY · TRANSFORMS_VIA
  DISPATCHES · FIRES · HANDLED_BY · PROTECTED_BY · TRIGGERS · BINDS

Frontend edges:
  RENDERS · USES_HOOK · READS_STORE · USES · WRAPPED_BY
  PARAMETERISED_BY · MIRRORS

Bridge edges:
  CALLS_API
```

---

## Node Type Quick Reference

```
Backend:   migration · model · controller · observer · provider
           job · event · listener · middleware · route
           form_request · resource · service · policy

Frontend:  component · page · layout · hook · store · lib · type_def
```

---

## Graph File Locations

```
.codebase-graph/
  graph.db          ← All graph data (SQLite WAL mode)
  config.json       ← Stack config, root paths, stats
  parsers/          ← Compiled Tree-sitter grammars
  cache/            ← Per-file AST caches
  logs/
    init.log        ← Init run log
    sync.log        ← Live sync event log
  watch.pid         ← Background watcher PID (if --daemon)
```

---

## Absolute Rules for the AI Model

1. **Read `08-query-read/SKILL.md` and run `/codebase-graph read` before any code-touching prompt.**
2. **Read `06-blast-radius/SKILL.md` and run blast-radius before modifying any file.**
3. **Read `05-graph-storage/SKILL.md` before writing anything to graph.db.**
4. **Respect the init phase order.** Models before Controllers. Components before Pages. Everything before Bridge.
5. **Never store file contents in the graph.** Structure only.
6. **Never skip the watched-extensions filter.** Only `.php`, `.ts`, `.tsx`, `.js`, `.jsx` are indexed.
7. **Never traverse into `vendor/` or `node_modules/`.** These are not part of the application graph.
8. **The graph is the source of truth**, not training-data memory, not directory listings.
9. **Token budget is a hard ceiling.** Trim context aggressively; a focused graph beats a bloated one.
10. **When in doubt, check the graph.** Don't assume — query.
