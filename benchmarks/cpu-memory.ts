import {
  assertRows,
  createRenderer,
  makeRows,
  makeTree,
  nextRows,
  type Framework,
  type Row,
  type Scenario
} from "./browser.ts";

export type CpuMemoryScenario = Exclude<Scenario, "mount">;

interface Options {
  framework: Framework;
  scenario: CpuMemoryScenario;
  size: number;
  updates: number;
}

interface PhaseTiming {
  wallMs: number;
  treeMs: number;
  renderMs: number;
}

interface Workload {
  framework: Framework;
  scenario: CpuMemoryScenario;
  size: number;
  container: HTMLDivElement;
  renderer: ReturnType<typeof createRenderer>;
  versions: Row[][];
  applied: number;
  mounted: boolean;
  unmounted: boolean;
}

declare global {
  interface Window {
    allocateCpuMemoryInputs(options: Options): { versions: number };
    mountCpuMemoryWorkload(): PhaseTiming;
    updateCpuMemoryWorkload(): PhaseTiming & { appliedUpdates: number };
    verifyCpuMemoryWorkload(): void;
    unmountCpuMemoryWorkload(): void;
    releaseCpuMemoryInputs(): void;
    validateCpuMemory(options: Options): void;
  }
}

let active: Workload | null = null;

function requireWorkload(phase: string): Workload {
  if (!active) throw new Error(`CPU/memory workload is not allocated; cannot run ${phase}`);
  return active;
}

// Chromium defers style recalc and layout until it produces a frame, so a window containing
// only synchronous DOM writes would attribute zero rendering cost to every framework. Reading
// a layout property flushes that work into the measured window, charging each framework for the
// style and layout its own DOM writes cause.
function flushStyleAndLayout(): void {
  void document.body.offsetHeight;
}

// Input rows are materialized before the runner takes its heap baseline, so retained
// and allocated deltas describe framework objects rather than benchmark input data.
function makeVersions(scenario: CpuMemoryScenario, size: number, updates: number): Row[][] {
  const versions: Row[][] = [makeRows(size)];
  for (let iteration = 1; iteration <= updates; iteration++) {
    versions.push(nextRows(versions[iteration - 1]!, scenario, iteration, size));
  }
  return versions;
}

window.allocateCpuMemoryInputs = ({ framework, scenario, size, updates }) => {
  if (active) throw new Error("A CPU/memory workload is already allocated");
  if (scenario === ("mount" as Scenario)) throw new Error("mount is measured as its own phase, not a scenario");
  const container = document.createElement("div");
  document.querySelector<HTMLDivElement>("#app")!.replaceChildren(container);
  active = {
    framework,
    scenario,
    size,
    container,
    renderer: createRenderer(framework, container),
    versions: makeVersions(scenario, size, updates),
    applied: 0,
    mounted: false,
    unmounted: false
  };
  return { versions: active.versions.length };
};

window.mountCpuMemoryWorkload = () => {
  const workload = requireWorkload("mount");
  if (workload.mounted) throw new Error("mount phase already ran");
  const started = performance.now();
  const tree = makeTree(workload.framework, workload.versions[0]!);
  const treeBuilt = performance.now();
  workload.renderer.render(tree);
  flushStyleAndLayout();
  const finished = performance.now();
  workload.mounted = true;
  return { wallMs: finished - started, treeMs: treeBuilt - started, renderMs: finished - treeBuilt };
};

window.updateCpuMemoryWorkload = () => {
  const workload = requireWorkload("update");
  if (!workload.mounted) throw new Error("update phase must follow mount");
  if (workload.applied > 0) throw new Error("update phase already ran");
  const started = performance.now();
  let treeMs = 0;
  for (let index = 1; index < workload.versions.length; index++) {
    const rows = workload.versions[index]!;
    const treeStarted = performance.now();
    const tree = makeTree(workload.framework, rows);
    treeMs += performance.now() - treeStarted;
    workload.renderer.render(tree);
    flushStyleAndLayout();
    workload.applied = index;
  }
  const finished = performance.now();
  return {
    wallMs: finished - started,
    treeMs,
    renderMs: finished - started - treeMs,
    appliedUpdates: workload.applied
  };
};

// Assertions are a separate phase so the runner can keep them outside the CDP metric window.
window.verifyCpuMemoryWorkload = () => {
  const workload = requireWorkload("verify");
  assertRows(
    workload.container,
    workload.versions[workload.applied]!,
    workload.framework,
    workload.scenario,
    workload.size
  );
};

window.unmountCpuMemoryWorkload = () => {
  const workload = requireWorkload("unmount");
  if (workload.unmounted) throw new Error("unmount phase already ran");
  workload.renderer.unmount();
  workload.container.replaceChildren();
  workload.unmounted = true;
};

window.releaseCpuMemoryInputs = () => {
  const workload = requireWorkload("release");
  if (!workload.unmounted) throw new Error("unmount must precede release");
  workload.container.remove();
  active = null;
};

window.validateCpuMemory = ({ framework, scenario, size, updates }) => {
  window.allocateCpuMemoryInputs({ framework, scenario, size, updates });
  try {
    window.mountCpuMemoryWorkload();
    window.verifyCpuMemoryWorkload();
    const updated = window.updateCpuMemoryWorkload();
    if (updated.appliedUpdates !== updates) {
      throw new Error(`Expected ${updates} applied updates, saw ${updated.appliedUpdates}`);
    }
    window.verifyCpuMemoryWorkload();
    window.unmountCpuMemoryWorkload();
    const leftovers = document.querySelector<HTMLDivElement>("#app")!.querySelectorAll("li").length;
    if (leftovers !== 0) throw new Error(`Unmount left ${leftovers} rows behind: ${framework}/${scenario}/${size}`);
  } finally {
    if (active && !active.unmounted) active.renderer.unmount();
    active?.container.remove();
    active = null;
  }
};
