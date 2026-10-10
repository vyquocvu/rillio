# ZUI

**Experimental React/Preact-style JSX frontend runtime.** The default entry now implements function components, familiar hooks, plain conditional rendering, keyed arrays and direct DOM reconciliation. This is an early compatibility foundation, **not a production-ready React/Preact replacement**.

## Run

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run bench:reactive
npm run test:consumer
npm run test:browser
```

Open `/demos.html` for the full example catalog. The default runtime examples include `/compat.html` for the React-style Todo, `/hooks.html` for hooks/forms, `/keyed.html` for keyed list identity, and `/benchmark.html` for browser DOM measurements. Legacy examples include `/` (Counter), `/todo.html` (Todo), `/react-friendly.html`, and `/legacy-benchmark.html`; they explicitly import `zui/legacy`.

The exploratory reactive benchmark runs with `npm run bench:reactive`; `npm run test:consumer` verifies generated package artifacts from a separate strict TypeScript fixture, and `npm run test:browser` runs Counter, keyed input, and Todo browser flows with local Chrome/Chromium. Benchmark limitations and interpretation guidance are documented in `benchmarks/README.md`.

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

Not yet claimed: full React/Preact hook scheduling, synthetic events, context, reducer, concurrent updates, Suspense, portals, SSR, SVG support, complete JSX types, or ecosystem-wide interoperability. Effects currently run synchronously after DOM commit, unlike React post-paint scheduling. See [verification status](docs/STATUS.md) for the commands run on the current working tree.

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
