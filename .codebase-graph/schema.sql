PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS nodes (
    id          TEXT PRIMARY KEY,
    node_type   TEXT NOT NULL,
    name        TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    line_start  INTEGER,
    line_end    INTEGER,
    metadata    TEXT DEFAULT '{}',
    cluster_id  INTEGER,
    pagerank    REAL DEFAULT 0.0,
    dead_candidate INTEGER DEFAULT 0,
    last_indexed TEXT
);

CREATE TABLE IF NOT EXISTS edges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    to_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    edge_type   TEXT NOT NULL,
    metadata    TEXT DEFAULT '{}',
    UNIQUE(from_id, to_id, edge_type)
);

CREATE TABLE IF NOT EXISTS file_hashes (
    file_path   TEXT PRIMARY KEY,
    mtime       REAL NOT NULL,
    sha256      TEXT NOT NULL,
    last_indexed TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tailwind_classes (
    class_name       TEXT PRIMARY KEY,
    first_seen_file  TEXT
);

CREATE TABLE IF NOT EXISTS node_tailwind (
    node_id    TEXT REFERENCES nodes(id) ON DELETE CASCADE,
    class_name TEXT REFERENCES tailwind_classes(class_name),
    PRIMARY KEY (node_id, class_name)
);

CREATE TABLE IF NOT EXISTS api_calls_staging (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path       TEXT NOT NULL,
    line            INTEGER,
    method          TEXT NOT NULL,
    url_raw         TEXT NOT NULL,
    url_normalised  TEXT NOT NULL,
    matched_route_id TEXT REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_nodes_type      ON nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_nodes_file      ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_cluster   ON nodes(cluster_id);
CREATE INDEX IF NOT EXISTS idx_edges_from      ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to        ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_type      ON edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_file_hashes     ON file_hashes(file_path);
