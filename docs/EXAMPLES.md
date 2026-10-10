# Examples and benchmarks

ZUI ships small interactive pages for the default JSX runtime and the legacy reactive runtime.

| Page | Focus |
|---|---|
| `/compat.html` | React-style Todo with hooks, controlled inputs, effects, and keyed rows |
| `/hooks.html` | `useState`, `useEffect`, `useMemo`, `useCallback`, and `useRef` |
| `/keyed.html` | Keyed reorder, input identity, insertion, removal, and styles |
| `/benchmark.html` | Default runtime synchronous keyed DOM updates |
| `/legacy-benchmark.html` | Legacy store updates and `For` reconciliation |
| `/` | Legacy counter with `Show` and `For` |
| `/todo.html` | Legacy Todo with reactive bindings and controlled inputs |
| `/react-friendly.html` | Legacy mount-once function children and refs |

Open `/demos.html` for a browser-friendly index.

## Node benchmarks

```sh
npm run bench:reactive
npm run bench:compat
```

`bench:reactive` compares invalidation strategies. `bench:compat` uses jsdom to measure keyed direct-DOM reconciliation for several list sizes. Both are exploratory and should not be treated as release performance claims.
