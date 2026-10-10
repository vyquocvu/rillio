import { createStore, derive, For, mount, select } from "zui/legacy";

interface Item { id: number; value: number }
interface State { size: number; items: Item[]; average: number | null; runs: number }

function createItems(size: number): Item[] {
  return Array.from({ length: size }, (_, id) => ({ id, value: id }));
}

const state = createStore<State>({
  size: 500,
  items: createItems(500),
  average: null,
  runs: 0
});

function resize(event: Event) {
  const size = Number((event.currentTarget as HTMLInputElement).value);
  state.set(previous => ({ ...previous, size, items: createItems(size) }));
}

function runBenchmark() {
  const iterations = 5;
  let elapsed = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const started = performance.now();
    state.set(previous => ({
      ...previous,
      items: previous.items.map(item => ({ ...item, value: item.value + 1 }))
    }));
    elapsed += performance.now() - started;
  }
  state.set(previous => ({
    ...previous,
    average: elapsed / iterations,
    runs: previous.runs + iterations
  }));
}

function App() {
  return <main style={{ maxWidth: "920px", margin: "2rem auto", fontFamily: "system-ui", padding: "1rem" }}>
    <h1>Legacy DOM benchmark</h1>
    <p>This measures store updates and keyed <code>For</code> reconciliation.</p>
    <label>
      Rows{" "}
      <input type="range" min="50" max="2000" step="50" value={select(state, value => value.size)} onInput={resize} />{" "}
      {select(state, value => value.size)}
    </label>{" "}
    <button onClick={runBenchmark}>Update all rows × 5</button>
    <p>
      Average commit: {select(state, value => value.average === null ? "not measured" : `${value.average.toFixed(2)} ms`)} ·{" "}
      Runs: {select(state, value => value.runs)}
    </p>
    <ul><For
      each={select(state, value => value.items)}
      by={item => item.id}
      children={(item, current) => <li key={item.id}>Item {item.id}: {derive(() => current().value)}</li>}
    /></ul>
  </main>;
}

mount(App, document.getElementById("app")!);
