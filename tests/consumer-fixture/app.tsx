import { createRoot, useState } from "zui";
import { createStore, mount } from "zui/legacy";
import { createEngine } from "zui/reactive";

const legacyStore = createStore("legacy");
const engine = createEngine("graph");
const reactiveStore = engine.createStore(1);

function ConsumerApp() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(value => value + 1)}>{count}</button>;
}

const container = document.createElement("div");
createRoot(container).render(<ConsumerApp />);
mount(() => legacyStore.get(), container);
reactiveStore.set(value => value + 1);

export { container, legacyStore, reactiveStore };
