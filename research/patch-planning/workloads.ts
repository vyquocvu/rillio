export interface PatchWorkload {
  readonly name: string;
  readonly oldKeys: readonly string[];
  readonly nextKeys: readonly string[];
  readonly propertyMutations: number;
}

function shuffle<T>(items: T[], seed: number): T[] {
  let state = seed >>> 0;
  const nextRandom = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  for (let index = items.length - 1; index > 0; index--) {
    const swap = Math.floor(nextRandom() * (index + 1));
    [items[index], items[swap]] = [items[swap]!, items[index]!];
  }
  return items;
}

export function buildWorkloads(size = 128): PatchWorkload[] {
  const oldKeys = Array.from({ length: size }, (_, index) => `k${index}`);
  const half = Math.floor(size / 2);
  const retained = oldKeys.slice(Math.floor(size / 4));
  const churn = shuffle([...retained], 0x51a7e).slice(0, Math.max(0, retained.length - 4));
  const mixedNext = [...churn, ...Array.from({ length: 4 }, (_, index) => `new${index}`)];
  return [
    { name: "unchanged", oldKeys, nextKeys: [...oldKeys], propertyMutations: 0 },
    { name: "rotation", oldKeys, nextKeys: [...oldKeys.slice(1), oldKeys[0]!], propertyMutations: 0 },
    { name: "reverse", oldKeys, nextKeys: [...oldKeys].reverse(), propertyMutations: Math.floor(size / 8) },
    { name: "block-swap", oldKeys, nextKeys: [...oldKeys.slice(half), ...oldKeys.slice(0, half)], propertyMutations: 0 },
    { name: "mixed-churn", oldKeys, nextKeys: mixedNext, propertyMutations: Math.floor(size / 16) }
  ];
}
