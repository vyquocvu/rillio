import { costAwarePlanner, fitOperationWeights } from "./cost-model.ts";
import { lisPlanner, rangeAwarePlanner } from "./lis-planner.ts";
import { naivePlanner, operationCounts } from "./reference-planner.ts";
import { buildWorkloads } from "./workloads.ts";

type Operation = "move" | "insert" | "remove" | "property" | "allocation";

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function calibrate(document: Document, iterations: number) {
  const samples: Array<{ operation: Operation; elapsedMs: number; count: number }> = [];
  const measure = (operation: Operation, count: number, work: () => void) => {
    const start = now();
    work();
    samples.push({ operation, elapsedMs: now() - start, count });
  };
  const holder = document.createElement("div");
  const first = document.createElement("i");
  const second = document.createElement("b");
  holder.append(first, second);
  measure("move", iterations, () => {
    for (let index = 0; index < iterations; index++) holder.appendChild(index % 2 === 0 ? first : second);
  });
  measure("insert", iterations, () => {
    for (let index = 0; index < iterations; index++) holder.appendChild(document.createElement("i"));
  });
  const removable = [...holder.children].slice(2);
  measure("remove", removable.length, () => { for (const node of removable) holder.removeChild(node); });
  const propertyNode = document.createElement("i");
  measure("property", iterations, () => {
    for (let index = 0; index < iterations; index++) propertyNode.setAttribute("data-calibration", String(index));
  });
  measure("allocation", iterations, () => {
    for (let index = 0; index < iterations; index++) document.createDocumentFragment();
  });
  return { samples, weights: fitOperationWeights(samples) };
}

function makeFixture(document: Document, keys: readonly string[]) {
  const parent = document.createElement("div");
  const nodes = new Map<string, HTMLElement>();
  for (const key of keys) {
    const node = document.createElement("i");
    node.dataset.key = key;
    nodes.set(key, node);
    parent.appendChild(node);
  }
  return { parent, nodes };
}

function applyPlan(
  document: Document,
  fixture: ReturnType<typeof makeFixture>,
  nextKeys: readonly string[],
  plan: ReturnType<typeof naivePlanner.plan>
): void {
  const { parent, nodes } = fixture;
  for (const key of plan.removals) {
    const node = nodes.get(key)!;
    if (node.parentNode === parent) parent.removeChild(node);
  }
  for (const key of plan.insertions) {
    const node = document.createElement("i");
    node.dataset.key = key;
    nodes.set(key, node);
    parent.appendChild(node);
  }
  for (const move of plan.moves) {
    const moving = move.keys.map(key => nodes.get(key)!);
    if (moving.length === 1) {
      parent.insertBefore(moving[0]!, move.before === null ? null : nodes.get(move.before)!);
    } else {
      for (let index = 1; index < moving.length; index++) {
        if (moving[index - 1]!.nextSibling !== moving[index]) throw new Error("range planner emitted a non-contiguous move");
      }
      const fragment = document.createDocumentFragment();
      for (const node of moving) fragment.appendChild(node);
      parent.insertBefore(fragment, move.before === null ? null : nodes.get(move.before)!);
    }
  }
  for (let index = 0; index < plan.propertyMutations; index++) {
    const key = nextKeys[index % nextKeys.length];
    if (key !== undefined) nodes.get(key)?.setAttribute("data-revision", String(index));
  }
  const actual = [...parent.children].map(node => (node as HTMLElement).dataset.key);
  if (JSON.stringify(actual) !== JSON.stringify(nextKeys)) {
    throw new Error(`planner produced wrong order: expected ${nextKeys.join(",")}; got ${actual.join(",")}`);
  }
}

export function runPatchPlanningBenchmark(
  document: Document,
  options: { size?: number; iterations?: number; calibrationIterations?: number } = {}
) {
  const size = options.size ?? 128;
  const iterations = options.iterations ?? 25;
  const calibrationIterations = options.calibrationIterations ?? 10_000;
  const calibration = calibrate(document, calibrationIterations);
  const planners = [naivePlanner, lisPlanner, rangeAwarePlanner, costAwarePlanner(calibration.weights)];
  const reports = [];

  for (const workload of buildWorkloads(size)) {
    for (const planner of planners) {
      const planningStarted = now();
      let plan;
      for (let index = 0; index < iterations; index++) {
        plan = planner.plan(workload.oldKeys, workload.nextKeys, workload.propertyMutations);
      }
      const planningMs = (now() - planningStarted) / iterations;
      const measuredPlan = plan!;
      // Correctness gate is independent of the measured loop.
      applyPlan(document, makeFixture(document, workload.oldKeys), workload.nextKeys, measuredPlan);
      let domMs = 0;
      for (let index = 0; index < iterations; index++) {
        const fixture = makeFixture(document, workload.oldKeys);
        const start = now();
        applyPlan(document, fixture, workload.nextKeys, measuredPlan);
        domMs += now() - start;
      }
      reports.push({
        workload: workload.name,
        planner: planner.name,
        planningMs,
        domApplyMs: domMs / iterations,
        operations: operationCounts(measuredPlan)
      });
    }
  }
  return {
    environment: "caller-provided DOM",
    size,
    iterations,
    calibration: { iterations: calibrationIterations, weightsMsPerOperation: calibration.weights },
    results: reports
  };
}
