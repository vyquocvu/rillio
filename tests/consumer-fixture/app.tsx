import { createRoot, useState } from "zui";
import { Button, StyleSheet } from "zui/ui";
import { useStore as useZustandStore, create as createBoundStore, shallow, useShallow } from "zui/zustand";
import { createStore as createDomStore, mount as mountDom } from "zui/dom";
import { createStore, mount } from "zui/legacy";
import { createEngine } from "zui/reactive";

const domStore = createDomStore("dom");
const legacyStore = createStore("legacy");
const engine = createEngine("graph");
const reactiveStore = engine.createStore(1);
const externalStore = {
  getState: () => ({ count: 7 }),
  subscribe: (_listener: (state: { count: number }, previous: { count: number }) => void) => () => undefined
};

function ZustandCounter() {
  const count = useZustandStore(externalStore, state => state.count);
  return <output>{count}</output>;
}

function ConsumerApp() {
  const [count, setCount] = useState(0);
  return <button type="button" aria-label="Increase count" data-kind="counter" onClick={event => {
    event.currentTarget.disabled = false;
    // @ts-expect-error The inferred target is an HTMLButtonElement, not an untyped value.
    event.currentTarget.notAButtonProperty = true;
    setCount(value => value + 1);
  }}>{count}</button>;
}

const typedInput = <input value="ready" onInput={event => {
  event.currentTarget.value = "typed";
  // @ts-expect-error The inferred target is an HTMLInputElement, not an untyped value.
  event.currentTarget.notAInputProperty = true;
}} />;
const typedSvg = <svg viewBox="0 0 24 24" role="img"><path d="M0 0h24" stroke="currentColor" /></svg>;
// @ts-expect-error Unknown DOM attributes are rejected.
const invalidAttribute = <button definitelyNotAProp="nope" />;
// @ts-expect-error String-valued inline handler attributes are not part of JSX props.
const invalidHandler = <img onError="alert(1)" />;

const container = document.createElement("div");
createRoot(container).render(<ConsumerApp />);
const reactiveContainer = document.createElement("div");
mount(() => legacyStore.get(), reactiveContainer);
reactiveStore.set(value => value + 1);

export { container, reactiveContainer, domStore, legacyStore, reactiveStore, ZustandCounter, typedInput, typedSvg, invalidAttribute, invalidHandler };
export { Button, StyleSheet };
