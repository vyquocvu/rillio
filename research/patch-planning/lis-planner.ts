import { longestIncreasingSubsequencePositions, planStationaryMoves } from "../../src/flat/lis.ts";
import type { PatchPlan, Planner } from "./reference-planner.ts";

function retainedLIS(oldKeys: readonly string[], nextKeys: readonly string[]) {
  const oldIndex = new Map(oldKeys.map((key, index) => [key, index + 1]));
  const encoded = nextKeys.map(key => oldIndex.get(key) ?? 0);
  return { oldIndex, encoded, stationary: longestIncreasingSubsequencePositions(encoded) };
}

export const lisPlanner: Planner = {
  name: "lis",
  plan(oldKeys, nextKeys, propertyMutations = 0): PatchPlan {
    const old = new Set(oldKeys);
    const next = new Set(nextKeys);
    const { stationary } = retainedLIS(oldKeys, nextKeys);
    const nextIds = nextKeys.map((_, index) => index + 1);
    const plan = planStationaryMoves(nextIds, stationary, index => old.has(nextKeys[index]!));
    return {
      moves: plan.movingIds.map((id, index) => ({
        keys: [nextKeys[id - 1]!],
        before: plan.beforeIds[index] === null ? null : nextKeys[plan.beforeIds[index]! - 1]!
      })),
      insertions: nextKeys.filter(key => !old.has(key)),
      removals: oldKeys.filter(key => !next.has(key)),
      propertyMutations
    };
  }
};

export const rangeAwarePlanner: Planner = {
  name: "range-aware",
  plan(oldKeys, nextKeys, propertyMutations = 0): PatchPlan {
    const old = new Set(oldKeys);
    const next = new Set(nextKeys);
    const { oldIndex, stationary } = retainedLIS(oldKeys, nextKeys);
    const moving = new Set<string>();
    for (let index = 0; index < nextKeys.length; index++) {
      const key = nextKeys[index]!;
      if (stationary[index] === 0) moving.add(key);
    }

    const moves: Array<{ keys: string[]; before: string | null }> = [];
    let anchor: string | null = null;
    let index = nextKeys.length - 1;
    while (index >= 0) {
      const key = nextKeys[index]!;
      if (!moving.has(key)) {
        anchor = key;
        index--;
        continue;
      }
      let start = index;
      while (start > 0) {
        const previous = nextKeys[start - 1]!;
        const current = nextKeys[start]!;
        const previousIndex = oldIndex.get(previous);
        const currentIndex = oldIndex.get(current);
        if (!moving.has(previous) || previousIndex === undefined || currentIndex === undefined || previousIndex + 1 !== currentIndex) break;
        start--;
      }
      const keys = nextKeys.slice(start, index + 1);
      moves.push({ keys, before: anchor });
      anchor = keys[0]!;
      index = start - 1;
    }
    return {
      moves,
      insertions: nextKeys.filter(key => !old.has(key)),
      removals: oldKeys.filter(key => !next.has(key)),
      propertyMutations
    };
  }
};
