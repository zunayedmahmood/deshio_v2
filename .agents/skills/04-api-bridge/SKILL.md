---
name: codebase-graph-api-bridge
description: "Use this skill when mapping frontend API calls to backend routes and controllers. Covers detection of fetch/axios/React Query/SWR calls in hooks, pages, and components, URL normalisation, route matching against the Laravel route graph, and edge creation for the frontend→backend bridge. Must be read before running Phase 3 of init or `/codebase-graph index-bridge`. This is the final indexing phase — backend and frontend must both be fully indexed first."
---

# API Bridge — Frontend ↔ Backend Mapping

## Overview

Connects the frontend call-graph to the backend route/controller graph.  
After this phase, the AI model can answer: *"If I change this Laravel controller method, which Next.js pages, hooks, and components are affected?"* — and vice versa.

---

## Command

```bash
/codebase-graph index-bridge          # Run bridge mapping (requires backend + frontend indexed)
/codebase-graph index-bridge --report # Print unmapped calls (potential dead routes)
```

---

## Step 1 — Collect All Frontend API Calls

Scan every **hook**, **page**, **component**, and **lib** node already in the graph.  
Look for these call patterns and extract the URL string (or template literal).

### Fetch / Axios Patterns

```typescript
// Pattern A: native fetch
fetch('/api/users')
fetch(`/api/users/${id}`)
fetch(API_BASE + '/users', { method: 'POST' })

// Pattern B: axios
axios.get('/api/users')
axios.post('/api/posts', payload)
axios.put(`/api/posts/${id}`, payload)
axios.delete(`/api/posts/${id}`)

// Pattern C: axios instance (common in src/lib/api.ts)
apiClient.get('/users')
apiClient.post('/posts', data)

// Pattern D: React Query useQuery / useMutation
useQuery({ queryKey: ['users'], queryFn: () => fetch('/api/users') })
useMutation({ mutationFn: (data) => axios.post('/api/posts', data) })

// Pattern E: SWR
useSWR('/api/users', fetcher)
useSWR(`/api/users/${id}`, fetcher)
```

### Extraction Pseudocode

```python
HTTP_METHODS = {'get','post','put','patch','delete'}

def extract_api_calls(ast_root, src_bytes, file_path):
    calls = []
    for call_node in find_all_calls(ast_root):
        # fetch(url) or fetch(url, {method:...})
        if call_node.fn_name == 'fetch':
            url    = resolve_url_arg(call_node, 0, src_bytes)
            method = extract_method_from_options(call_node) or 'GET'
            calls.append(ApiCall(url=url, method=method, file=file_path, line=call_node.start))

        # axios.get/post/put/delete(url)
        elif call_node.obj in ('axios', 'apiClient') and call_node.method in HTTP_METHODS:
            url = resolve_url_arg(call_node, 0, src_bytes)
            calls.append(ApiCall(url=url, method=call_node.method.upper(), file=file_path, line=call_node.start))

    return calls
```

### URL Resolution

Template literals and string concatenation must be normalised to a matchable pattern:

```python
def normalise_url(url_str: str) -> str:
    """
    '/api/users'           →  '/api/users'
    `/api/users/${id}`     →  '/api/users/{id}'
    API_BASE + '/users'    →  '/users'   (strip unknown prefix)
    '/api/v1/posts/' + id  →  '/api/v1/posts/{id}'
    """
    # Replace ${expr} and string concatenation placeholders
    url = re.sub(r'\$\{[^}]+\}', '{param}', url_str)
    url = re.sub(r"'\s*\+\s*\w+",  '/{param}', url)
    url = re.sub(r'"\s*\+\s*\w+',  '/{param}', url)
    url = url.strip("'\"`")
    return url
