---
name: codebase-graph-backend-analysis
description: "Use this skill when indexing the Laravel backend codebase. Covers Tree-sitter PHP parsing, migration schema extraction, Eloquent model relationship mapping, controller method analysis, route registration, and indexing of Observers/Providers/Jobs/Events. Must be read before writing any backend nodes or edges to the graph. Trigger for any `/codebase-graph index-backend` command or during full-stack init Phase 1."
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


# Backend Analysis — Laravel

## Overview

Parses the Laravel backend using Tree-sitter (PHP grammar).  
Produces **typed graph nodes** and **directed edges** for every structural element.  
All writes go through `05-graph-storage/SKILL.md`.

---

## Command

```bash
/codebase-graph index-backend          # Full backend re-index
/codebase-graph index-backend --step migrations
/codebase-graph index-backend --step models
/codebase-graph index-backend --step controllers
/codebase-graph index-backend --step observers,providers,jobs
/codebase-graph index-backend --step routes
```

---

## Tree-sitter PHP Setup

```python
# Install once (stored in .codebase-graph/parsers/)
from tree_sitter import Language, Parser
Language.build_library('.codebase-graph/parsers/php.so', ['vendor/tree-sitter-php'])
PHP_LANG = Language('.codebase-graph/parsers/php.so', 'php')
parser   = Parser(); parser.set_language(PHP_LANG)

def parse_file(path: str) -> Node:
    src = open(path, 'rb').read()
    return parser.parse(src).root_node
```

---

## Step 1a — Migrations

**Target directory:** `database/migrations/`  
**Node type:** `migration`  
**What to extract:**

| Field | Source |
|-------|--------|
| `table_name` | `Schema::create('table_name', ...)` or `Schema::table(...)` |
| `columns` | Each `$table->type('col_name', ...)` call |
| `column_types` | `string`, `integer`, `foreignId`, `timestamps`, etc. |
| `indexes` | `->index()`, `->unique()`, `->primary()` |
| `foreign_keys` | `->foreign('col')->references('id')->on('table')` |
| `migration_class` | Class name of the migration |
| `file_path` | Relative path |
| `batch_order` | Numeric prefix of filename (e.g. `2024_01_01` → sortable) |

**Edges created:**
- `migration → table` (CREATES_TABLE)
- `migration → migration` (DEPENDS_ON) when FK references another table

```python
# Pseudocode: extract columns from migration AST
def extract_migration(root_node, src_bytes):
    columns = []
    for call in find_method_calls(root_node, object='table'):
        col_type = call.child_by_field('name').text.decode()
        col_name = get_string_arg(call, 0)
        columns.append({"name": col_name, "type": col_type})
    return columns
```

---

## Step 1b — Models

**Target directory:** `app/Models/`  
**Node type:** `model`  
**What to extract:**

| Field | Source |
|-------|--------|
| `class_name` | `class User extends Model` |
| `table` | `protected $table` (or snake_case plural of class) |
| `fillable` | `protected $fillable = [...]` |
| `casts` | `protected $casts = [...]` |
| `relationships` | All methods returning `hasMany`, `belongsTo`, `belongsToMany`, `hasOne`, `morphTo`, `hasManyThrough`, etc. |
| `scopes` | Methods prefixed `scope` |
| `traits` | `use SoftDeletes`, `use HasFactory`, etc. |
| `observers` | Detected in `boot()` or EventServiceProvider |

**Edges created:**

| Edge | Type |
|------|------|
| `UserModel → PostModel` | HAS_MANY |
| `PostModel → UserModel` | BELONGS_TO |
| `Model → migration` | BACKED_BY |
| `Model → Observer` | OBSERVED_BY |

```python
RELATIONSHIP_METHODS = {
    'hasOne','hasMany','belongsTo','belongsToMany',
    'hasManyThrough','hasOneThrough','morphTo',
    'morphMany','morphOne','morphToMany'
}

def extract_relationships(class_node):
    for method in find_methods(class_node):
        for call in find_calls_in(method):
            if call.name in RELATIONSHIP_METHODS:
                related_model = get_string_arg(call, 0)  # e.g. 'App\Models\Post'
                yield Relation(
                    from_model=class_name,
                    to_model=related_model,
                    type=call.name,
                    method_name=method.name
                )
```

---

## Step 1c — Controllers

**Target directory:** `app/Http/Controllers/` (recursively)  
**Node type:** `controller`  
**What to extract:**

