import { describe, expect, it } from "vitest";
import { costAwarePlanner, estimatedCost } from "../research/patch-planning/cost-model.ts";
import { lisPlanner, rangeAwarePlanner } from "../research/patch-planning/lis-planner.ts";
import { naivePlanner, operationCounts, type PatchPlan } from "../research/patch-planning/reference-planner.ts";

function apply(oldKeys: readonly string[], plan: PatchPlan): string[] {
  const result = oldKeys.filter(key => !plan.removals.includes(key));
  for (const key of plan.insertions) result.push(key);
  for (const move of plan.moves) {
    const indexes = move.keys.map(key => result.indexOf(key));
    if (indexes.some(index => index < 0)) throw new Error("planner moved missing key");
    for (let index = 1; index < indexes.length; index++) {
      if (indexes[index] !== indexes[index - 1]! + 1) throw new Error("planner emitted a non-contiguous range");
    }
    const nodes = result.splice(indexes[0]!, move.keys.length);
    const anchorIndex = move.before === null ? result.length : result.indexOf(move.before);
    result.splice(anchorIndex < 0 ? result.length : anchorIndex, 0, ...nodes);
  }
  return result;
}

function* permutations(values: string[]): Generator<string[]> {
  if (values.length < 2) { yield [...values]; return; }
  for (let index = 0; index < values.length; index++) {
    const head = values[index]!;
    for (const tail of permutations(values.filter((_, current) => current !== index))) yield [head, ...tail];
  }
}

describe("patch planning research candidates", () => {
  it("produces correct orders across exhaustive small permutations", () => {
    const planners = [naivePlanner, lisPlanner, rangeAwarePlanner];
    for (let size = 0; size <= 7; size++) {
      const oldKeys = Array.from({ length: size }, (_, index) => `k${index}`);
      for (const nextKeys of permutations(oldKeys)) {
        for (const planner of planners) {
          const plan = planner.plan(oldKeys, nextKeys);
          expect(apply(oldKeys, plan), `${planner.name} ${oldKeys} -> ${nextKeys}`).toEqual(nextKeys);
        }
      }
    }
  });

  it("handles internal insertions and removals while keeping creation costs separate", () => {
    const planners = [naivePlanner, lisPlanner, rangeAwarePlanner];
    const cases = [
      { old: ["a", "b", "c"], next: ["a", "x", "b", "c"] },
      { old: ["a", "b", "c", "d"], next: ["d", "x", "b", "y"] },
      { old: ["a", "b", "c", "d"], next: ["x", "d", "a", "y"] }
    ];
    for (const { old, next } of cases) {
      for (const planner of planners) {
        const plan = planner.plan(old, next, 2);
        expect(apply(old, plan)).toEqual(next);
        expect(operationCounts(plan).insertions).toBe(next.filter(key => !old.includes(key)).length);
        expect(operationCounts(plan).removals).toBe(old.filter(key => !next.includes(key)).length);
      }
    }
  });

  it("requires measured weights and selects a candidate by the supplied cost model", () => {
    const weights = { move: 1, insert: 3, remove: 2, property: 0.5, allocation: 1 };
    const planner = costAwarePlanner(weights);
    const oldKeys = ["a", "b", "c", "d"];
    const nextKeys = ["c", "d", "a", "b"];
    const plan = planner.plan(oldKeys, nextKeys);
    const candidates = [naivePlanner, lisPlanner, rangeAwarePlanner].map(item => item.plan(oldKeys, nextKeys));
    expect(apply(oldKeys, plan)).toEqual(nextKeys);
    expect(estimatedCost(plan, weights)).toBe(Math.min(...candidates.map(candidate => estimatedCost(candidate, weights))));
  });
});
