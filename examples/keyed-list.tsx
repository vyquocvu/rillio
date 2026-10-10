import { createRoot, useMemo, useState } from "zui";

interface Row { id: number; label: string; color: string }

const colors = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a"];
let nextId = 25;

function createRows(size: number): Row[] {
  return Array.from({ length: size }, (_, index) => ({
    id: index + 1,
    label: `Row ${index + 1}`,
    color: colors[index % colors.length]!
  }));
}

function KeyedList() {
  const [rows, setRows] = useState<Row[]>(() => createRows(24));
  const [selected, setSelected] = useState<number | null>(null);
  const selectedRow = useMemo(
    () => rows.find(row => row.id === selected),
    [rows, selected]
  );

  const shuffle = () => setRows(previous => {
    const next = [...previous];
    for (let index = next.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [next[index], next[swap]] = [next[swap]!, next[index]!];
    }
    return next;
  });

  return <main style={{ maxWidth: "760px", margin: "2rem auto", fontFamily: "system-ui", padding: "1rem" }}>
    <h1>Keyed list playground</h1>
    <p>Reorder rows while preserving each keyed input and its DOM identity.</p>
    <button onClick={() => setRows(previous => {
      const id = nextId++;
      return [...previous, { id, label: `Row ${id}`, color: colors[id % colors.length]! }];
    })}>Add row</button>{" "}
    <button onClick={() => setRows(previous => previous.slice(0, -1))}>Remove last</button>{" "}
    <button onClick={shuffle}>Shuffle</button>{" "}
    <button onClick={() => setRows(createRows(24))}>Reset</button>
    <p>{rows.length} rows · Selected: {selectedRow?.label ?? "none"}</p>
    <ol>{rows.map(row => <li key={row.id} style={{ margin: "0.35rem 0" }}>
      <button onClick={() => setSelected(row.id)} style={{ color: row.color }}>
        Select
      </button>{" "}
      <input value={row.label}
        onInput={(event: Event) => {
          const label = (event.currentTarget as HTMLInputElement).value;
          setRows(previous => previous.map(item => item.id === row.id ? { ...item, label } : item));
        }} />
      <small> key={row.id}</small>
    </li>)}</ol>
  </main>;
}

createRoot(document.getElementById("app")!).render(<KeyedList />);
