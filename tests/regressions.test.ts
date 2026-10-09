import { describe, expect, it } from "vitest";
import { createEngine, type Mode } from "../src/reactive.js";

describe("instrumentation and lifecycle regressions", () => {
  it("scan visits every active effect even when the write is unrelated", () => {
    const e = createEngine("scan");
    const stores = Array.from({ length: 20 }, (_, i) => e.createStore(i));
    const stops = stores.map(s => e.effect(() => { void s.get(); }));
    const before = e.diagnostics();
    stores[0]!.set(100);
    const after = e.diagnostics();
    expect(after.visitedComputations - before.visitedComputations).toBe(20);
    stops.forEach(stop => stop());
    expect(e.diagnostics().activeComputations).toBe(0);
  });

  it("graph visits and evaluates only invalidated effects", () => {
    const e = createEngine("graph");
    const stores = Array.from({ length: 20 }, (_, i) => e.createStore(i));
    const stops = stores.map(s => e.effect(() => { void s.get(); }));
    const before = e.diagnostics();
    stores[0]!.set(100);
    const after = e.diagnostics();
    expect(after.selectorEvaluations - before.selectorEvaluations).toBe(1);
    expect(after.visitedComputations - before.visitedComputations).toBe(1);
    stops.forEach(stop => stop());
  });

  for (const mode of ["scan", "graph"] as Mode[]) {
    it(`${mode}: nested batches flush only once after the outer transaction`, () => {
      const e = createEngine(mode);
      const state = e.createStore(0);
      const observed: number[] = [];
      e.effect(() => { observed.push(state.get()); });
      e.batch(() => {
        state.set(1);
        e.batch(() => { state.set(2); state.set(3); });
        expect(observed).toEqual([0]);
      });
      expect(observed).toEqual([0, 3]);
    });

    it(`${mode}: computed recursion errors without retaining a self-edge`, () => {
      const e = createEngine(mode);
      let expr!: { get(): number };
      expr = e.computed(() => expr.get() + 1);
      expect(() => expr.get()).toThrow("ZUI_REACTIVE_CYCLE");
      expect(e.diagnostics().dependencyEdges).toBe(0);
    });

    it(`${mode}: disposing a dirty subscriber before flush is safe`, () => {
      const e = createEngine(mode);
      const value = e.createStore(1);
      const calls: number[] = [];
      const owner = e.createOwner(() => e.effect(() => { calls.push(value.get()); }));
      e.batch(() => {
        value.set(2);
        owner.dispose();
        value.set(3);
      });
      expect(calls).toEqual([1]);
      expect(e.diagnostics().activeComputations).toBe(0);
    });

    it(`${mode}: failed initial effect leaves no subscribers`, () => {
      const e = createEngine(mode);
      const state = e.createStore(0);
      expect(() => e.effect(() => {
        state.get();
        throw new Error("boom");
      })).toThrow("boom");
      expect(e.diagnostics().activeComputations).toBe(0);
      expect(() => state.set(1)).not.toThrow();
    });
  }
});
