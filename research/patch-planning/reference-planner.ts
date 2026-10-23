export interface MoveUnit {
  /** Keys are kept in their current order; multi-key units represent a range move. */
  readonly keys: readonly string[];
  readonly before: string | null;
}

export interface PatchPlan {
  readonly moves: readonly MoveUnit[];
  readonly insertions: readonly string[];
  readonly removals: readonly string[];
  readonly propertyMutations: number;
}

export interface Planner {
  readonly name: string;
  plan(oldKeys: readonly string[], nextKeys: readonly string[], propertyMutations?: number): PatchPlan;
}

export function operationCounts(plan: PatchPlan) {
  return {
    moves: plan.moves.length,
    movedNodes: plan.moves.reduce((total, move) => total + move.keys.length, 0),
    insertions: plan.insertions.length,
    removals: plan.removals.length,
    propertyMutations: plan.propertyMutations,
    allocations: plan.moves.filter(move => move.keys.length > 1).length
  };
}

export const naivePlanner: Planner = {
  name: "naive",
  plan(oldKeys, nextKeys, propertyMutations = 0) {
    const old = new Set(oldKeys);
    const next = new Set(nextKeys);
    const working = [...oldKeys.filter(key => next.has(key))];
    for (const key of nextKeys) if (!old.has(key)) working.push(key);
    const moves: MoveUnit[] = [];
    for (let index = 0; index < nextKeys.length; index++) {
      const key = nextKeys[index]!;
      if (working[index] === key) continue;
      const current = working.indexOf(key);
      if (current < 0) continue;
      working.splice(current, 1);
      working.splice(index, 0, key);
      moves.push({ keys: [key], before: working[index + 1] ?? null });
    }
    return {
      moves,
      insertions: nextKeys.filter(key => !old.has(key)),
      removals: oldKeys.filter(key => !next.has(key)),
      propertyMutations
    };
  }
};
