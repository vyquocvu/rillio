import { createStore, select, derive, mount, Show, For } from "zui";

interface Task { id: number; title: string; done: boolean }
const app = createStore<{ draft: string; tasks: Task[]; filter: "all" | "active" | "done" }>({
  draft: "",
  tasks: [{ id: 1, title: "Implement direct DOM", done: true }, { id: 2, title: "Test keyed rows", done: false }],
  filter: "all"
});
let nextId = 3;
const visible = derive(() => {
  const { tasks, filter } = app.get();
  return tasks.filter(task => filter === "all" || task.done === (filter === "done"));
});
const updateTask = (id: number, change: (task: Task) => Task) =>
  app.set(state => ({ ...state, tasks: state.tasks.map(task => task.id === id ? change(task) : task) }));

function Todo() {
  return <main style={{ maxWidth: "640px", margin: "3rem auto", fontFamily: "system-ui", padding: "1rem" }}>
    <h1>ZUI Todo</h1>
    <p>DOM identity is preserved when tasks move or change.</p>
    <form onSubmit={(event: Event) => {
      event.preventDefault();
      const { draft } = app.get();
      if (!draft.trim()) return;
      app.set(state => ({
        ...state, draft: "",
        tasks: [...state.tasks, { id: nextId++, title: draft.trim(), done: false }]
      }));
    }}>
      <input aria-label="Task" placeholder="Add task" value={select(app, state => state.draft)}
        onInput={(event: Event) => app.set(state => ({
          ...state, draft: (event.target as HTMLInputElement).value
        }))} />
      <button type="submit">Add task</button>
    </form>
    <p>Remaining: {select(app, state => state.tasks.filter(task => !task.done).length)}</p>
    <nav>
      <button onClick={() => app.set(s => ({ ...s, filter: "all" }))}>All</button>
      <button onClick={() => app.set(s => ({ ...s, filter: "active" }))}>Active</button>
      <button onClick={() => app.set(s => ({ ...s, filter: "done" }))}>Done</button>
    </nav>
    <ul>
      <For each={visible} by={task => task.id}>
        {(task, current) => <li style={{ display: "flex", gap: "0.5rem", margin: "0.5rem 0" }}>
          <input type="checkbox" checked={derive(() => current().done)}
            onChange={() => updateTask(task.id, t => ({ ...t, done: !t.done }))} />
          <input aria-label="Edit task" value={derive(() => current().title)}
            onInput={(event: Event) => updateTask(task.id, t => ({
              ...t, title: (event.target as HTMLInputElement).value
            }))} />
          <button onClick={() => app.set(state => ({
            ...state, tasks: state.tasks.filter(t => t.id !== task.id)
          }))}>Delete</button>
        </li>}
      </For>
    </ul>
    <Show when={derive(() => visible.read().length === 0)}>
      {() => <p>No matching tasks.</p>}
    </Show>
  </main>;
}
mount(Todo, document.getElementById("app")!);
