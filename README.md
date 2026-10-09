# ZUI

**Experimental React/Preact-style JSX frontend runtime.** The default entry now implements function components, familiar hooks, plain conditional rendering, keyed arrays and direct DOM reconciliation. This is an early compatibility foundation, **not a production-ready React/Preact replacement**.

## Run

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Open `/compat.html` for the new React-style Todo. Earlier prototypes remain at `/` (Counter), `/todo.html` (Todo), and `/react-friendly.html`; they explicitly import `zui/legacy`.

## Default JSX + Hooks

```tsx
import { createRoot, useState, useEffect } from "zui";

function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    document.title = String(count);
  }, [count]);

  return <button onClick={() => setCount(n => n + 1)}>
    Count: {count}
  </button>;
}

createRoot(document.getElementById("app")!).render(<Counter />);
```

Configure `jsx: "react-jsx"` and `jsxImportSource: "zui"`. Ordinary `&&`, ternary and keyed `.map()` syntax is supported by component rerenders and a direct DOM reconciler.

## Compatibility scope (experimental)

Source-implemented: `createRoot`, `render`, `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`, `Fragment`, basic intrinsic props/events, keyed reconciliation.

Not yet claimed: full React/Preact hook scheduling, synthetic events, context, reducer, concurrent updates, Suspense, portals, SSR, SVG support, complete JSX types, packaging or ecosystem interoperability. Effects currently run synchronously after DOM commit, unlike React post-paint scheduling. **Full tests/build on the current revision have not been independently verified.**

Legacy mount-once/store-first runtime: `import { createStore, mount, Show, For } from "zui/legacy"`. Research engine: `zui/reactive`.

## Docs

- [Roadmap](ROADMAP.md)
- [Compatibility contract](docs/COMPATIBILITY.md)
- [Original reactive architecture](docs/ARCHITECTURE.md)
- [Testing gates](docs/TESTING.md)
- [Verification status](docs/STATUS.md)
- [Contributing](CONTRIBUTING.md)
- [Research preregistration](research/preregistration.md)

No CI/CD is configured by design.
