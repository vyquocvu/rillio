import { createRoot, useState } from "rillio";
import { useStore as useZustandStore, create as createBoundStore, shallow, useShallow } from "rillio/external-store";
import { mount as mountDom } from "rillio/dom";
import { mount } from "rillio/legacy";
import { createEngine, createStore } from "rillio/reactive";
import { inspectRoot, trackTransactions, createInspectorOverlay } from "rillio/devtools";

const domStore = createStore("dom");
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
const domContainer = document.createElement("div");
mountDom(() => domStore.get(), domContainer);
const rootSnapshot = inspectRoot(container);
const tracker = trackTransactions();
const overlay = createInspectorOverlay();
overlay.dispose();
tracker.dispose();

export { container, reactiveContainer, domContainer, domStore, legacyStore, reactiveStore, ZustandCounter, typedInput, typedSvg, invalidAttribute, invalidHandler, rootSnapshot };
