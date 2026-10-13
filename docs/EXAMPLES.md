# Examples and benchmarks

ZUI ships a polished dashboard showcase for the JSX runtime plus the lower-level benchmark and compatibility fixtures used by the verification suite.

| Page | Focus |
|---|---|
| `/` or `/admin.html` | ZUI Studio dashboard showcase with responsive layout and interactive team management |
| `zui/ui` | Reusable visual primitives, tokens, and accessible controls |
| `zui/zustand` | Zustand vanilla/bound-store selectors inside ZUI components |
| `npm run bench:all` | Node benchmark suites for reactive invalidation, keyed reconciliation, and Flat Index updates |

Open `/demos.html` for a browser-friendly index.

## Node benchmarks

```sh
npm run bench:reactive
npm run bench:compat
```

`bench:reactive` compares invalidation strategies. `bench:compat` uses jsdom to measure keyed direct-DOM reconciliation for several list sizes. Both are exploratory and should not be treated as release performance claims.
