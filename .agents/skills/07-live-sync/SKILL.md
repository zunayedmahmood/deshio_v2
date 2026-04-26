---
name: codebase-graph-live-sync
description: "Use this skill to understand and operate the live file-watching system that keeps graph.db up to date as the codebase changes. Covers the file watcher setup (watchdog/chokidar), incremental re-indexing on file save, graph diff application, and the mtime/SHA256 cache-invalidation strategy. Trigger when the user asks about auto-updating the graph, when setting up the watcher for the first time, or when diagnosing stale graph data."
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


# Live Sync — Incremental Graph Updates

## Overview

After `init`, a background file watcher monitors the codebase for changes.  
On every file save, only the **changed file's nodes and edges are re-indexed** — the rest of the graph is untouched.  
This keeps the graph fresh without the cost of a full re-index.

---

## Command

```bash
/codebase-graph watch          # Start file watcher (foreground)
/codebase-graph watch --daemon # Start as background process (writes PID to .codebase-graph/watch.pid)
/codebase-graph watch --stop   # Stop the background watcher
/codebase-graph watch --status # Show watcher status + last sync time
```

---

## Technology Choices

| Environment | Watcher Library |
|-------------|----------------|
| Python backend | `watchdog` (`pip install watchdog`) |
| Node.js process | `chokidar` (`npm install chokidar`) |
| IDE extension | Native file-system events via extension API |

Use whichever is available. The graph update logic is identical regardless.

---

## File Watcher Setup (Python / watchdog)

```python
from watchdog.observers import Observer
from watchdog.events    import FileSystemEventHandler
import time

WATCHED_EXTENSIONS = {'.php', '.ts', '.tsx', '.js', '.jsx'}
IGNORED_DIRS = {'vendor', 'node_modules', '.next', 'out', '.turbo',
                'storage', 'bootstrap/cache', '.codebase-graph'}

class GraphSyncHandler(FileSystemEventHandler):

    def __init__(self, conn, config):
        self.conn   = conn
        self.config = config

    def on_modified(self, event):
        if not event.is_directory:
            self._handle(event.src_path)

    def on_created(self, event):
        if not event.is_directory:
            self._handle(event.src_path)

    def on_deleted(self, event):
        if not event.is_directory:
            self._handle_delete(event.src_path)

    def on_moved(self, event):
        self._handle_delete(event.src_path)
        self._handle(event.dest_path)

    def _handle(self, abs_path: str):
        rel_path = to_relative(abs_path)
        ext      = Path(abs_path).suffix

        if ext not in WATCHED_EXTENSIONS:
            return
        if any(part in IGNORED_DIRS for part in Path(abs_path).parts):
            return

        sync_file(self.conn, self.config, rel_path)

    def _handle_delete(self, abs_path: str):
        rel_path = to_relative(abs_path)
        delete_file_nodes(self.conn, rel_path)   # from 05-graph-storage


def start_watcher(repo_root: str, conn, config):
    handler  = GraphSyncHandler(conn, config)
    observer = Observer()
    observer.schedule(handler, repo_root, recursive=True)
    observer.start()
    config['watch_active'] = True
    print("✓ File watcher active")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
```

---

## Incremental Sync Core — `sync_file()`

```python
import hashlib, os, json
from pathlib import Path

def sync_file(conn, config, rel_path: str):
    """
    Re-index a single file. Only proceeds if file content has changed.
    """
    abs_path = Path(config['repo_root']) / rel_path

    if not abs_path.exists():
        return

    # ── Cache Invalidation ─────────────────────────────────────
    current_mtime  = os.path.getmtime(abs_path)
    current_sha256 = sha256_file(abs_path)

    cached = conn.execute(
        "SELECT mtime, sha256 FROM file_hashes WHERE file_path = ?", (rel_path,)
    ).fetchone()

    if cached and cached['mtime'] == current_mtime and cached['sha256'] == current_sha256:
        return   # File unchanged — skip entirely

    # ── Determine File Type ────────────────────────────────────
    parser_fn = classify_file(rel_path, config)
    if parser_fn is None:
        return   # Not an indexed file type

    # ── Remove Stale Nodes ────────────────────────────────────
    # Delete all nodes (and their edges via CASCADE) for this file.
    # Then re-insert fresh nodes below.
    conn.execute("DELETE FROM nodes WHERE file_path = ?", (rel_path,))

    # ── Re-Parse and Insert ───────────────────────────────────
    with conn:   # transaction
        new_nodes, new_edges = parser_fn(abs_path, rel_path)

        for node in new_nodes:
            upsert_node(conn, node)

        for edge in new_edges:
            upsert_edge(conn, **edge)

        # Update hash cache
        conn.execute("""
            INSERT INTO file_hashes (file_path, mtime, sha256, last_indexed)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(file_path) DO UPDATE SET
                mtime        = excluded.mtime,
                sha256       = excluded.sha256,
                last_indexed = excluded.last_indexed
        """, (rel_path, current_mtime, current_sha256))

    # ── Partial Bridge Re-Mapping ─────────────────────────────
    # If this file is a hook/page/component, re-run API bridge for just this file.
    # If this file is a routes file or controller, re-run the reverse mapping.
    if is_frontend_file(rel_path):
        remap_api_calls_for_file(conn, rel_path)
    elif is_route_file(rel_path):
        remap_routes_for_file(conn, rel_path)

    log_sync(rel_path, len(new_nodes), len(new_edges))
```

