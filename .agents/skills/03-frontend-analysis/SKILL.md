---
name: codebase-graph-frontend-analysis
description: "Use this skill when indexing the Next.js/Tailwind frontend codebase. Covers Tree-sitter TypeScript/TSX parsing, component prop-interface extraction, hook dependency mapping, page route detection, data-fetching pattern identification, and Tailwind class usage tracking. Must be read before writing any frontend nodes or edges to the graph. Trigger for `/codebase-graph index-frontend` or during full-stack init Phase 2."
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


# Frontend Analysis — Next.js / Tailwind

## Overview

Parses the Next.js/Tailwind frontend using Tree-sitter (TypeScript + TSX grammars).  
Produces **typed graph nodes** and **directed edges** for every UI structural element.  
All writes go through `05-graph-storage/SKILL.md`.

---

## Command

```bash
/codebase-graph index-frontend          # Full frontend re-index
/codebase-graph index-frontend --step components
/codebase-graph index-frontend --step pages
/codebase-graph index-frontend --step hooks
/codebase-graph index-frontend --step stores
```

---

## Tree-sitter TypeScript/TSX Setup

```python
from tree_sitter import Language, Parser

Language.build_library(
    '.codebase-graph/parsers/tsx.so',
    ['vendor/tree-sitter-typescript/tsx']
)
TSX_LANG  = Language('.codebase-graph/parsers/tsx.so', 'tsx')
TS_LANG   = Language('.codebase-graph/parsers/tsx.so', 'typescript')

parser = Parser()

def parse_file(path: str) -> Node:
    lang = TSX_LANG if path.endswith(('.tsx', '.jsx')) else TS_LANG
    parser.set_language(lang)
    return parser.parse(open(path, 'rb').read()).root_node
```

---

## Directory Conventions

| Directory pattern | Meaning |
|------------------|---------|
| `src/components/**/*.tsx` | Shared UI components |
| `src/app/**/page.tsx` | App Router pages |
| `src/pages/**/*.tsx` | Pages Router pages |
| `src/app/**/layout.tsx` | Layout wrappers |
| `src/hooks/use*.ts` | Custom React hooks |
| `src/stores/**/*.ts` | Zustand / Jotai / Redux state |
| `src/lib/**/*.ts` | Utility functions |
| `src/types/**/*.ts` | Type definitions |

---

## Step 2a — Components

**Target:** `src/components/**/*.tsx`, `components/**/*.tsx`  
**Node type:** `component`

### What to Extract

| Field | Source |
|-------|--------|
| `name` | Exported function/const name |
| `file_path` | Relative path |
| `props_interface` | `interface XProps` or inline `{ prop: type }` on function param |
| `props` | Each prop name + TypeScript type |
| `is_client` | `'use client'` directive present |
| `is_server` | Absence of `'use client'` in App Router component |
| `imported_components` | Every JSX tag that maps to a local import |
| `imported_hooks` | `useX()` calls — local and library |
| `imported_libs` | Non-relative imports used |
| `tailwind_classes` | All string literals in `className=` attributes (for audit) |
| `conditional_render` | Ternary or `&&` expressions in JSX return |

### Props Extraction

```python
def extract_props(function_node, src_bytes):
    # Find the first parameter of the exported function
    params = get_params(function_node)
    if not params:
        return []
    first_param = params[0]
    # If destructured: { name, age }: UserProps
    if first_param.type == 'object_pattern':
        return [
            {"name": p.text.decode(), "type": get_ts_type(p)}
            for p in first_param.named_children
        ]
    return []
```

### Edges Created

| Edge | Type |
|------|------|
| `ParentComponent → ChildComponent` | RENDERS |
| `Component → Hook` | USES_HOOK |
| `Component → Store` | READS_STORE |
| `Component → Type` | TYPED_BY |

---

## Step 2b — Pages

**Target (App Router):** `src/app/**/page.tsx`, `src/app/**/layout.tsx`  
**Target (Pages Router):** `src/pages/**/*.tsx`  
**Node type:** `page`

### What to Extract

| Field | Source |
|-------|--------|
| `route_segment` | Directory path: `app/users/[id]/page.tsx` → `/users/[id]` |
| `router_type` | `app` or `pages` |
| `is_dynamic` | `[param]` or `[[...slug]]` in path |
| `data_fetching` | See patterns below |
| `components_used` | JSX tags mapped to imported components |
| `params_type` | `{ params: { id: string } }` TypeScript interface |
| `metadata` | `export const metadata` or `generateMetadata()` |
| `loading_boundary` | Sibling `loading.tsx` exists |
| `error_boundary` | Sibling `error.tsx` exists |