```

---

## Step 2 — Match Frontend Calls to Backend Routes

For each normalised frontend URL + method, find the matching `route` node in the graph.

### Matching Algorithm

```python
def match_route(frontend_url: str, method: str, route_nodes: list) -> RouteNode | None:
    # 1. Exact match first
    for r in route_nodes:
        if r.verb.upper() == method and r.uri == frontend_url:
            return r

    # 2. Parametric match: convert {id} segments to regex wildcards
    for r in route_nodes:
        if r.verb.upper() != method:
            continue
        pattern = re.sub(r'\{[^}]+\}', r'[^/]+', re.escape(r.uri))
        if re.fullmatch(pattern, frontend_url):
            return r

    # 3. Prefix match (for versioned APIs: /api/v1/users vs /api/users)
    for r in route_nodes:
        if strip_api_prefix(r.uri) == strip_api_prefix(frontend_url):
            return r

    return None   # Unmapped — log as warning
```

### API Prefix Handling

Laravel's `routes/api.php` routes automatically get the `/api` prefix.  
Strip it for matching if the frontend already includes it:

```python
def strip_api_prefix(url: str) -> str:
    return url.removeprefix('/api/v1').removeprefix('/api/v2').removeprefix('/api')
```

---

## Step 3 — Create Bridge Edges

For each matched pair, write to the graph:

```sql
-- Edge: frontend node → route node
INSERT INTO edges (from_id, to_id, edge_type, metadata)
VALUES (
    :frontend_node_id,          -- hook / component / page
    :route_node_id,
    'CALLS_API',
    json_object(
        'method',       :http_method,
        'url_raw',      :original_url,
        'url_normalised',:normalised_url,
        'line',         :call_line_number
    )
);

-- Edge: route node → controller method node (already created in backend indexing)
-- This edge should already exist from Step 1e of backend analysis.
-- If missing (e.g. closure route), create a synthetic controller node.
```

---

## Step 4 — Unmapped Call Report

After matching, every unmatched frontend API call is a potential issue:

```sql
SELECT ac.url_raw, ac.method, ac.file_path, ac.line
FROM api_calls_staging ac
WHERE ac.matched_route_id IS NULL;
```

Print these as warnings:

```
⚠  Unmapped API calls (no matching Laravel route found):
   GET  /api/dashboard/stats    src/hooks/useDashboard.ts:14
   POST /api/export/csv         src/pages/reports/page.tsx:67
```

---

## Step 5 — Reverse Map: Routes with No Frontend Callers

Detect backend routes that have zero frontend edges (potential dead API endpoints):

```sql
SELECT r.uri, r.verb, r.file_path
FROM nodes r
WHERE r.node_type = 'route'
  AND r.id NOT IN (
      SELECT to_id FROM edges WHERE edge_type = 'CALLS_API'
  );
```

Store these with `metadata->'$.dead_candidate' = true`.

---

## Bridge Edge Summary

| Edge Type | From | To | Meaning |
|-----------|------|----|---------|
| `CALLS_API` | hook / page / component | route | Frontend calls this endpoint |
| `HANDLED_BY` | route | controller_method | Route dispatches to this method |
| `QUERIES` | controller_method | model | Method queries this model |
| `BACKED_BY` | model | migration | Model is backed by this table |

This chain lets the blast-radius algorithm trace: `Component → Route → Controller → Model → Migration` and back.

---

## Critical Rules

- **Bridge runs last.** Both backend and frontend must be fully indexed before this phase.
- **Never hardcode the API base URL.** Resolve it from `next.config.js` (`env.NEXT_PUBLIC_API_URL`) or `.env` if present; otherwise assume `/api`.
- **Template literals with complex expressions** (not just `${id}`) should be stored as `url_pattern: UNRESOLVED` and flagged in the report — do not skip silently.
- **Multiple frontend callers per route** are valid — one route can have many `CALLS_API` edges pointing to it.
- **SWR / React Query keys** are not always URL strings. When the query key is an array like `['users', id]`, look for the `queryFn` body to extract the real URL.
- **axios instances**: Detect `axios.create({ baseURL: '...' })` in `src/lib/*.ts` and resolve calls through those instances using the stored base URL.
