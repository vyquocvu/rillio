/**
 * Shared keyed-list diffing algorithms.
 *
 * `oldIndexByNextIndex` encodes, for each position in the next child order,
 * the previous position of that child plus one; `0` marks a child that was
 * not previously present. Both the compat reconciler and the rillio/dom list
 * renderer share one LIS implementation and one move planner through this
 * module.
 */

import type { NodeId } from "./types.js";

export interface MovePlan {
  movingIds: NodeId[];
  beforeIds: Array<NodeId | null>;
}

export function longestIncreasingSubsequencePositions(oldIndexByNextIndex: readonly number[]): Uint8Array {
  const predecessors = new Int32Array(oldIndexByNextIndex.length);
  predecessors.fill(-1);
  const tails: number[] = [];
  for (let i = 0; i < oldIndexByNextIndex.length; i++) {
    const oldIndex = oldIndexByNextIndex[i]!;
    if (oldIndex === 0) continue;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (oldIndexByNextIndex[tails[middle]!]! < oldIndex) low = middle + 1;
      else high = middle;
    }
    if (low > 0) predecessors[i] = tails[low - 1]!;
    tails[low] = i;
  }

  const stationary = new Uint8Array(oldIndexByNextIndex.length);
  if (tails.length === 0) return stationary;
  let cursor = tails[tails.length - 1]!;
  while (cursor !== -1) {
    stationary[cursor] = 1;
    cursor = predecessors[cursor]!;
  }
  return stationary;
}

/**
 * Plans right-to-left moves for non-stationary, pre-existing children.
 * Newly mounted children (rejected by `isPreexisting`) act as anchors only —
 * they are already attached at the end of the parent.
 */
export function planStationaryMoves(
  nextIds: readonly NodeId[],
  stationary: Uint8Array,
  isPreexisting: (index: number) => boolean
): MovePlan {
  let newSuffixStart = nextIds.length;
  while (newSuffixStart > 0 && !isPreexisting(newSuffixStart - 1)) newSuffixStart--;
  let anchor: NodeId | null = null;
  const movingIds: NodeId[] = [];
  const beforeIds: Array<NodeId | null> = [];
  for (let i = nextIds.length - 1; i >= 0; i--) {
    const id = nextIds[i]!;
    if (i < newSuffixStart && stationary[i] === 0) {
      movingIds.push(id);
      beforeIds.push(anchor);
    }
    anchor = id;
  }
  return { movingIds, beforeIds };
}
