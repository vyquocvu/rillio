# ZUI

ZUI is an experimental addressable-DOM runtime. It preserves familiar JSX authoring, while DOM identity, structure, ownership, and lifecycle are owned by a Flat Index rather than by a Virtual DOM tree.

The production DOM write path is one transactional `PatchEngine`:

```text
JSX or explicit reactive planner
  -> PatchTransaction: validate -> commit -> dispose
  -> NodeRegistry / Flat Index
  -> browser DOM
```

The React-like spelling is syntax inspiration only. ZUI does not promise React or Preact behavioral compatibility.

## Run

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run build:package
npm run test:consumer
npm run test:browser
npm run bench:all
```

Open `/demos.html` for the example catalog. The default JSX runtime includes `/compat.html`, `/hooks.html`, `/keyed.html`, `/benchmark.html`, and `/e2e.html`. The explicit reactive API is demonstrated by `/`, `/todo.html`, `/react-friendly.html`, and `/legacy-benchmark.html`.

## JSX runtime

```tsx
import { createRoot, useEffect, useState } from "zui";

function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    document.title = String(count);
  }, [count]);

  return <button onClick={() => setCount(n => n + 1)}>{count}</button>;
}

createRoot(document.getElementById("app")!).render(<Counter />);
```

Configure TypeScript with `jsx: "react-jsx"` and `jsxImportSource: "zui"`. Function components, ordinary conditional expressions, fragments, and keyed `.map()` output are supported.

## Explicit reactive API

```tsx
import { createStore, select, mount } from "zui/legacy";

const count = createStore(0);
mount(() => <button onClick={() => count.set(n => n + 1)}>
  {select(count, value => value)}
</button>, document.getElementById("app")!);
```

`zui/legacy` is a compatibility alias for the explicit reactive surface during the pre-1.0 migration. It uses the same `NodeRegistry` and `PatchEngine`; it is not an independent DOM renderer.

## Architecture guarantees

- `NodeRegistry` assigns monotonic `NodeId`, `RootId`, and `OwnerId` values and tracks parent/sibling structure plus versions.
- `PatchEngine` is the only module that creates, inserts, moves, patches, removes, or disposes browser DOM nodes.
- Reconciliation and reactive regions address nodes through the Flat Index; they do not retain a second authoritative child tree.
- A transaction validates operations, commits structural/property changes, then disposes removed subtrees.
- `useState`, `useEffect`, `Show`, `For`, keyed identity, refs, controlled values, focus, and caret behavior remain covered by tests.

## Scope

ZUI currently targets small client-side browser applications. SSR/hydration, portals, async resources, SVG parity, broad JSX intrinsic typing, devtools, and a compiler are future work rather than compatibility promises.

See [the roadmap](ROADMAP.md), [the API contract](docs/API.md), [the architecture](docs/ARCHITECTURE.md), [testing](docs/TESTING.md), and [verification status](docs/STATUS.md).

No CI/CD is configured by design.
