import { describe, expect, it } from "vitest";
import { longestIncreasingSubsequencePositions, planStationaryMoves } from "../src/flat/lis.js";

function* permutations(values: number[]): Generator<number[]> {
  if (values.length <= 1) {
    yield [...values];
    return;
  }
  for (let index = 0; index < values.length; index++) {
    const head = values[index]!;
    const rest = values.filter((_, current) => current !== index);
    for (const tail of permutations(rest)) yield [head, ...tail];
  }
}

function bruteLisLength(values: readonly number[]): number {
  let best = 0;
  for (let mask = 0; mask < (1 << values.length); mask++) {
    let previous = -Infinity;
    let length = 0;
    let increasing = true;
    for (let index = 0; index < values.length; index++) {
      if ((mask & (1 << index)) === 0) continue;
      const value = values[index]!;
      if (value <= previous) { increasing = false; break; }
      previous = value;
      length++;
    }
    if (increasing) best = Math.max(best, length);
  }
  return best;
}

function applyPlan(oldIds: number[], movingIds: number[], beforeIds: Array<number | null>): number[] {
  const result = [...oldIds];
  for (let index = 0; index < movingIds.length; index++) {
    const id = movingIds[index]!;
    const current = result.indexOf(id);
    result.splice(current, 1);
    const before = beforeIds[index]!;
    const destination = before === null ? result.length : result.indexOf(before);
    result.splice(destination < 0 ? result.length : destination, 0, id);
  }
  return result;
}

describe("LIS keyed move planner exhaustive oracle", () => {
  it("uses exactly N minus LIS moves and reaches every order through size eight", () => {
    for (let size = 0; size <= 8; size++) {
      const oldIds = Array.from({ length: size }, (_, index) => index + 1);
      for (const nextIds of permutations(oldIds)) {
        const oldIndex = new Map(oldIds.map((id, index) => [id, index + 1]));
        const encoded = nextIds.map(id => oldIndex.get(id)!);
        const stationary = longestIncreasingSubsequencePositions(encoded);
        const plan = planStationaryMoves(nextIds, stationary, () => true);
        expect(plan.movingIds.length).toBe(size - bruteLisLength(encoded));
        expect(applyPlan(oldIds, plan.movingIds, plan.beforeIds)).toEqual(nextIds);
      }
    }
  });

  it("counts retained-key moves separately from insertion and removal costs", () => {
    const oldIds = [1, 2, 3, 4, 5];
    for (let mask = 0; mask < (1 << oldIds.length); mask++) {
      const retained = oldIds.filter((_, index) => (mask & (1 << index)) !== 0);
      const removedCount = oldIds.length - retained.length;
      for (const nextRetained of permutations(retained)) {
        const nextIds = [...nextRetained, 100, 101];
        const retainedSet = new Set(retained);
        const encoded = nextIds.map(id => {
          const oldIndex = oldIds.indexOf(id);
          return oldIndex < 0 ? 0 : oldIndex + 1;
        });
        const retainedEncoded = nextRetained.map(id => oldIds.indexOf(id) + 1);
        const stationary = longestIncreasingSubsequencePositions(encoded);
        const plan = planStationaryMoves(nextIds, stationary, index => retainedSet.has(nextIds[index]!));
        expect(plan.movingIds.length).toBe(retained.length - bruteLisLength(retainedEncoded));
        expect(applyPlan([...retained, 100, 101], plan.movingIds, plan.beforeIds)).toEqual(nextIds);
        expect(oldIds.length - retained.length).toBe(removedCount);
        expect(nextIds.length - retained.length).toBe(2);
      }
    }
  });
});
