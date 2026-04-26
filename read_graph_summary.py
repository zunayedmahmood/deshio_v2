import sqlite3, json, os

db_path = '.codebase-graph/graph.db'
if not os.path.exists(db_path):
    print(f'Error: {db_path} not found.')
    exit(1)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# Get stats
stats = conn.execute('''
    SELECT 
        (SELECT COUNT(*) FROM nodes) as total_nodes,
        (SELECT COUNT(*) FROM edges) as total_edges,
        (SELECT COUNT(DISTINCT cluster_id) FROM nodes WHERE cluster_id IS NOT NULL) as total_clusters
''').fetchone()

print('╔' + '═' * 66 + '╗')
print('║  CODEBASE GRAPH CONTEXT  ·  graph.db  ·  synced 2s ago          ║')
print('╚' + '═' * 66 + '╝')
print()

# Group by Type instead of Clusters since clusters are missing
print('ARCHITECTURE BY NODE TYPE')
print('─────────────────────────')

types = conn.execute('SELECT node_type, COUNT(*) as count FROM nodes GROUP BY node_type ORDER BY count DESC').fetchall()
for t in types:
    ntype = t['node_type']
    count = t['count']
    
    # Get top 3 nodes by inbound edge count (as PageRank proxy)
    top_nodes = conn.execute('''
        SELECT n.name, COUNT(e.id) as inbound
        FROM nodes n
        LEFT JOIN edges e ON e.to_id = n.id
        WHERE n.node_type = ?
        GROUP BY n.id
        ORDER BY inbound DESC
        LIMIT 3
    ''', (ntype,)).fetchall()
    top_names = ', '.join([n['name'] for n in top_nodes])
    
    print(f'{ntype.capitalize().ljust(15)} — ({count} nodes)')
    print(f'  Top (inbound): {top_names}')
    print()

print('TOP HOTSPOTS (by Inbound Edges)')
print('───────────────────────────────')
hotspots = conn.execute('''
    SELECT n.name, n.node_type, n.file_path, COUNT(e.id) as inbound
    FROM nodes n
    LEFT JOIN edges e ON e.to_id = n.id
    GROUP BY n.id
    ORDER BY inbound DESC
    LIMIT 20
''').fetchall()

for i, h in enumerate(hotspots, 1):
    name = h['name']
    ntype = h['node_type']
    path = h['file_path']
    inbound = h['inbound']
    print(f'{i}. {name} [{ntype}]'.ljust(35) + f'{path}'.ljust(45) + f'in={inbound}')

print()
print('GRAPH STATS')
print('───────────')
print(f"Nodes: {stats['total_nodes']}  ·  Edges: {stats['total_edges']}  ·  Clusters: {stats['total_clusters']}")
print("Note: PageRank and Louvain clusters are not yet computed; using inbound edge count as proxy.")
