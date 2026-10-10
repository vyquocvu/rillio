import { createRoot, useEffect, useMemo, useRef, useState } from "zui";

interface Item { id: number; value: number }

function createItems(size: number, offset = 0): Item[] {
  return Array.from({ length: size }, (_, index) => ({ id: index, value: index + offset }));
}

function BrowserBenchmark() {
  const [size, setSize] = useState(500);
  const [items, setItems] = useState<Item[]>(() => createItems(500));
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [runs, setRuns] = useState(0);
  const sequence = useRef(0);
  const total = useMemo(() => items.reduce((sum, item) => sum + item.value, 0), [items]);

  useEffect(() => {
    document.title = `ZUI benchmark — ${items.length} rows`;
  }, [items.length]);

  const resize = (event: Event) => {
    const nextSize = Number((event.currentTarget as HTMLInputElement).value);
    setSize(nextSize);
    setItems(createItems(nextSize, sequence.current));
  };

  const run = () => {
    const iterations = 5;
    let elapsed = 0;
    for (let iteration = 0; iteration < iterations; iteration++) {
      const started = performance.now();
      setItems(previous => previous.map(item => ({ ...item, value: item.value + 1 })));
      elapsed += performance.now() - started;
    }
    sequence.current += iterations;
    setRuns(previous => previous + iterations);
    setLastRun(elapsed / iterations);
  };

  return <main style={{ maxWidth: "920px", margin: "2rem auto", fontFamily: "system-ui", padding: "1rem" }}>
    <h1>Browser renderer benchmark</h1>
    <p>This measures synchronous state updates and keyed DOM patches in this browser.</p>
    <label>
      Rows{" "}
      <input type="range" min="50" max="2000" step="50" value={size} onInput={resize} />{" "}
      {size}
    </label>{" "}
    <button onClick={run}>Update all rows × 5</button>
    <p>Average commit: {lastRun === null ? "not measured" : `${lastRun.toFixed(2)} ms`} · Runs: {runs} · Checksum: {total}</p>
    <ul>{items.map(item => <li key={item.id} data-value={item.value}>Item {item.id}: {item.value}</li>)}</ul>
  </main>;
}

createRoot(document.getElementById("app")!).render(<BrowserBenchmark />);
