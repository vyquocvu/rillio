import "./interactive.css";
import {
  assertRows,
  createRenderer,
  makeRows,
  makeTree,
  nextRows,
  type Framework,
  type Scenario
} from "./browser.ts";

const frameworks: Framework[] = ["rillio", "react", "preact", "vue"];
const scenarios: Array<{ id: Scenario; title: string; detail: string }> = [
  { id: "mount", title: "Fresh mount", detail: "Create a new keyed list and attach every row." },
  { id: "noop", title: "No-op update", detail: "Render the same row data again and retain the current order." },
  { id: "text", title: "Text update", detail: "Change each row's text while keeping keyed elements." },
  { id: "append-remove", title: "Append + remove", detail: "Alternate between adding and removing one tail row." },
  { id: "rotate", title: "Rotate keyed rows", detail: "Move the first row to the end of the list." },
  { id: "reverse", title: "Reverse keyed rows", detail: "Reverse the full keyed list while preserving row identity." }
];

interface ListResult {
  framework: Framework;
  scenario: Scenario;
  size: number;
  samples: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  valuesMs: number[];
  treeValuesMs: number[];
  updateValuesMs: number[];
}

interface CaseMeasurement {
  result: ListResult;
  dom: ReturnType<typeof countDOM>;
  renderedRows: number;
}

