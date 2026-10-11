# Syntax compatibility contract

ZUI supports the standard automatic JSX transform shape (`jsx`, `jsxs`, `jsxDEV`, and `Fragment`) and familiar function-component syntax. JSX syntax is intentionally recognizable to React users, but ZUI is a separate runtime.

## Supported authoring patterns

- `jsx: "react-jsx"` with `jsxImportSource: "zui"`;
- function components returning elements, text, arrays, fragments, or `null`;
- `useState`, `useEffect`, `useMemo`, `useCallback`, and `useRef`;
- ordinary JavaScript conditional expressions;
- keyed `.map()` output;
- native-style event props such as `onClick`, `onInput`, and `onDoubleClick`;
- callback/object refs on host elements.

## Semantic differences

- Component updates are scheduled by ZUI's synchronous runtime and committed through a Flat Index transaction.
- Effects are flushed after the root transaction; there is no React post-paint or concurrent scheduler contract.
- Events are native listeners, not a React synthetic event system.
- `NodeRegistry` and `PatchEngine` own identity and DOM lifecycle; there is no React Virtual DOM compatibility layer.
- The explicit reactive API under `zui/legacy` is a separate authoring surface but shares the same DOM mutation engine.

## Not promised

React/Preact ecosystem drop-in compatibility, React hooks beyond the documented subset, Context, reducer APIs, synthetic events, concurrent rendering, Suspense, portals, SSR/hydration, full SVG/property normalization, or framework-specific devtools.

Use [`docs/API.md`](API.md) for the supported ZUI contract rather than treating the JSX spelling as a compatibility guarantee.
