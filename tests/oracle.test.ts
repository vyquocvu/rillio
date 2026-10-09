import { describe, expect, it } from "vitest";
import { createEngine, type Mode, type ReactiveEngine } from "../src/reactive.js";
import {
  generateExpression, interpret, random, type Expr
} from "./oracle/interpreter.js";

function compile(
  expr: Expr,
  inputs: Array<{ get(): number }>,
  engine: ReactiveEngine
): { get(): number } {
  switch (expr.kind) {
    case "input": return inputs[expr.index]!;
    case "add": {
      const a = compile(expr.left, inputs, engine);
      const b = compile(expr.right, inputs, engine);
      return engine.computed(() => a.get() + b.get());
    }
    case "mul": {
      const a = compile(expr.left, inputs, engine);
      const b = compile(expr.right, inputs, engine);
      return engine.computed(() => a.get() * b.get());
    }
    case "branch": {
      const condition = compile(expr.condition, inputs, engine);
      const yes = compile(expr.yes, inputs, engine);
      const no = compile(expr.no, inputs, engine);
      return engine.computed(
        () => condition.get() !== 0 ? yes.get() : no.get()
      );
    }
  }
}

describe("independent snapshot oracle — deterministic randomized programs", () => {
  for (const mode of ["scan", "graph"] as Mode[]) {
    it(`${mode} agrees with the oracle for 40 seeded programs × 30 writes`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const next = random(seed * 7919);
        const expression = generateExpression(next, 5, 4);
        const engine = createEngine(mode);
        const values = Array.from({ length: 5 }, () => Math.floor(next() * 5) - 2);
        const inputs = values.map(value => engine.createStore(value));
        const compiled = compile(expression, inputs, engine);
        const observed: number[] = [];
        const dispose = engine.effect(() => { observed.push(compiled.get()); });
        expect(observed.at(-1), `initial seed ${seed}`).toBe(interpret(expression, values));

        for (let step = 0; step < 30; step++) {
          const index = Math.floor(next() * inputs.length);
          const value = Math.floor(next() * 5) - 2;
          values[index] = value;
          inputs[index]!.set(value);
          expect(compiled.get(), `seed ${seed} step ${step}`)
            .toBe(interpret(expression, values));
          // A scan may produce redundant notifications; stable final value
          // and no glitches are the contract for this comparison.
          expect(observed.at(-1), `effect seed ${seed} step ${step}`)
            .toBe(interpret(expression, values));
        }
        dispose();
      }
    });
  }
});

describe("error handling and diagnostics", () => {
  for (const mode of ["scan", "graph"] as Mode[]) {
    it(`${mode} disposes effect that throws during initial registration`, () => {
      const engine = createEngine(mode);
      expect(() => engine.effect(() => {
        throw new Error("registration failed");
      })).toThrow("registration failed");
      expect(engine.diagnostics().activeComputations).toBe(0);
    });

    it(`${mode} recovers subscriptions after computed evaluation throws`, () => {
      const engine = createEngine(mode);
      const source = engine.createStore(0);
      const value = engine.computed(() => {
        if (source.get() === 1) throw new Error("bad value");
        return source.get() * 2;
      });
      expect(value.get()).toBe(0);
      expect(() => source.set(1)).not.toThrow();
      expect(() => value.get()).toThrow("bad value");
      source.set(2);
      expect(value.get()).toBe(4);
    });

    it(`${mode} does not leave pending writes after cycle guard`, () => {
      const engine = createEngine(mode, { maxRounds: 3 });
      const source = engine.createStore(0);
      const stop = engine.effect(() => {
        if (source.get() > 0) source.set(source.get() + 1);
      });
      expect(() => source.set(1)).toThrow("ZUI_MAX_FLUSH_ROUNDS");
      stop();
      expect(() => engine.flush()).not.toThrow();
    });
  }
});
