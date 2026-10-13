# ZUI

ZUI is an experimental addressable-DOM runtime. It preserves familiar JSX authoring, while DOM identity, structure, ownership, and lifecycle are owned by a Flat Index rather than by a Virtual DOM tree.

The production DOM write path is one transactional `PatchEngine`:

```mermaid
flowchart LR
    accTitle: ZUI addressable architecture
    accDescr: JSX and explicit reactive planners share one transaction, registry, and patch engine before the browser DOM is updated.

    jsx_input([📥 JSX input])
    reactive_input([📥 Reactive input])

    subgraph planning ["🧠 Planning"]
        jsx_planner[⚙️ JSX planner]
        reactive_planner[⚙️ Reactive planner]
    end

    patch_transaction[[🔄 Patch transaction]]
    node_registry[(📝 NodeRegistry)]
    patch_engine[⚙️ PatchEngine]
    browser_dom[(🌐 Browser DOM)]

    jsx_input --> jsx_planner
    reactive_input --> reactive_planner
    jsx_planner --> patch_transaction
    reactive_planner --> patch_transaction
    patch_transaction --> node_registry
    patch_transaction --> patch_engine
    node_registry -.-> patch_engine
    patch_engine --> browser_dom
```

The React-like spelling is syntax inspiration only. ZUI does not promise React or Preact behavioral compatibility. Both planners share the same indexed identity and DOM mutation boundary.

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
npm run bench:browser
```

Open `/demos.html` for the example catalog. The primary showcase is available at `/` and `/admin.html`; benchmark commands and package examples are documented in [the examples guide](docs/EXAMPLES.md), with the Playwright React comparison in [the performance guide](docs/PERFORMANCE.md).

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

## UI primitives

The optional `zui/ui` surface provides a small, dependency-free visual layer for product work. It keeps rendering inside ZUI while offering accessible defaults, shared tokens, and composable controls:

```tsx
import { Button, Card, Input, StyleSheet } from "zui/ui";

function SignIn() {
  return <>
    <StyleSheet />
    <Card title="Welcome back" description="Sign in to your workspace.">
      <Input label="Work email" type="email" placeholder="you@company.com" />
      <Button type="submit">Continue</Button>
    </Card>
  </>;
}
```

Available primitives include `Button`, `IconButton`, `Badge`, `Avatar`, `Card`, `Field`, `Input`, `Progress`, `Modal`, `Stack`, `Inline`, and `EmptyState`. `tokens`, `cx`, and `uiStyles` are exported for teams that want to extend the visual language.

## Zustand

Use [`zui/zustand`](docs/API.md#zustand-integration) to select state from a Zustand vanilla or bound store inside ZUI components. It follows the store's `getState`/`subscribe` API and does not add Zustand or React as runtime dependencies.

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

ZUI currently targets small client-side browser applications. SSR/hydration, portals, async resources, complete SVG/property normalization, exhaustive DOM typings, devtools, and a compiler are future work rather than compatibility promises.

See [the roadmap](ROADMAP.md), [the API contract](docs/API.md), [the architecture](docs/ARCHITECTURE.md), [testing](docs/TESTING.md), and [verification status](docs/STATUS.md).

No CI/CD is configured by design.
