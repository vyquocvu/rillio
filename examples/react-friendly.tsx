import { useStore, mount } from "zui";

function Counter() {
  const count = useStore(0);
  const visible = useStore(true);
  const label = useStore("Welcome");
  let mounts = 0;
  function Detail() {
    mounts++;
    return <aside>
      <strong>{label}</strong>
      <small> Mounted {mounts} time(s)</small>
    </aside>;
  }
  return <main style={{ maxWidth: "600px", margin: "3rem auto", fontFamily: "system-ui" }}>
    <h1>React-friendly ZUI</h1>
    <p>Mount-once components and direct DOM bindings.</p>
    <button onClick={() => count.set(n => n + 1)}>Count: {count}</button>
    <button onClick={() => visible.set(v => !v)}>Toggle details</button>
    <input aria-label="Message" value={label}
      onInput={(event: Event) => label.set((event.target as HTMLInputElement).value)} />
    {() => visible.get() ? <Detail /> : null}
    <p>Conditional UI can use a function child. Keyed arrays still use For.</p>
  </main>;
}
mount(<Counter />, document.getElementById("app")!);