### Data-Fetching Pattern Detection

```python
DATA_FETCHING_PATTERNS = {
    # App Router (async server components)
    'async_server_component':  lambda node: is_async(node) and not has_directive(node, 'use client'),
    'generate_static_params':  lambda node: has_export(node, 'generateStaticParams'),
    # Pages Router
    'get_server_side_props':   lambda node: has_export(node, 'getServerSideProps'),
    'get_static_props':        lambda node: has_export(node, 'getStaticProps'),
    'get_static_paths':        lambda node: has_export(node, 'getStaticPaths'),
    # Client-side (SWR / React Query)
    'swr':                     lambda node: has_import(node, 'swr'),
    'react_query':             lambda node: has_import(node, '@tanstack/react-query'),
    'use_effect_fetch':        lambda node: has_effect_with_fetch(node),
}
```

### Edges Created

| Edge | Type |
|------|------|
| `Page → Component` | USES |
| `Page → Layout` | WRAPPED_BY |
| `Page → Hook` | USES_HOOK |
| `DynamicPage → ParamType` | PARAMETERISED_BY |

---

## Step 2c — Hooks

**Target:** `src/hooks/use*.ts`, `src/hooks/use*.tsx`  
**Node type:** `hook`

| Field | Source |
|-------|--------|
| `name` | Exported function name (e.g. `useAuth`) |
| `returns` | Return type annotation |
| `dependencies` | Other hooks called inside (`useEffect` deps array) |
| `api_calls` | `fetch(...)`, `axios.*`, `useQuery(...)` calls → see `04-api-bridge/SKILL.md` |
| `store_access` | Zustand/Jotai atom reads |

---

## Step 2d — Stores

**Target:** `src/stores/**/*.ts`, `src/store/**/*.ts`  
**Node type:** `store`

| Field | Source |
|-------|--------|
| `name` | Store variable name |
| `library` | `zustand`, `jotai`, `redux`, `context` |
| `state_shape` | Top-level keys of the state interface |
| `actions` | Functions that mutate state |

**Edge:** `Store → Model` (MIRRORS) — when store state shape matches a backend model's fields.

---

## Tailwind Audit Nodes

While indexing components and pages, record every unique Tailwind class string found in `className=` attributes:

```sql
INSERT OR IGNORE INTO tailwind_classes (class_name, first_seen_file)
VALUES (?, ?);

INSERT INTO node_tailwind (node_id, class_name) VALUES (?, ?);
```

This enables future queries like:
```sql
-- Find all components using responsive padding
SELECT DISTINCT n.name FROM nodes n
JOIN node_tailwind nt ON nt.node_id = n.id
WHERE nt.class_name LIKE 'p-%' OR nt.class_name LIKE 'px-%';
```

---

## Node Schema (Frontend)

```sql
-- node_type ∈ {component, page, layout, hook, store, lib, type_def}
INSERT INTO nodes (id, node_type, name, file_path, line_start, line_end, metadata)
VALUES (?, ?, ?, ?, ?, ?, json(?));

-- metadata examples:
-- component: {"is_client":true,"props":["title:string","count:number"]}
-- page:      {"route":"/users/[id]","router_type":"app","data_fetching":"async_server_component"}
-- hook:      {"returns":"{ user: User | null, loading: boolean }"}
```

---

## Critical Rules

- **Parse `.tsx` with TSX grammar, `.ts` with TS grammar.** Using TS grammar on TSX files causes parse failures on JSX syntax.
- **Resolve all imports before creating edges.** A JSX `<UserCard />` is only a `RENDERS` edge if `UserCard` resolves to a local file — not a library component.
- **'use client' is a file-level directive**, not a function attribute. Detect it by checking if the first statement is a string literal `"use client"`.
- **Skip `node_modules/`, `.next/`, `out/`, `.turbo/`** entirely.
- **App Router page detection:** `page.tsx` at any depth under `src/app/` is a page. `layout.tsx` at any depth is a layout. Do not confuse with arbitrary component files.
- **Re-export barrels** (`index.ts` that only re-exports) — do not create a node for the barrel itself; instead, resolve imports through it to the actual file.
- **Default exports vs named exports:** Track both. A page with `export default function Page()` and a component with `export const Button = () => {}` should both be captured.
