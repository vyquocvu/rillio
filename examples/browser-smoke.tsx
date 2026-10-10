import { createRoot, useState } from "zui";

interface Row {
  id: number;
  label: string;
}

const initialRows: Row[] = [
  { id: 1, label: "Alpha" },
  { id: 2, label: "Beta" },
  { id: 3, label: "Gamma" }
];

function BrowserSmoke() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("ZUI");
  const [rows, setRows] = useState(initialRows);

  const shuffle = () => setRows(previous => [previous[1]!, previous[2]!, previous[0]!]);

  return <main id="browser-smoke" data-count={count}>
    <h1>Browser smoke</h1>
    <button id="increment" onClick={() => setCount(value => value + 1)}>Count: {count}</button>
    <label>Name <input id="name" value={name} onInput={(event: Event) => setName((event.currentTarget as HTMLInputElement).value)} /></label>
    <button id="focus-name" onClick={() => document.getElementById("name")?.focus()}>Focus name</button>
    <button id="shuffle" onClick={shuffle}>Shuffle</button>
    <p id="summary">{name} · {rows.length} rows</p>
    <ul id="rows">{rows.map(row => <li key={row.id} data-row={row.id}>
      <input data-label={row.id} value={row.label}
        onInput={(event: Event) => {
          const label = (event.currentTarget as HTMLInputElement).value;
          setRows(previous => previous.map(item => item.id === row.id ? { ...item, label } : item));
        }} />
    </li>)}</ul>
  </main>;
}

const errors: string[] = [];
window.addEventListener("error", event => errors.push(event.message));
window.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));

createRoot(document.getElementById("app")!).render(<BrowserSmoke />);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function runSmoke(): Promise<void> {
  await nextFrame();
  const increment = document.getElementById("increment") as HTMLButtonElement;
  const name = document.getElementById("name") as HTMLInputElement;
  const focusName = document.getElementById("focus-name") as HTMLButtonElement;
  const shuffleButton = document.getElementById("shuffle") as HTMLButtonElement;
  const summary = document.getElementById("summary")!;
  const rowOne = document.querySelector<HTMLInputElement>('[data-label="1"]')!;

  increment.click();
  assert(increment.textContent === "Count: 1", "state update did not commit");
  name.value = "Browser";
  name.dispatchEvent(new Event("input", { bubbles: true }));
  assert(summary.textContent?.startsWith("Browser ·"), "controlled input did not update");
  focusName.click();
  assert(document.activeElement === name, "ref-style focus flow failed");

  rowOne.focus();
  rowOne.setSelectionRange(2, 2);
  shuffleButton.click();
  const movedRowOne = document.querySelector<HTMLInputElement>('[data-label="1"]')!;
  assert(movedRowOne === rowOne, "keyed move replaced the input node");
  assert(document.activeElement === rowOne, "keyed move lost focus");
  assert(rowOne.selectionStart === 2 && rowOne.selectionEnd === 2, "keyed move lost caret");
  assert(document.querySelector("#rows li")?.getAttribute("data-row") === "2", "shuffle did not reorder rows");
  assert(errors.length === 0, `runtime errors: ${errors.join(" | ")}`);

  document.body.dataset.e2eStatus = "pass";
  document.body.dataset.e2eChecks = "state,input,focus,key,caret,errors";
}

runSmoke().catch(error => {
  document.body.dataset.e2eStatus = "fail";
  document.body.dataset.e2eError = error instanceof Error ? error.message : String(error);
});
