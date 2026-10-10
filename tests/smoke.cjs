const assert = require("node:assert/strict");
(async () => {
  const { createEngine } = await import("../.zui-test/reactive.js");
  let checks = 0;
  function test(name, run) {
    try { run(); checks++; }
    catch (error) { console.error("FAIL", name, error); process.exitCode = 1; }
  }
  for (const mode of ["scan", "graph"]) {
  test(mode + " diamond", () => {
    const e = createEngine(mode), s = e.createStore(1);
    const a = e.computed(() => s.get() + 1), b = e.computed(() => s.get() * 2);
    const c = e.computed(() => a.get() + b.get()), values = [];
    e.effect(() => { values.push(c.get()); });
    s.set(2);
    assert.deepEqual(values, [4, 7]);
  });
  test(mode + " dynamic branch", () => {
    const e = createEngine(mode), flag = e.createStore(true);
    const a = e.createStore(1), b = e.createStore(10), values = [];
    e.effect(() => { values.push(flag.get() ? a.get() : b.get()); });
    flag.set(false);
    const before = values.length;
    a.set(9);
    if (mode === "graph") assert.equal(values.length, before);
    b.set(11);
    assert.equal(values.at(-1), 11);
  });
  test(mode + " dirty disposal", () => {
    const e = createEngine(mode), s = e.createStore(0), values = [];
    const owner = e.createOwner(() => e.effect(() => { values.push(s.get()); }));
    e.batch(() => { s.set(1); owner.dispose(); });
    assert.deepEqual(values, [0]);
    assert.equal(e.diagnostics().activeComputations, 0);
  });
  test(mode + " throwing registration", () => {
    const e = createEngine(mode), s = e.createStore(0);
    assert.throws(() => e.effect(() => { s.get(); throw Error("bad"); }));
    assert.equal(e.diagnostics().activeComputations, 0);
    s.set(2);
  });
  test(mode + " recursive computed", () => {
    const e = createEngine(mode);
    let c;
    c = e.computed(() => c.get() + 1);
    assert.throws(() => c.get(), /ZUI_REACTIVE_CYCLE/);
    assert.equal(e.diagnostics().dependencyEdges, 0);
  });
  test(mode + " initial nested write", () => {
    const e = createEngine(mode), s = e.createStore(1), values = [];
    e.effect(() => { const x = s.get(); values.push(x); if (x === 1) s.set(2); });
    assert.deepEqual(values, [1, 2]);
  });
  test(mode + " cleanup once", () => {
    const e = createEngine(mode), s = e.createStore(0), events = [];
    const stop = e.effect(() => {
      const x = s.get(); events.push("effect" + x);
      return () => events.push("clean" + x);
    });
    s.set(1); stop(); stop();
    assert.deepEqual(events, ["effect0", "clean0", "effect1", "clean1"]);
  });
  test(mode + " bounded runaway writes", () => {
    const e = createEngine(mode, { maxRounds: 3 }), s = e.createStore(0);
    const stop = e.effect(() => { const v = s.get(); if (v > 0) s.set(v + 1); });
    assert.throws(() => s.set(1), /ZUI_MAX_FLUSH_ROUNDS/);
    stop(); e.flush();
  });
  }
  console.log(`Smoke checks passed: ${checks}/16`);
  if (process.exitCode) process.exit(process.exitCode);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