---

## File Classifier

```python
def classify_file(rel_path: str, config: dict):
    """Return the correct parser function for a given file path."""
    p = Path(rel_path)

    # Backend (Laravel)
    if rel_path.startswith('database/migrations/') and p.suffix == '.php':
        return parse_migration
    if rel_path.startswith('app/Models/') and p.suffix == '.php':
        return parse_model
    if rel_path.startswith('app/Http/Controllers/') and p.suffix == '.php':
        return parse_controller
    if rel_path.startswith('app/Observers/') and p.suffix == '.php':
        return parse_observer
    if rel_path.startswith('app/Jobs/') and p.suffix == '.php':
        return parse_job
    if rel_path.startswith('app/Providers/') and p.suffix == '.php':
        return parse_provider
    if rel_path.startswith('app/Events/') and p.suffix == '.php':
        return parse_event
    if rel_path.startswith('app/Listeners/') and p.suffix == '.php':
        return parse_listener
    if rel_path.startswith('app/Http/Middleware/') and p.suffix == '.php':
        return parse_middleware
    if rel_path in ('routes/web.php', 'routes/api.php', 'routes/channels.php'):
        return parse_routes

    # Frontend (Next.js)
    if p.suffix in ('.tsx', '.jsx'):
        if '/components/' in rel_path:
            return parse_component
        if is_next_page(rel_path):
            return parse_page
        return parse_component   # default to component for unknown TSX

    if p.suffix in ('.ts', '.js'):
        if '/hooks/use' in rel_path:
            return parse_hook
        if '/stores/' in rel_path or '/store/' in rel_path:
            return parse_store
        return None   # lib files not indexed at method level

    return None

def is_next_page(rel_path: str) -> bool:
    # App Router
    if re.search(r'src/app/.+/page\.tsx?$', rel_path):
        return True
    # Pages Router
    if re.search(r'src/pages/.+\.tsx?$', rel_path):
        return True
    return False
```

---

## SHA256 Helper

```python
def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()
```

---

## Sync Log

Every sync event is appended to `.codebase-graph/logs/sync.log`:

```
2025-01-01T12:00:01Z  MODIFIED  app/Models/User.php           +3 nodes  +5 edges  12ms
2025-01-01T12:00:03Z  MODIFIED  src/hooks/useUsers.ts         +1 nodes  +2 edges  8ms
2025-01-01T12:00:05Z  DELETED   app/Http/Controllers/OldCtrl  -8 nodes  -12 edges 4ms
```

---

## Critical Rules

- **Check mtime first, SHA256 only on mtime change.** SHA256 is a fallback for tools that update mtime without content changes (e.g. formatters).
- **Delete then re-insert, never merge.** Stale relations from the previous parse must not persist.
- **Transactions per file.** Each file sync is a single atomic transaction. A parse failure rolls back cleanly.
- **Never watch `.codebase-graph/` itself.** This causes infinite loops when `graph.db` is updated.
- **Debounce rapid saves.** IDEs that save multiple times per keystroke (e.g. auto-save): debounce with a 200ms delay before calling `sync_file`.
- **Partial bridge re-mapping is limited in scope.** Do not re-run the full bridge after each file change — only re-map calls/routes for the changed file's nodes.
- **The watcher must release the WAL lock** within 500ms to avoid blocking the AI read path. Keep sync transactions short.