| Field | Source |
|-------|--------|
| `class_name` | Class declaration |
| `methods` | All public methods (name, parameters, return type) |
| `model_calls` | `User::find()`, `$user->posts()`, `Post::where()->get()` |
| `service_calls` | Injected dependencies in constructor |
| `form_requests` | Type-hinted `FormRequest` subclasses in method params |
| `resource_classes` | `new UserResource(...)` or `UserResource::collection(...)` |
| `response_types` | `return response()->json(...)`, `return view(...)`, `return redirect(...)` |

**Edges created:**

| Edge | Type |
|------|------|
| `Controller::method → Model` | QUERIES |
| `Controller::method → FormRequest` | VALIDATED_BY |
| `Controller::method → Resource` | TRANSFORMS_VIA |
| `Controller → Service` | DEPENDS_ON |

---

## Step 1d — Observers, Providers, Jobs, Events

### Observers (`app/Observers/`)
- Node type: `observer`
- Extract: `created`, `updated`, `deleted`, `saving`, `saved` hooks
- Edge: `Observer → Model` (OBSERVES)

### Service Providers (`app/Providers/`)
- Node type: `provider`
- Extract: bindings in `register()`, event→listener maps in `boot()`
- Edge: `Provider → Class` (BINDS), `Event → Listener` (TRIGGERS)

### Jobs (`app/Jobs/`)
- Node type: `job`
- Extract: `handle()` method calls, queue connection, `ShouldQueue` interface
- Edge: `Controller → Job` (DISPATCHES), `Job → Model` (PROCESSES)

### Events & Listeners (`app/Events/`, `app/Listeners/`)
- Node type: `event`, `listener`
- Edge: `Event → Listener` (HANDLED_BY), `Controller → Event` (FIRES)

### Middleware (`app/Http/Middleware/`)
- Node type: `middleware`
- Extract: `handle()` method, which routes/groups apply it
- Edge: `Route → Middleware` (PROTECTED_BY)

---

## Step 1e — Routes

**Target files:** `routes/web.php`, `routes/api.php`, `routes/channels.php`  
**Node type:** `route`

| Field | Source |
|-------|--------|
| `uri` | First string arg: `'/users/{id}'` |
| `verb` | `Route::get`, `Route::post`, `Route::put`, `Route::delete`, `Route::patch`, `Route::any` |
| `action` | `[UserController::class, 'show']` or closure |
| `name` | `->name('users.show')` |
| `middleware` | `->middleware([...])` |
| `prefix` | From `Route::prefix(...)` group |
| `namespace` | From `Route::namespace(...)` group |

**Edges created:**

| Edge | Type |
|------|------|
| `Route → Controller::method` | HANDLED_BY |
| `Route → Middleware` | PROTECTED_BY |

```python
# Route extraction pseudocode
VERBS = ['get','post','put','patch','delete','any','match','resource','apiResource']

def extract_routes(ast_root):
    for call in find_method_calls(ast_root, object='Route'):
        if call.method in VERBS:
            uri    = get_string_arg(call, 0)
            action = parse_action_arg(call, 1)   # string or array
            yield RouteNode(verb=call.method, uri=uri, action=action)
```

---

## Node Schema (Backend)

```sql
-- All backend nodes go into the `nodes` table
-- node_type ∈ {migration, model, controller, observer, provider,
--              job, event, listener, middleware, route, form_request,
--              resource, service, policy}
INSERT INTO nodes (id, node_type, name, file_path, line_start, line_end, metadata)
VALUES (?, ?, ?, ?, ?, ?, json(?));

-- metadata JSON per type examples:
-- model:      {"table":"users","fillable":["name","email"],"casts":{...}}
-- route:      {"verb":"GET","uri":"/api/users/{id}","name":"users.show"}
-- controller: {"methods":["index","show","store","update","destroy"]}
```

---

## Critical Rules

- **Strict phase order:** 1a → 1b → 1c → 1d → 1e. Each step depends on the previous nodes existing.
- **Skip vendor files.** Never parse anything under `vendor/`.
- **Resolve relative model names.** When a relationship says `'Post'`, resolve to `App\Models\Post` using the model index built in step 1b.
- **Store line numbers** for every node — required by the blast-radius algorithm.
- **Polymorphic relations** (`morphTo`, `morphMany`) create edges to ALL models that declare the corresponding `morphOne`/`morphMany` on the other side.
- **Route::resource / Route::apiResource** expand to 7 / 5 standard routes — store each as a separate `route` node.
- For files that fail parsing, log the error to `.codebase-graph/logs/init.log` and continue — do **not** abort.
