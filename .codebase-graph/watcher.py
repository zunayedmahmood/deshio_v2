import os, sys, time, json, sqlite3, hashlib, re
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

WATCHED_EXTENSIONS = {'.php', '.ts', '.tsx', '.js', '.jsx'}
IGNORED_DIRS = {'vendor', 'node_modules', '.next', 'out', '.turbo', 'storage', 'bootstrap/cache', '.codebase-graph', '.git'}

def sha256_file(path):
    h = hashlib.sha256()
    try:
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        return h.hexdigest()
    except: return None

class GraphSyncHandler(FileSystemEventHandler):
    def __init__(self, db_path):
        self.db_path = db_path

    def on_modified(self, event):
        if not event.is_directory: self._handle(event.src_path)
    def on_created(self, event):
        if not event.is_directory: self._handle(event.src_path)
    def on_deleted(self, event):
        if not event.is_directory: self._handle_delete(event.src_path)

    def _handle(self, abs_path):
        p = Path(abs_path)
        if p.suffix not in WATCHED_EXTENSIONS: return
        if any(ignored in p.parts for ignored in IGNORED_DIRS): return
        
        rel_path = os.path.relpath(abs_path, os.getcwd())
        print(f"Syncing: {rel_path}")
        # Simplified sync: just update hash and timestamp for now
        # In a real implementation, we would call the parsers here.
        try:
            conn = sqlite3.connect(self.db_path)
            mtime = os.path.getmtime(abs_path)
            sha = sha256_file(abs_path)
            conn.execute(\"\"\"
                INSERT INTO file_hashes (file_path, mtime, sha256, last_indexed)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(file_path) DO UPDATE SET
                    mtime = excluded.mtime,
                    sha256 = excluded.sha256,
                    last_indexed = excluded.last_indexed
            \"\"\", (rel_path, mtime, sha))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error syncing {rel_path}: {e}")

    def _handle_delete(self, abs_path):
        rel_path = os.path.relpath(abs_path, os.getcwd())
        try:
            conn = sqlite3.connect(self.db_path)
            conn.execute("DELETE FROM nodes WHERE file_path = ?", (rel_path,))
            conn.execute("DELETE FROM file_hashes WHERE file_path = ?", (rel_path,))
            conn.commit()
            conn.close()
            print(f"Deleted: {rel_path}")
        except Exception as e:
            print(f"Error deleting {rel_path}: {e}")

if __name__ == '__main__':
    db_path = '.codebase-graph/graph.db'
    observer = Observer()
    handler = GraphSyncHandler(db_path)
    observer.schedule(handler, os.getcwd(), recursive=True)
    observer.start()
    
    # Write PID
    with open('.codebase-graph/watch.pid', 'w') as f:
        f.write(str(os.getpid()))
    
    print("✓ File watcher active")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
