/** Compile with jsxImportSource pointed to the project's src directory. */
import { createStore, select, mount, Show, For } from "zui/legacy";

const store = createStore({ count: 0, show: true, items: [{ id: 1, text: "First" }] });
let renderCount = 0;

function App() {
  renderCount++;
  return <main>
    <h1>ZUI — mount-once counter</h1>
    <p>Count: {select(store, s => s.count)}</p>
    <p>Component calls: {renderCount}</p>
    <button onClick={() => store.set(s => ({ ...s, count: s.count + 1 }))}>Increment</button>
    <button onClick={() => store.set(s => ({ ...s, show: !s.show }))}>Toggle</button>
    <Show when={select(store, s => s.show)}>
      {() => <p>Visible branch, current count: {select(store, s => s.count)}</p>}
    </Show>
    <button onClick={() => store.set(s => ({
      ...s, items: [...s.items, { id: Date.now(), text: "New item" }]
    }))}>Add item</button>
    <ul><For each={select(store, s => s.items)} by={item => item.id}>
      {item => <li>{item.text}</li>}
    </For></ul>
  </main>;
}
mount(App, document.getElementById("app")!);