interface BrowserWithMemory extends Performance {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

const root = document.querySelector<HTMLDivElement>("#benchmark-app");
if (!root) throw new Error("Benchmark app root is missing");

root.innerHTML = `
  <main class="bench-shell">
    <div class="bench-topline"><a href="/demos.html">Rillio Studio</a><span>/</span><span>Live browser benchmarks</span></div>
    <header class="bench-hero">
      <div class="bench-hero-copy">
        <span class="bench-eyebrow">Real DOM · Local browser · Repeatable cases</span>
        <h1>Renderer Bench</h1>
        <p>Run each keyed-list workload in Rillio, React, Preact, and Vue. Every case is visible below, and each one renders live in this page.</p>
      </div>
      <div class="bench-hero-mark" aria-hidden="true"><span>μs</span><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </header>

    <section class="bench-control-card" aria-labelledby="run-title">
      <div class="bench-section-heading">
        <div><span class="bench-kicker">01 / Workload</span><h2 id="run-title">Set the run size</h2></div>
        <span class="bench-live-badge"><span></span> Runs in this tab</span>
      </div>
      <div class="bench-controls">
        <label class="bench-field"><span>Rows</span><input id="size" type="number" min="1" max="5000" step="50" value="500" /><small>1–5,000 keyed rows</small></label>
        <label class="bench-field"><span>Warmups</span><input id="warmup" type="number" min="0" max="10" value="2" /><small>Discarded runs</small></label>
        <label class="bench-field"><span>Samples</span><input id="samples" type="number" min="3" max="25" value="7" /><small>Report median + p95</small></label>
        <button id="run-all" class="bench-run-button" type="button"><span>▶</span> Run all 6 cases</button>
      </div>
      <div class="bench-protocol"><span>Timing includes tree creation, synchronous renderer commit, and a forced style/layout read.</span><span id="mode-note"></span></div>
      <div id="status" class="bench-status" role="status" aria-live="polite">Run any visible case or the complete suite to collect fresh browser timings.</div>
    </section>

    <section class="bench-cases" aria-labelledby="cases-title">
      <div class="bench-section-heading"><div><span class="bench-kicker">02 / Cases</span><h2 id="cases-title">All benchmark cases</h2></div><p class="bench-section-note">Run any case by itself or run the complete six-case suite.</p></div>
      <div id="case-grid" class="bench-case-grid"></div>
    </section>

    <section class="bench-metrics" aria-label="Browser environment">
      <article class="bench-metric"><span class="bench-metric-icon bench-icon--blue">◉</span><div><small>Browser</small><strong id="browser-label">Detecting…</strong></div></article>
      <article class="bench-metric"><span class="bench-metric-icon bench-icon--violet">⌘</span><div><small>Logical threads</small><strong id="threads-label">—</strong></div></article>
      <article class="bench-metric"><span class="bench-metric-icon bench-icon--green">▧</span><div><small>Device memory hint</small><strong id="device-memory-label">—</strong></div></article>
      <article class="bench-metric"><span class="bench-metric-icon bench-icon--orange">▤</span><div><small>Page JS heap</small><strong id="heap-label">—</strong></div></article>
    </section>

    <section class="bench-results" aria-labelledby="results-title">
      <div class="bench-section-heading bench-results-heading">
        <div><span class="bench-kicker">03 / Measurements</span><h2 id="results-title">Waiting for a run</h2></div>
        <span id="correctness" class="bench-correctness">No measurements yet</span>
      </div>
      <div class="bench-table-wrap">
        <table>
          <thead><tr><th>Case · base rows</th><th>Renderer</th><th>Median</th><th>P95</th><th>Tree build</th><th>DOM commit + layout</th><th>DOM nodes</th><th>Output rows</th></tr></thead>
          <tbody id="results"><tr><td class="bench-empty" colspan="8">Run a case to see real browser measurements.</td></tr></tbody>
        </table>
      </div>
      <p class="bench-heap-note">Heap is a page-wide Chromium estimate when the browser exposes it; it includes all loaded frameworks and is not attributed to an individual renderer. DOM node counts are measured per rendered preview.</p>
    </section>

    <section class="bench-previews" aria-labelledby="previews-title">
      <div class="bench-section-heading">
        <div><span class="bench-kicker">04 / Rendered output</span><h2 id="previews-title">Live browser previews</h2></div>
        <p class="bench-section-note">Scroll each panel to inspect the latest completed case rendered by that library.</p>
      </div>
      <div id="preview-grid" class="bench-preview-grid"></div>
    </section>

    <footer class="bench-footer"><span>Local measurements vary with browser, hardware, extensions, and background load.</span><a href="https://github.com/vyquocvu/rillio/blob/main/docs/PERFORMANCE.md">Read the benchmark protocol ↗</a></footer>
  </main>
`;

const sizeInput = root.querySelector<HTMLInputElement>("#size")!;
const warmupInput = root.querySelector<HTMLInputElement>("#warmup")!;
const samplesInput = root.querySelector<HTMLInputElement>("#samples")!;
const runAllButton = root.querySelector<HTMLButtonElement>("#run-all")!;
const status = root.querySelector<HTMLDivElement>("#status")!;
const resultsBody = root.querySelector<HTMLTableSectionElement>("#results")!;
const previewGrid = root.querySelector<HTMLDivElement>("#preview-grid")!;
const correctness = root.querySelector<HTMLSpanElement>("#correctness")!;
const modeNote = root.querySelector<HTMLSpanElement>("#mode-note")!;
const rendererNames: Record<Framework, string> = { rillio: "Rillio", react: "React", preact: "Preact", vue: "Vue" };
const previews = new Map<Framework, { stage: HTMLDivElement; unmount: () => void }>();
const measurements = new Map<Scenario, CaseMeasurement[]>();
let isRunning = false;

for (const scenario of scenarios) {
  const card = document.createElement("article");
  card.className = "bench-case-card";
  const number = document.createElement("span");
  number.className = "bench-case-number";
  number.textContent = String(scenarios.indexOf(scenario) + 1).padStart(2, "0");
  const copy = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = scenario.title;
  const detail = document.createElement("p");
  detail.textContent = scenario.detail;
  const run = document.createElement("button");
  run.className = "bench-case-run";
  run.type = "button";
  run.dataset.runScenario = scenario.id;
  run.textContent = "Run case";
  copy.append(heading, detail);
  card.append(number, copy, run);
  root.querySelector<HTMLDivElement>("#case-grid")!.append(card);
}

root.querySelectorAll<HTMLButtonElement>("[data-run-scenario]").forEach(button => {
  button.addEventListener("click", () => {
    const scenario = button.dataset.runScenario as Scenario;
    void runSelectedCase(scenario);
  });
});

for (const framework of frameworks) {
  const card = document.createElement("article");
  card.className = `bench-preview-card bench-preview-card--${framework}`;
  const top = document.createElement("div");
  top.className = "bench-preview-top";
  const title = document.createElement("h3");
  title.textContent = rendererNames[framework];
  const badge = document.createElement("span");
  badge.className = "bench-preview-stat";
  badge.textContent = "Ready";
  const stage = document.createElement("div");
  stage.className = "bench-preview-stage";
  stage.setAttribute("aria-label", `${rendererNames[framework]} rendered rows`);
  const footer = document.createElement("div");
  footer.className = "bench-preview-footer";
  footer.textContent = "Run a case to populate this renderer.";
  top.append(title, badge);
  card.append(top, stage, footer);
  previewGrid.append(card);
  previews.set(framework, { stage, unmount: () => {} });
}

function readInteger(input: HTMLInputElement, name: string, minimum: number, maximum: number): number {
  const value = Number(input.value);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be from ${minimum} to ${maximum}.`);
  }
  return value;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

function milliseconds(value: number): string {
  if (value < 0.001) return "<1 μs";
  if (value < 1) return `${(value * 1000).toFixed(0)} μs`;
  if (value < 10) return `${value.toFixed(2)} ms`;
  return `${value.toFixed(1)} ms`;
}

function countDOM(stage: HTMLDivElement) {
  const counts = { elements: 0, text: 0, comments: 0, total: 0 };
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_ALL);
  while (walker.nextNode()) {
    counts.total++;
    if (walker.currentNode.nodeType === Node.ELEMENT_NODE) counts.elements++;
    else if (walker.currentNode.nodeType === Node.TEXT_NODE) counts.text++;
    else if (walker.currentNode.nodeType === Node.COMMENT_NODE) counts.comments++;
  }
  return counts;
}

function currentHeapBytes(): number | null {
  const memory = (performance as BrowserWithMemory).memory;
  return memory && Number.isFinite(memory.usedJSHeapSize) ? memory.usedJSHeapSize : null;
}

function updateEnvironment() {
  const agent = navigator.userAgent;
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chromium" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser";
  root.querySelector<HTMLElement>("#browser-label")!.textContent = browser;
  root.querySelector<HTMLElement>("#threads-label")!.textContent = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} threads` : "Not exposed";
  const deviceMemory = (navigator as NavigatorWithDeviceMemory).deviceMemory;
  root.querySelector<HTMLElement>("#device-memory-label")!.textContent = deviceMemory ? `~${deviceMemory} GB` : "Not exposed";
  const heap = currentHeapBytes();
  root.querySelector<HTMLElement>("#heap-label")!.textContent = heap === null ? "Not exposed" : `${(heap / 1024 / 1024).toFixed(1)} MB`;
}

if (import.meta.env.DEV) {
  modeNote.textContent = "Dev server detected: use a production build for timing comparisons.";
  modeNote.classList.add("bench-dev-note");
} else {
  modeNote.textContent = "Production bundle loaded.";
}

function removePreviews() {
  for (const [framework, preview] of previews) {
    preview.unmount();
    preview.stage.replaceChildren();
    const card = preview.stage.closest<HTMLElement>(".bench-preview-card")!;
    card.querySelector<HTMLElement>(".bench-preview-stat")!.textContent = "Ready";
    card.querySelector<HTMLElement>(".bench-preview-footer")!.textContent = "Run a case to populate this renderer.";
    previews.set(framework, { ...preview, unmount: () => {} });
  }
}

function buildFinalRows(scenario: Scenario, size: number, updates: number) {
  let rows = makeRows(size);
  if (scenario !== "mount") {
    for (let iteration = 1; iteration <= updates; iteration++) {
      rows = nextRows(rows, scenario, iteration, size);
    }
  }
  return rows;
}

function addResultCell(row: HTMLTableRowElement, value: string, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = value;
  row.append(cell);
}

function renderResult(scenario: Scenario, measurement: CaseMeasurement) {
  const { result, dom, renderedRows } = measurement;
  const row = document.createElement("tr");
  row.className = `bench-result-row bench-result-row--${result.framework}`;
  const scenarioTitle = scenarios.find(candidate => candidate.id === scenario)!.title;
  addResultCell(row, `${scenarioTitle} · ${result.size.toLocaleString()}`, "bench-scenario-cell");
  addResultCell(row, rendererNames[result.framework], "bench-framework-cell");
  addResultCell(row, milliseconds(result.medianMs), "bench-time-cell");
  addResultCell(row, milliseconds(result.p95Ms));
  addResultCell(row, milliseconds(median(result.treeValuesMs)));
  addResultCell(row, milliseconds(median(result.updateValuesMs)));
  addResultCell(row, `${dom.total.toLocaleString()} total`, "bench-node-cell");
  addResultCell(row, renderedRows.toLocaleString(), "bench-row-cell");
  resultsBody.append(row);
}

function renderMeasurements() {
  resultsBody.replaceChildren();
  let checkCount = 0;
  for (const scenario of scenarios) {
    const entries = measurements.get(scenario.id);
    if (!entries) continue;
    for (const entry of entries) renderResult(scenario.id, entry);
    checkCount += entries.length;
  }

  if (checkCount === 0) {
    const empty = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "bench-empty";
    cell.colSpan = 8;
    cell.textContent = "Run a case to see real browser measurements.";
    empty.append(cell);
    resultsBody.append(empty);
    correctness.className = "bench-correctness";
    correctness.textContent = "No measurements yet";
    root.querySelector<HTMLElement>("#results-title")!.textContent = "Waiting for a run";
    return;
  }

  correctness.className = "bench-correctness bench-correctness--passed";
  correctness.textContent = `${measurements.size} / ${scenarios.length} cases · ${checkCount} renderer checks passed`;
  root.querySelector<HTMLElement>("#results-title")!.textContent = `Measurements · ${measurements.size} of ${scenarios.length} cases`;
}

function setRunning(running: boolean, label = "") {
  isRunning = running;
  runAllButton.disabled = running;
  runAllButton.innerHTML = running
    ? `<span class="bench-spinner"></span> ${label || "Running…"}`
    : `<span>▶</span> Run all 6 cases`;
  root.querySelectorAll<HTMLButtonElement>("[data-run-scenario]").forEach(button => {
    button.disabled = running;
  });
}

function readRunConfig() {
  let size: number;
  let warmup: number;
  let samples: number;
  try {
    size = readInteger(sizeInput, "Rows", 1, 5000);
    warmup = readInteger(warmupInput, "Warmups", 0, 10);
    samples = readInteger(samplesInput, "Samples", 3, 25);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.className = "bench-status bench-status--error";
    return null;
  }
  return { size, warmup, samples };
}

async function executeScenario(scenario: Scenario, config: { size: number; warmup: number; samples: number }, suitePosition: number, suiteSize: number) {
  const { size, warmup, samples } = config;
  removePreviews();
  updateEnvironment();
  const finalRows = buildFinalRows(scenario, size, warmup + samples);
  const entries: CaseMeasurement[] = [];
  for (let index = 0; index < frameworks.length; index++) {
    const framework = frameworks[index]!;
    const preview = previews.get(framework)!;
    const scenarioTitle = scenarios.find(candidate => candidate.id === scenario)!.title;
    status.textContent = `${scenarioTitle} · case ${suitePosition}/${suiteSize} · ${rendererNames[framework]} ${index + 1}/${frameworks.length}`;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const result = window.runListBenchmark({
      framework,
      scenario,
      size,
      warmup,
      samples,
      container: preview.stage,
      flushLayout: true
    });

    // The timed renderer is disposed by the harness. Mount one final snapshot so readers can
    // inspect the real DOM for every library at once after the measurements finish.
    const renderer = createRenderer(framework, preview.stage);
    previews.set(framework, { ...preview, unmount: () => renderer.unmount() });
    renderer.render(makeTree(framework, finalRows));
    void preview.stage.offsetHeight;
    assertRows(preview.stage, finalRows, framework, scenario, size);
    const dom = countDOM(preview.stage);
    preview.stage.closest<HTMLElement>(".bench-preview-card")!.querySelector<HTMLElement>(".bench-preview-stat")!.textContent = `${dom.total.toLocaleString()} DOM nodes`;
    preview.stage.closest<HTMLElement>(".bench-preview-card")!.querySelector<HTMLElement>(".bench-preview-footer")!.textContent = `${finalRows.length.toLocaleString()} rows · ${dom.elements.toLocaleString()} elements · ${dom.text.toLocaleString()} text nodes · ${dom.comments.toLocaleString()} comments`;
    previews.set(framework, { ...preview, unmount: () => renderer.unmount() });
    entries.push({ result, dom, renderedRows: finalRows.length });
  }

  measurements.set(scenario, entries);
  renderMeasurements();
  updateEnvironment();
}

async function runSelectedCase(scenario: Scenario) {
  if (isRunning) return;
  const config = readRunConfig();
  if (!config) return;
  setRunning(true, "Running case…");
  correctness.className = "bench-correctness bench-correctness--running";
  correctness.textContent = "Checking rendered output";
  status.className = "bench-status bench-status--running";
  try {
    await executeScenario(scenario, config, 1, 1);
    status.className = "bench-status bench-status--success";
    status.textContent = `Finished ${scenarios.find(candidate => candidate.id === scenario)!.title} in this browser · ${config.size.toLocaleString()} base rows · ${config.warmup} warmups · ${config.samples} samples per renderer.`;
  } catch (error) {
    removePreviews();
    correctness.className = "bench-correctness bench-correctness--failed";
    status.className = "bench-status bench-status--error";
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setRunning(false);
  }
}

async function runAllCases() {
  if (isRunning) return;
  const config = readRunConfig();
  if (!config) return;
  measurements.clear();
  renderMeasurements();
  setRunning(true, `0/${scenarios.length} cases`);
  correctness.className = "bench-correctness bench-correctness--running";
  correctness.textContent = "Running full case suite";
  status.className = "bench-status bench-status--running";
  try {
    for (let index = 0; index < scenarios.length; index++) {
      const scenario = scenarios[index]!;
      setRunning(true, `${index + 1}/${scenarios.length} cases`);
      await executeScenario(scenario.id, config, index + 1, scenarios.length);
    }
    root.querySelector<HTMLElement>("#results-title")!.textContent = `All ${scenarios.length} cases · ${config.size.toLocaleString()} base rows`;
    correctness.className = "bench-correctness bench-correctness--passed";
    correctness.textContent = `${scenarios.length} / ${scenarios.length} cases · ${scenarios.length * frameworks.length} renderer checks passed`;
    status.className = "bench-status bench-status--success";
    status.textContent = `Completed all ${scenarios.length} browser cases with ${config.size.toLocaleString()} base rows, ${config.warmup} warmups, and ${config.samples} measured samples per renderer.`;
  } catch (error) {
    removePreviews();
    correctness.className = "bench-correctness bench-correctness--failed";
    correctness.textContent = `${measurements.size} / ${scenarios.length} cases completed before failure`;
    status.className = "bench-status bench-status--error";
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setRunning(false);
  }
}

runAllButton.addEventListener("click", () => { void runAllCases(); });

function renderInitialPreviews() {
  const rows = makeRows(12);
  for (const framework of frameworks) {
    const preview = previews.get(framework)!;
    const renderer = createRenderer(framework, preview.stage);
    renderer.render(makeTree(framework, rows));
    assertRows(preview.stage, rows, framework, "mount", rows.length);
    const dom = countDOM(preview.stage);
    preview.stage.closest<HTMLElement>(".bench-preview-card")!.querySelector<HTMLElement>(".bench-preview-stat")!.textContent = `${dom.total.toLocaleString()} DOM nodes`;
    preview.stage.closest<HTMLElement>(".bench-preview-card")!.querySelector<HTMLElement>(".bench-preview-footer")!.textContent = `${rows.length} rows · ${dom.elements} elements · ${dom.text} text nodes · ${dom.comments} comments`;
    previews.set(framework, { ...preview, unmount: () => renderer.unmount() });
  }
}

updateEnvironment();
renderInitialPreviews();
