import { createRoot, useState } from "@vyquocvu/rillio";
import { mount } from "@vyquocvu/rillio/dom";
import { createEngine, createStore } from "@vyquocvu/rillio/reactive";
import { inspectRoot, trackTransactions, createInspectorOverlay } from "@vyquocvu/rillio/devtools";

const domStore = createStore("dom");
const explicitStore = createStore("explicit");
const engine = createEngine("graph");
const reactiveStore = engine.createStore(1);
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
mount(() => explicitStore.get(), reactiveContainer);
const domContainer = document.createElement("div");
mount(() => domStore.get(), domContainer);
const rootSnapshot = inspectRoot(container);
const tracker = trackTransactions();
const overlay = createInspectorOverlay();
overlay.dispose();
tracker.dispose();

export { container, reactiveContainer, domContainer, domStore, explicitStore, reactiveStore, typedInput, typedSvg, invalidAttribute, invalidHandler, rootSnapshot };
