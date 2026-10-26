import { createElement as reactH, useState as reactUseState } from "react";
import { createRoot as createReactRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { h as preactH, render as preactRender } from "preact";
import { useState as usePreactState } from "preact/hooks";
import {
  defineComponent as vueDefineComponent,
  h as vueH,
  nextTick as vueNextTick,
  ref as vueRef,
  render as vueRender
} from "vue";
import { createRoot as createRillioRoot, jsx as rillioH, useState as useRillioState } from "../src/compat.ts";

type Framework = "rillio" | "react" | "preact" | "vue";
type Scenario = "mount" | "local-update" | "parent-update" | "prop-fanout";

interface Options {
  framework: Framework;
  scenario: Scenario;
  size: number;
  warmup: number;
  samples: number;
}

interface Result extends Options {
  medianMs: number;
  p95Ms: number;
  minMs: number;
  valuesMs: number[];
  appRendersPerUpdate: number;
  childRendersPerUpdate: number;
  affectedChildCount: number;
}

declare global {
  interface Window {
    validateComponentLifecycle(options: Options): Promise<{ appRenders: number; childRenders: number }>;
    runComponentLifecycle(options: Options): Promise<Result>;
  }
}

type Setter = (next: number | ((previous: number) => number)) => void;

interface Harness {
  render(): void;
  updateLocal(next: number): void;
  updateParent(): void;
  unmount(): void;
  appRenders: number;
  childRenders: number[];
  targetId: number;
}

function makeHarness(framework: Framework, scenario: Scenario, size: number, container: HTMLDivElement): Harness {
  const targetId = size - 1;
  const childRenders = Array.from({ length: size }, () => 0);
  const localSetters: Setter[] = [];
  let appRenders = 0;
  let parentSetter: Setter = () => {};

  if (framework === "react") {
    function Child({ id, revision }: { id: number; revision: number }) {
      const [value, setValue] = reactUseState(0);
      localSetters[id] = setValue;
      childRenders[id]++;
      return reactH("button", { "data-id": String(id) }, `${id}:${value}:${revision}`);
    }
    function App({ fanout }: { fanout: boolean }) {
      const [version, setVersion] = reactUseState(0);
      parentSetter = setVersion;
      appRenders++;
      return reactH("main", null, Array.from({ length: size }, (_, id) =>
        reactH(Child, { key: id, id, revision: fanout ? version : 0 })
      ));
    }
    const root = createReactRoot(container);
    return {
      render: () => flushSync(() => root.render(reactH(App, { fanout: scenario === "prop-fanout" }))),
      updateLocal: next => flushSync(() => localSetters[targetId]!(next)),
      updateParent: () => flushSync(() => parentSetter(previous => previous + 1)),
      unmount: () => root.unmount(),
      get appRenders() { return appRenders; },
      childRenders,
      targetId
    };
  }

  if (framework === "preact") {
    function Child({ id, revision }: { id: number; revision: number }) {
      const [value, setValue] = usePreactState(0);
      localSetters[id] = setValue;
      childRenders[id]++;
      return preactH("button", { "data-id": String(id) }, `${id}:${value}:${revision}`);
    }
    function App({ fanout }: { fanout: boolean }) {
      const [version, setVersion] = usePreactState(0);
      parentSetter = setVersion;
      appRenders++;
      return preactH("main", null, Array.from({ length: size }, (_, id) =>
        preactH(Child, { key: id, id, revision: fanout ? version : 0 })
      ));
    }
    return {
      render: () => preactRender(preactH(App, { fanout: scenario === "prop-fanout" }), container),
      updateLocal: next => localSetters[targetId]!(next),
      updateParent: () => parentSetter(previous => previous + 1),
      unmount: () => preactRender(null, container),
      get appRenders() { return appRenders; },
      childRenders,
      targetId
    };
  }

  if (framework === "vue") {
    const Child = vueDefineComponent({
      props: { id: { type: Number, required: true }, revision: { type: Number, required: true } },
      setup(props) {
        const value = vueRef(0);
        localSetters[props.id] = next => {
          value.value = typeof next === "function" ? next(value.value) : next;
        };
        return () => {
          childRenders[props.id]++;
          return vueH("button", { "data-id": String(props.id) }, `${props.id}:${value.value}:${props.revision}`);
        };
      }
    });
    const App = vueDefineComponent({
      props: { fanout: { type: Boolean, required: true } },
      setup(props) {
        const version = vueRef(0);
        parentSetter = next => {
          version.value = typeof next === "function" ? next(version.value) : next;
        };
        return () => {
          appRenders++;
          return vueH("main", { "data-version": String(version.value) }, Array.from({ length: size }, (_, id) =>
            vueH(Child, { key: id, id, revision: props.fanout ? version.value : 0 })
          ));
        };
      }
    });
    return {
      render: () => vueRender(vueH(App, { fanout: scenario === "prop-fanout" }), container),
      updateLocal: next => localSetters[targetId]!(next),
      updateParent: () => parentSetter(previous => previous + 1),
      unmount: () => vueRender(null, container),
      get appRenders() { return appRenders; },
      childRenders,
      targetId
    };
  }

  function Child({ id, revision }: { id: number; revision: number }) {
    const [value, setValue] = useRillioState(0);
    localSetters[id] = setValue;
    childRenders[id]++;
    return rillioH("button", { "data-id": String(id), children: `${id}:${value}:${revision}` });
  }
  function App({ fanout }: { fanout: boolean }) {
    const [version, setVersion] = useRillioState(0);
    parentSetter = setVersion;
    appRenders++;
    return rillioH("main", {
      children: Array.from({ length: size }, (_, id) => rillioH(Child, {
        id,
        revision: fanout ? version : 0
      }, id))
    });
  }
  const root = createRillioRoot(container);
  return {
    render: () => root.render(rillioH(App, { fanout: scenario === "prop-fanout" })),
    updateLocal: next => localSetters[targetId]!(next),
    updateParent: () => parentSetter(previous => previous + 1),
    unmount: () => root.unmount(),
    get appRenders() { return appRenders; },
    childRenders,
    targetId
  };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function flushScheduledUpdate(framework: Framework): Promise<void> {
  if (framework === "vue") await vueNextTick();
  else if (framework === "preact") await Promise.resolve();
}

function hasScheduledUpdate(framework: Framework): boolean {
  return framework === "vue" || framework === "preact";
}

function assertTree(container: HTMLDivElement, size: number, scenario: Scenario, framework: Framework): void {
  const rows = container.querySelectorAll("button[data-id]");
  if (rows.length !== size) throw new Error(`Component DOM count mismatch: ${framework}/${scenario}/${size}; got ${rows.length}; html=${container.innerHTML.slice(0, 160)}`);
  for (let id = 0; id < size; id++) {
    if (rows[id]?.getAttribute("data-id") !== String(id)) {
      throw new Error(`Component DOM order mismatch: ${framework}/${scenario}/${size} at row ${id}`);
    }
  }
}

async function exercise(options: Options, validate: boolean): Promise<Result | { appRenders: number; childRenders: number }> {
  const { framework, scenario, size, warmup, samples } = options;
  const isMount = scenario === "mount";
  if (isMount) {
    const durations: number[] = [];
    let lastAppRenders = 0;
    let lastChildRenders = 0;
    for (let iteration = -warmup; iteration < (validate ? 1 : samples); iteration++) {
      const container = document.createElement("div");
      document.body.append(container);
      const started = performance.now();
      const harness = makeHarness(framework, scenario, size, container);
      try {
        harness.render();
        if (framework === "vue") await vueNextTick();
        const finished = performance.now();
        assertTree(container, size, scenario, framework);
        lastAppRenders = harness.appRenders;
        lastChildRenders = harness.childRenders.reduce((sum, count) => sum + count, 0);
        if (!validate && iteration >= 0) durations.push(finished - started);
      } finally {
        harness.unmount();
        container.remove();
      }
    }
    if (validate) return { appRenders: lastAppRenders, childRenders: lastChildRenders };
    return {
      ...options,
      medianMs: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      minMs: Math.min(...durations),
      valuesMs: durations,
      appRendersPerUpdate: 1,
      childRendersPerUpdate: size,
      affectedChildCount: size
    };
  }

  const container = document.querySelector<HTMLDivElement>("#app") ?? document.createElement("div");
  const harness = makeHarness(framework, scenario, size, container);
  try {
    harness.render();
    if (framework === "vue") await vueNextTick();
    assertTree(container, size, scenario, framework);
    let localValue = 0;
    const update = () => {
      if (scenario === "local-update") {
        localValue++;
        harness.updateLocal(localValue);
      } else {
        harness.updateParent();
      }
    };
    for (let index = 0; index < warmup; index++) {
      update();
      if (hasScheduledUpdate(framework)) await flushScheduledUpdate(framework);
    }
    harness.childRenders.fill(0);
    const appBefore = harness.appRenders;
    if (validate) {
      update();
      if (hasScheduledUpdate(framework)) await flushScheduledUpdate(framework);
      assertTree(container, size, scenario, framework);
      if (scenario === "local-update") {
        const expectedId = harness.targetId;
        const target = container.querySelector(`[data-id="${expectedId}"]`);
        if (!target?.textContent?.startsWith(`${expectedId}:${warmup + 1}:`)) {
          throw new Error(`Local state did not reach target component: ${framework}/${scenario}/${size}`);
        }
        if (harness.appRenders !== appBefore || harness.childRenders.reduce((sum, count) => sum + count, 0) !== 1) {
          throw new Error(`Local state escaped its component: ${framework}/${scenario}/${size}`);
        }
      } else if (scenario === "parent-update") {
        const expectedChildRenders = framework === "vue" ? 0 : size;
        const actualChildRenders = harness.childRenders.reduce((sum, count) => sum + count, 0);
        if (actualChildRenders !== expectedChildRenders || harness.appRenders - appBefore !== 1) {
          throw new Error(
            `Parent update render scope mismatch: ${framework}/${scenario}/${size}; ` +
            `expected ${expectedChildRenders} child renders, got ${actualChildRenders}`
          );
        }
      } else if (scenario === "prop-fanout") {
        const rows = Array.from(container.querySelectorAll("button[data-id]"));
        if (rows.some(row => !row.textContent?.endsWith(`:${warmup + 1}`))) {
          throw new Error(`Parent prop update did not reach every child: ${framework}/${scenario}/${size}`);
        }
      }
      return {
        appRenders: harness.appRenders - appBefore,
        childRenders: harness.childRenders.reduce((sum, count) => sum + count, 0)
      };
    }

    const durations: number[] = [];
    const operationsPerSample = scenario === "local-update" ? 1000 : 10;
    for (let index = 0; index < samples; index++) {
      const started = performance.now();
      for (let operation = 0; operation < operationsPerSample; operation++) {
        update();
        if (hasScheduledUpdate(framework)) await flushScheduledUpdate(framework);
      }
      durations.push((performance.now() - started) / operationsPerSample);
    }
    assertTree(container, size, scenario, framework);
    const measuredUpdates = samples * operationsPerSample;
    const childRendersPerUpdate = harness.childRenders.reduce((sum, count) => sum + count, 0) / measuredUpdates;
    return {
      ...options,
      medianMs: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      minMs: Math.min(...durations),
      valuesMs: durations,
      appRendersPerUpdate: (harness.appRenders - appBefore) / measuredUpdates,
      childRendersPerUpdate,
      affectedChildCount: childRendersPerUpdate
    };
  } finally {
    harness.unmount();
    container.replaceChildren();
  }
}

window.validateComponentLifecycle = async options => exercise(options, true) as Promise<{ appRenders: number; childRenders: number }>;
window.runComponentLifecycle = async options => exercise(options, false) as Promise<Result>;
