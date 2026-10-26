# Syntax compatibility contract

Rillio supports the standard automatic JSX transform shape (`jsx`, `jsxs`, `jsxDEV`, and `Fragment`) and familiar function-component syntax. JSX syntax is intentionally recognizable to React users, but Rillio is a separate runtime.

## Supported authoring patterns

- `jsx: "react-jsx"` with `jsxImportSource: "rillio"`;
- function components returning elements, text, arrays, fragments, or `null`;
- `useState`, `useEffect`, `useMemo`, `useCallback`, and `useRef`;
- ordinary JavaScript conditional expressions;
- keyed `.map()` output;
- native-style event props such as `onClick`, `onInput`, and `onDoubleClick`;
- callback/object refs on host elements.
- Rillio's `createPortal` and `ErrorBoundary` primitives, with the semantics documented in the API guide.

## Semantic differences

- Component updates are scheduled by Rillio's synchronous runtime and committed through a Flat Index transaction.
- Effects are flushed after the root transaction; there is no React post-paint or concurrent scheduler contract.
- Events are native listeners, not a React synthetic event system.
- `NodeRegistry` and `PatchEngine` own identity and DOM lifecycle; there is no React Virtual DOM compatibility layer.
- The explicit reactive API under `rillio/dom` (with `rillio/legacy` as deprecated compatibility alias) is a separate authoring surface but shares the same DOM mutation engine.

## Not promised

React/Preact ecosystem drop-in compatibility, React hooks beyond the documented subset, Context, reducer APIs, synthetic events, concurrent rendering, Suspense, SSR/hydration, complete SVG/property normalization, or React/Preact devtools integration. Rillio provides its own inspector under `rillio/devtools`.

Use [`docs/API.md`](API.md) for the supported Rillio contract rather than treating the JSX spelling as a compatibility guarantee.
