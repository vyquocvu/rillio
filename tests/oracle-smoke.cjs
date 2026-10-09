const assert = require("node:assert/strict");
const { createEngine } = require("../.zui-test/reactive.js");

function random(seed) {
  let state = seed | 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
function expression(next, depth) {
  if (depth === 0 || next() < 0.28)
    return { type: "input", index: Math.floor(next() * 5) };
  const n = Math.floor(next() * 3);
  return n === 2
    ? { type: "branch", condition: expression(next, depth - 1), a: expression(next, depth - 1), b: expression(next, depth - 1) }
    : { type: n ? "mul" : "add", a: expression(next, depth - 1), b: expression(next, depth - 1) };
}
function interpret(node, values) {
  switch (node.type) {
    case "input": return values[node.index];
    case "add": return interpret(node.a, values) + interpret(node.b, values);
    case "mul": return interpret(node.a, values) * interpret(node.b, values);
    case "branch": return interpret(node.condition, values) !== 0
      ? interpret(node.a, values) : interpret(node.b, values);
  }
}
function compile(node, stores, engine) {
  switch (node.type) {
    case "input": return stores[node.index];
    case "add":
    case "mul": {
      const a = compile(node.a, stores, engine), b = compile(node.b, stores, engine);
      return engine.computed(() => node.type === "add"
        ? a.get() + b.get() : a.get() * b.get());
    }
    case "branch": {
      const condition = compile(node.condition, stores, engine);
      const a = compile(node.a, stores, engine), b = compile(node.b, stores, engine);
      return engine.computed(() => condition.get() !== 0 ? a.get() : b.get());
    }
  }
}
let count = 0;
for (const mode of ["scan", "graph"]) {
  for (let seed = 1; seed <= 40; seed++) {
    const next = random(seed * 7919), tree = expression(next, 4);
    const engine = createEngine(mode);
    const values = Array.from({ length: 5 }, () => Math.floor(next() * 5) - 2);
    const stores = values.map(value => engine.createStore(value));
    const computed = compile(tree, stores, engine);
    const observed = [];
    engine.effect(() => { observed.push(computed.get()); });
    assert.equal(observed.at(-1), interpret(tree, values));
    for (let step = 0; step < 30; step++) {
      const i = Math.floor(next() * stores.length), value = Math.floor(next() * 5) - 2;
      stores[i].set(value); values[i] = value;
      assert.equal(computed.get(), interpret(tree, values), mode + "/" + seed + "/" + step);
      assert.equal(observed.at(-1), interpret(tree, values), mode + "/" + seed + "/" + step);
      count++;
    }
  }
}
console.log("Oracle updates verified: " + count);
