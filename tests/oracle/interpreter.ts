/**
 * Slow reference model. It deliberately has no subscriptions, observers,
 * ownership graph, caches, or reactive scheduler.
 *
 * Every read recomputes expressions directly from immutable primitive values.
 * Only acyclic expression programs are accepted by this oracle.
 */
export type Expr =
  | { kind: "input"; index: number }
  | { kind: "add"; left: Expr; right: Expr }
  | { kind: "mul"; left: Expr; right: Expr }
  | { kind: "branch"; condition: Expr; yes: Expr; no: Expr };

export function interpret(expr: Expr, inputs: readonly number[]): number {
  switch (expr.kind) {
    case "input": return inputs[expr.index] ?? 0;
    case "add": return interpret(expr.left, inputs) + interpret(expr.right, inputs);
    case "mul": return interpret(expr.left, inputs) * interpret(expr.right, inputs);
    case "branch":
      return interpret(expr.condition, inputs) !== 0
        ? interpret(expr.yes, inputs) : interpret(expr.no, inputs);
  }
}

// Deterministic xorshift32: reproducible even without external fuzz libraries.
export function random(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export function generateExpression(
  next: () => number,
  inputs: number,
  depth: number
): Expr {
  if (depth === 0 || next() < 0.28) {
    return { kind: "input", index: Math.floor(next() * inputs) };
  }
  const variant = Math.floor(next() * 3);
  if (variant === 2) return {
    kind: "branch",
    condition: generateExpression(next, inputs, depth - 1),
    yes: generateExpression(next, inputs, depth - 1),
    no: generateExpression(next, inputs, depth - 1)
  };
  return {
    kind: variant === 0 ? "add" : "mul",
    left: generateExpression(next, inputs, depth - 1),
    right: generateExpression(next, inputs, depth - 1)
  };
}
