import { createRoot, useState, useEffect, useMemo } from "zui";

interface Task { id: number; title: string; done: boolean }
function TodoApp() {
  const [todos, setTodos] = useState<Task[]>([{ id: 1, title: "Build ZUI", done: false }]);
  const [draft, setDraft] = useState("");
  const remaining = useMemo(() => todos.filter(t => !t.done).length, [todos]);
  useEffect(() => { document.title = `ZUI — ${remaining} remaining`; }, [remaining]);
  return <main style={{ maxWidth: "600px", margin: "3rem auto", fontFamily: "system-ui" }}>
    <h1>React / Preact-style ZUI</h1>
    <p>Remaining: {remaining}</p>
    <form onSubmit={(event: Event) => {
      event.preventDefault();
      if (!draft.trim()) return;
      setTodos(prev => [...prev, { id: Date.now(), title: draft.trim(), done: false }]);
      setDraft("");
    }}>
      <input aria-label="New task" value={draft}
        onInput={(event: Event) => setDraft((event.currentTarget as HTMLInputElement).value)} />
      <button type="submit">Add</button>
    </form>
    {todos.length === 0 && <p>No tasks yet</p>}
    <ul>{todos.map(todo => <li key={todo.id}>
      <input type="checkbox" checked={todo.done}
        onChange={() => setTodos(prev => prev.map(t =>
          t.id === todo.id ? { ...t, done: !t.done } : t
        ))} />
      <span>{todo.title}</span>
      <button onClick={() => setTodos(prev => prev.filter(t => t.id !== todo.id))}>Delete</button>
    </li>)}</ul>
  </main>;
}
createRoot(document.getElementById("app")!).render(<TodoApp />);
