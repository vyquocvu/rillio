import { describe, expect, it } from "vitest";
import { createEngine, type Mode } from "../src/reactive.js";

for (const mode of ["scan", "graph"] as Mode[]) {
  describe(`${mode} conformance`, () => {
    it("commits synchronously; skips equal writes", () => {
      const e = createEngine(mode);
      const s = e.createStore(1);
      const output: number[] = [];
      e.effect(() => { output.push(s.get()); });
      s.set(2);
      s.set(2);
      expect(s.get()).toBe(2);
      expect(output.at(-1)).toBe(2);
      if (mode === "graph") expect(output).toEqual([1, 2]);
    });

    it("diamond computed values are settled before effects", () => {
      const e = createEngine(mode);
      const source = e.createStore(1);
      const a = e.computed(() => source.get() + 1);
      const b = e.computed(() => source.get() * 2);
      const c = e.computed(() => a.get() + b.get());
      const values: number[] = [];
      e.effect(() => { values.push(c.get()); });
      source.set(2);
      expect(values.at(-1)).toBe(7);
      expect(values).not.toContain(6);
    });

    it("switches dynamic dependencies", () => {
      const e = createEngine(mode);
      const choose = e.createStore(true);
      const a = e.createStore(1);
      const b = e.createStore(10);
      const values: number[] = [];
      e.effect(() => { values.push(choose.get() ? a.get() : b.get()); });
      choose.set(false);
      const before = values.length;
      a.set(9);
      if (mode === "graph") expect(values).toHaveLength(before);
      b.set(11);
      expect(values.at(-1)).toBe(11);
    });

    it("batch shows only final state", () => {
      const e = createEngine(mode);
      const s = e.createStore(0);
      const values: number[] = [];
      e.effect(() => { values.push(s.get()); });
      e.batch(() => { s.set(1); s.set(2); });
      expect(values).toEqual([0, 2]);
    });

    it("effect writes are processed in subsequent flush rounds", () => {
      const e = createEngine(mode);
      const s = e.createStore(0);
      const values: number[] = [];
      e.effect(() => {
        const value = s.get();
        values.push(value);
        if (value === 1) s.set(2);
      });
      s.set(1);
      expect(values).toEqual([0, 1, 2]);
    });

    it("disposal skips queued dirty effect", () => {
      const e = createEngine(mode);
      const s = e.createStore(0);
      const values: number[] = [];
      const owner = e.createOwner(() => {
        e.effect(() => { values.push(s.get()); });
      });
      e.batch(() => { s.set(1); owner.dispose(); });
      expect(values).toEqual([0]);
      expect(e.diagnostics().activeComputations).toBe(0);
    });

    it("owner cleanup is idempotent and nested", () => {
      const e = createEngine(mode);
      const events: string[] = [];
      const root = e.createOwner(() => {
        e.onCleanup(() => events.push("root"));
        e.createOwner(() => e.onCleanup(() => events.push("child")));
      });
      root.dispose();
      root.dispose();
      expect(events).toEqual(["child", "root"]);
    });

    it("detects cycles and terminates recursive effect writes", () => {
      const e = createEngine(mode, { maxRounds: 5 });
      const s = e.createStore(0);
      e.effect(() => {
        const v = s.get();
        if (v > 0) s.set(v + 1);
      });
      expect(() => s.set(1)).toThrow("RILLIO_MAX_FLUSH_ROUNDS");
    });
  });
}
