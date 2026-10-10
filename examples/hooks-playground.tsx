import { createRoot, useCallback, useEffect, useMemo, useRef, useState } from "zui";

function HooksPlayground() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("ZUI");
  const [showDetails, setShowDetails] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const renderCount = useRef(0);
  renderCount.current++;

  const score = useMemo(
    () => name.trim().length * (count + 1),
    [name, count]
  );
  const focusName = useCallback(() => inputRef.current?.focus(), []);

  useEffect(() => {
    document.title = `${name || "ZUI"} — ${count}`;
    return () => {};
  }, [name, count]);

  return <main style={{ maxWidth: "680px", margin: "3rem auto", fontFamily: "system-ui", padding: "1rem" }}>
    <h1>Hooks playground</h1>
    <p>One small screen exercising state, effects, memo, callback and refs.</p>
    <label>
      Name{" "}
      <input ref={inputRef} value={name}
        onInput={(event: Event) => setName((event.currentTarget as HTMLInputElement).value)} />
    </label>
    <button onClick={focusName}>Focus name</button>
    <p>Hello, {name || "friend"}.</p>
    <p>Count: {count} · Memo score: {score} · Renders: {renderCount.current}</p>
    <button onClick={() => setCount(value => value + 1)}>Increment</button>{" "}
    <button onClick={() => setCount(0)}>Reset</button>{" "}
    <button onClick={() => setShowDetails(value => !value)}>
      {showDetails ? "Hide" : "Show"} details
    </button>
    {showDetails && <section>
      <h2>Current state</h2>
      <dl>
        <dt>Name length</dt><dd>{name.length}</dd>
        <dt>Effect dependency key</dt><dd>{`${name}:${count}`}</dd>
      </dl>
    </section>}
  </main>;
}

createRoot(document.getElementById("app")!).render(<HooksPlayground />);
