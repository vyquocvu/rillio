import { lisPlanner, rangeAwarePlanner } from "./lis-planner.ts";
import { naivePlanner, operationCounts } from "./reference-planner.ts";
import type { PatchPlan, Planner } from "./reference-planner.ts";

export interface PatchWeights {
  move: number;
  insert: number;
  remove: number;
  property: number;
  allocation: number;
}

export function estimatedCost(plan: PatchPlan, weights: PatchWeights): number {
  const counts = operationCounts(plan);
  return counts.moves * weights.move +
    counts.insertions * weights.insert +
    counts.removals * weights.remove +
    counts.propertyMutations * weights.property +
    counts.allocations * weights.allocation;
}

/** Fit per-operation cost weights from measured browser or DOM-host timings. */
export function fitOperationWeights(samples: readonly {
  operation: keyof PatchWeights;
  elapsedMs: number;
  count: number;
}[]): PatchWeights {
  const totals: PatchWeights = { move: 0, insert: 0, remove: 0, property: 0, allocation: 0 };
  const counts: PatchWeights = { move: 0, insert: 0, remove: 0, property: 0, allocation: 0 };
  for (const sample of samples) {
    if (sample.count <= 0 || sample.elapsedMs < 0) continue;
    totals[sample.operation] += sample.elapsedMs;
    counts[sample.operation] += sample.count;
  }
  for (const operation of Object.keys(totals) as Array<keyof PatchWeights>) {
    if (counts[operation] === 0) throw new Error(`missing calibration sample: ${operation}`);
    totals[operation] /= counts[operation];
  }
  return totals;
}

export function costAwarePlanner(weights: PatchWeights): Planner {
  const candidates = [naivePlanner, lisPlanner, rangeAwarePlanner];
  return {
    name: "cost-aware",
    plan(oldKeys, nextKeys, propertyMutations = 0) {
      let best: PatchPlan | undefined;
      let bestCost = Infinity;
      for (const candidate of candidates) {
        const plan = candidate.plan(oldKeys, nextKeys, propertyMutations);
        const cost = estimatedCost(plan, weights);
        if (cost < bestCost) {
          best = plan;
          bestCost = cost;
        }
      }
      return best!;
    }
  };
}
