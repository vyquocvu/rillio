import { createElement } from "react";
import { createRoot as createReactRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { h as preactH, render as preactRender } from "preact";
import { h as vueH, render as vueRender } from "vue";
import { createRoot as createZuiRoot, jsx as zuiJsx } from "../src/compat.ts";

type Framework = "zui" | "react" | "preact" | "vue";
type Scenario = "mount" | "noop" | "text" | "append-remove" | "rotate" | "reverse";
type Row = { id: number; value: string };

interface BenchmarkOptions {
  framework: Framework;
  scenario: Scenario;
  size: number;
  warmup: number;
  samples: number;
}

declare global {
  interface Window {
    validateListBenchmark(options: BenchmarkOptions): void;
    runListBenchmark(options: BenchmarkOptions): {
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
    };
  }
}

function makeRows(size: number): Row[] {
  return Array.from({ length: size }, (_, id) => ({ id, value: String(id) }));
}

function nextRows(rows: Row[], scenario: Scenario, iteration: number, baseSize: number): Row[] {
  if (scenario === "noop") return rows;
  if (scenario === "text") return rows.map(row => ({ ...row, value: `${row.id}:${iteration}` }));
  if (scenario === "append-remove") {
    return rows.length === baseSize
      ? [...rows, { id: baseSize, value: `new:${iteration}` }]
      : rows.slice(0, baseSize);
  }
  if (scenario === "reverse") return [...rows].reverse();
  return rows.length < 2 ? rows : [...rows.slice(1), rows[0]!];
}

function makeTree(framework: Framework, rows: Row[]): unknown {
  if (framework === "react") {
    return createElement("ul", null, rows.map(row => createElement(
      "li",
      { key: row.id, "data-id": String(row.id) },
      row.value
    )));
  }

  if (framework === "preact") {
    return preactH("ul", null, rows.map(row => preactH(
      "li",
      { key: row.id, "data-id": String(row.id) },
      row.value
    )));
  }

  if (framework === "vue") {
    return vueH("ul", null, rows.map(row => vueH(
      "li",
      { key: row.id, "data-id": String(row.id) },
      row.value
    )));
  }

  return zuiJsx("ul", {
    children: rows.map(row => zuiJsx("li", {
      "data-id": String(row.id),
      children: row.value
    }, row.id))
  });
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function createRenderer(framework: Framework, container: HTMLDivElement) {
  if (framework === "react") {
    const root = createReactRoot(container);
    return {
      render: (tree: unknown) => flushSync(() => root.render(tree as never)),
      unmount: () => root.unmount()
    };
  }

  if (framework === "preact") {
    return {
      render: (tree: unknown) => preactRender(tree as never, container),
      unmount: () => preactRender(null, container)
    };
  }

  if (framework === "vue") {
    return {
      render: (tree: unknown) => vueRender(tree as never, container),
      unmount: () => vueRender(null, container)
    };
  }

  const root = createZuiRoot(container);
  return {
    render: (tree: unknown) => root.render(tree as never),
    unmount: () => root.unmount()
  };
}

function measureRender(framework: Framework, renderer: ReturnType<typeof createRenderer>, rows: Row[]) {
  const started = performance.now();
  const tree = makeTree(framework, rows);
  const treeBuilt = performance.now();
  renderer.render(tree);
  const finished = performance.now();
  return {
    totalMs: finished - started,
    treeMs: treeBuilt - started,
    updateMs: finished - treeBuilt
  };
}

function assertRows(container: HTMLDivElement, rows: Row[], framework: Framework, scenario: Scenario, size: number): void {
  const actualRows = container.querySelectorAll("li");
  if (actualRows.length !== rows.length) {
    throw new Error(`Benchmark DOM row-count mismatch: ${framework}/${scenario}/${size}`);
  }
  for (let index = 0; index < rows.length; index++) {
    const actual = actualRows[index]!;
    const expected = rows[index]!;
    if (actual.getAttribute("data-id") !== String(expected.id) || actual.textContent !== expected.value) {
      throw new Error(`Benchmark DOM mismatch: ${framework}/${scenario}/${size} at row ${index}`);
    }
  }
}

window.validateListBenchmark = ({ framework, scenario, size, warmup, samples }) => {
  const container = document.querySelector<HTMLDivElement>("#app")!;
  let rows = makeRows(size);

  if (scenario === "mount") {
    for (let iteration = 0; iteration < warmup + samples; iteration++) {
      const renderer = createRenderer(framework, container);
      try {
        renderer.render(makeTree(framework, rows));
        assertRows(container, rows, framework, scenario, size);
      } finally {
        renderer.unmount();
        container.replaceChildren();
      }
    }
    return;
  }

  const renderer = createRenderer(framework, container);
  try {
    renderer.render(makeTree(framework, rows));
    assertRows(container, rows, framework, scenario, size);
    for (let iteration = 0; iteration < warmup + samples; iteration++) {
      rows = nextRows(rows, scenario, iteration + 1, size);
      renderer.render(makeTree(framework, rows));
      assertRows(container, rows, framework, scenario, size);
    }
  } finally {
    renderer.unmount();
  }
};

window.runListBenchmark = ({ framework, scenario, size, warmup, samples }) => {
  const container = document.querySelector<HTMLDivElement>("#app")!;
  let rows = makeRows(size);
  if (scenario === "mount") {
    const durations: number[] = [];
    const treeDurations: number[] = [];
    const updateDurations: number[] = [];
    for (let i = -warmup; i < samples; i++) {
      const renderer = createRenderer(framework, container);
      const started = performance.now();
      try {
        const tree = makeTree(framework, rows);
        const treeBuilt = performance.now();
        renderer.render(tree);
        const finished = performance.now();
        const elapsed = finished - started;
        if (i === samples - 1) assertRows(container, rows, framework, scenario, size);
        if (i >= 0) {
          durations.push(elapsed);
          treeDurations.push(treeBuilt - started);
          updateDurations.push(finished - treeBuilt);
        }
      } finally {
        renderer.unmount();
        container.replaceChildren();
      }
    }
    return {
      framework,
      scenario,
      size,
      samples,
      medianMs: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      minMs: Math.min(...durations),
      valuesMs: durations,
      treeValuesMs: treeDurations,
      updateValuesMs: updateDurations
    };
  }

  const renderer = createRenderer(framework, container);
  const render = (next: Row[]) => renderer.render(makeTree(framework, next));

  render(rows);
  for (let i = 0; i < warmup; i++) {
    rows = nextRows(rows, scenario, i + 1, size);
    render(rows);
  }

  const durations: number[] = [];
  const treeDurations: number[] = [];
  const updateDurations: number[] = [];
  for (let i = 0; i < samples; i++) {
    rows = nextRows(rows, scenario, warmup + i + 1, size);
    const timing = measureRender(framework, renderer, rows);
    durations.push(timing.totalMs);
    treeDurations.push(timing.treeMs);
    updateDurations.push(timing.updateMs);
  }

  assertRows(container, rows, framework, scenario, size);
  renderer.unmount();

  return {
    framework,
    scenario,
    size,
    samples,
    medianMs: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    minMs: Math.min(...durations),
    valuesMs: durations,
    treeValuesMs: treeDurations,
    updateValuesMs: updateDurations
  };
};
