# React/Preact compatibility — experimental runtime

ZUI's default `zui` and `zui/jsx-runtime` entries now target `src/compat.ts`. This is a **new runtime**, not a promise of drop-in React equivalence. Mount-once/reactive descriptor work is preserved at `zui/legacy` and the engine at `zui/reactive`.

## Current public API (implemented in source; not verified by full build)

```tsx
import { createRoot, useState, useEffect, useMemo, useCallback, useRef } from "zui";

function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => { document.title = String(count); }, [count]);
  return <button onClick={() => setCount(n => n + 1)}>Count: {count}</button>;
}
createRoot(document.getElementById("app")!).render(<Counter />);
```

- Ordinary JSX conditional `&&`, ternaries and keyed `.map()` work via component re-execution + reconciliation.
- `useState` returns a snapshot tuple; setter re-renders the owning component synchronously (no automatic batch scheduling).
- `useMemo`, `useCallback`, `useRef`, `useEffect` maintain ordered hook slots.
- `useEffect` is currently synchronous after commit, **not React's post-paint timing**.
- Children reconciliation preserves a keyed element with the same type/key, but is not optimized for large lists.
- `ref` supports callback and object refs for host elements.
- `render` and `createRoot(...).render(...)/unmount()` are available.

## Intentionally unsupported / not yet implemented

`useReducer`, `useLayoutEffect`, `createContext/useContext`, `memo`, `forwardRef`, portals, Suspense, SSR/hydration, concurrent rendering, synthetic events, React scheduling/batching semantics and complete DOM/SVG property normalization.

Controlled inputs should use `onInput` or `onChange` as appropriate to the native browser event; the runtime does not emulate React's synthetic `onChange` for text inputs.

## Testing/packaging limitations

JSX intrinsic types remain broad. `package.json` exports source .ts and is still `private: true`; publishing would require an ESM + type declaration build and external-consumer verification. Tests exist but full typecheck/Vitest/Vite build have not been confirmed against this revision.

## Compatibility acceptance criteria

1. Counter state/effect lifecycles and Todo flows work in DOM + browser.
2. Keys preserve component/DOM identity; removal cleans listeners/effects.
3. Hook ordering misuse and state writes during rendering have defined fail-closed behavior.
4. Output of tests, typecheck and build recorded against an exact commit.
5. React/Preact ecosystem compatibility must be claimed only for APIs tested explicitly.
