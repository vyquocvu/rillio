/** Compile with jsxImportSource pointed to the project's src directory. */
import { createStore } from "@vyquocvu/rillio/reactive";
import { select, mount, Show, For } from "@vyquocvu/rillio/dom";

const store = createStore({ count: 0, show: true, items: [{ id: 1, text: "First" }] });
let renderCount = 0;

function App() {
  renderCount++;
  return <main>
    <h1>Rillio — mount-once counter</h1>
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

if (new URLSearchParams(location.search).has("e2e")) {
  const errors: string[] = [];
  window.addEventListener("error", event => errors.push(event.message));
  window.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const runCounterSmoke = async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const increment = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent === "Increment")!;
    const count = [...document.querySelectorAll("main p")]
      .find(node => node.textContent?.startsWith("Count:"))!;
    increment.click();
    assert(count.textContent === "Count: 1", `counter flow failed: ${count.textContent}`);
    assert(errors.length === 0, `counter runtime errors: ${errors.join(" | ")}`);
    document.body.dataset.e2eStatus = "pass";
    document.body.dataset.e2eChecks = "counter-increment";
  };
  runCounterSmoke().catch(error => {
    document.body.dataset.e2eStatus = "fail";
    document.body.dataset.e2eError = error instanceof Error ? error.message : String(error);
  });
}
