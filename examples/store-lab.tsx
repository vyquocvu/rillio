import { createRoot, useRef } from "rillio";
import { create, shallow } from "../src/external-store.ts";

interface StoreState {
  count: number;
  name: string;
  increase: () => void;
  rename: () => void;
}

const useDemoStore = create<StoreState>(set => ({
  count: 0,
  name: "Ada Lovelace",
  increase: () => set(state => ({ count: state.count + 1 })),
  rename: () => set(state => ({ name: state.name === "Ada Lovelace" ? "Grace Hopper" : "Ada Lovelace" })),
}));

function useRenderTrace(name: string): number {
  const renders = useRef(0);
  renders.current += 1;
  console.log(`[store-lab] ${name} render #${renders.current}`);
  // Keep the overview in sync without subscribing it to the demo store. If it
  // subscribed, updating the counters could itself trigger more renders.
  queueMicrotask(() => {
    const counter = document.querySelector<HTMLOutputElement>(`[data-render-count="${name}"]`);
    if (counter) counter.value = String(renders.current);
  });
  return renders.current;
}

function CountSlice() {
  const count = useDemoStore(state => state.count);
  const increase = useDemoStore(state => state.increase);
  const renders = useRenderTrace("CountSlice");
  return (
    <section class="lab-card" id="count-slice">
      <h2>Count selector</h2>
      <p class="lab-muted">Subscribes to a number. Rename should not render this component.</p>
      <div class="lab-value"><strong id="slice-count">{count}</strong><span>count</span></div>
      <div class="lab-pill">Render #{renders}</div>
      <div class="lab-actions"><button class="lab-button lab-button--primary" id="increase-count" onClick={increase}>Increase count</button></div>
    </section>
  );
}

function NameSlice() {
  const name = useDemoStore(state => state.name);
  const renders = useRenderTrace("NameSlice");
  return (
    <section class="lab-card" id="name-slice">
      <h2>Name selector</h2>
      <p class="lab-muted">Subscribes to a string. Count changes should not render this component.</p>
      <div class="lab-value"><strong id="slice-name" style={{ fontSize: "20px" }}>{name}</strong></div>
      <div class="lab-pill">Render #{renders}</div>
      <div class="lab-actions"><button class="lab-button" id="rename" onClick={() => useDemoStore.getState().rename()}>Change name</button></div>
    </section>
  );
}

function CombinedSlice() {
  const summary = useDemoStore(state => ({ count: state.count, name: state.name }), shallow);
  const renders = useRenderTrace("CombinedSlice");
  return (
    <section class="lab-card" id="combined-slice">
      <h2>Shallow object selector</h2>
      <p class="lab-muted">Returns a fresh object, compared field-by-field with <code>shallow</code>.</p>
      <div class="lab-value"><strong id="combined-summary" style={{ fontSize: "18px" }}>{summary.name} · {summary.count}</strong></div>
      <div class="lab-pill">Render #{renders}</div>
    </section>
  );
}

function App() {
  const renders = useRenderTrace("App");
  return (
    <main class="lab-shell">
      <div class="lab-topline"><a href="/demos.html">Rillio examples</a><span>/</span><span>Store selectors</span></div>
      <header class="lab-hero">
        <h1>Store selector lab</h1>
        <p>Update one field at a time, then compare the console. A selector should notify its component only when its selected value changes; the shallow object selector should update when either field changes.</p>
        <div class="lab-callout">Logs use <code>[store-lab]</code>. The App component renders {renders} time initially and should not render again when the store changes.</div>
      </header>
      <section class="lab-card lab-render-overview" aria-labelledby="render-overview-title">
        <div>
          <h2 id="render-overview-title">Render count by component</h2>
          <p class="lab-muted">Counts function renders. A text or DOM node can update without its parent component rendering.</p>
        </div>
        <dl class="lab-render-counts">
          <div><dt>App</dt><dd><output data-render-count="App">{renders}</output></dd></div>
          <div><dt>CountSlice</dt><dd><output data-render-count="CountSlice">0</output></dd></div>
          <div><dt>NameSlice</dt><dd><output data-render-count="NameSlice">0</output></dd></div>
          <div><dt>CombinedSlice</dt><dd><output data-render-count="CombinedSlice">0</output></dd></div>
        </dl>
      </section>
      <div class="lab-grid">
        <CountSlice />
        <NameSlice />
        <CombinedSlice />
        <section class="lab-card">
          <h2>Expected signal</h2>
          <p>Click <b>Increase count</b>: <code>CountSlice</code> and <code>CombinedSlice</code> render. Click <b>Change name</b>: <code>NameSlice</code> and <code>CombinedSlice</code> render.</p>
          <pre class="lab-codeblock">No App render on either store update
Unchanged selectors stay quiet</pre>
        </section>
      </div>
      <footer class="lab-footer"><span>Console prefix: <code>[store-lab]</code></span><a href="/data-lab.html">Next: reactive data lab →</a></footer>
    </main>
  );
}

const container = document.getElementById("app");
if (container) createRoot(container).render(<App />);
