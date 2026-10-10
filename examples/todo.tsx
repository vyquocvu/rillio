import { createStore, select, derive, mount, Show, For } from "zui/legacy";

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

if (new URLSearchParams(location.search).has("e2e")) {
  const errors: string[] = [];
  window.addEventListener("error", event => errors.push(event.message));
  window.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const runTodoSmoke = async () => {
    await nextFrame();
    const taskInput = document.querySelector<HTMLInputElement>('input[aria-label="Task"]')!;
    const form = taskInput.form!;
    const addTask = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const remaining = [...document.querySelectorAll("main p")].find(node => node.textContent?.startsWith("Remaining:"))!;
    const editInputs = () => [...document.querySelectorAll<HTMLInputElement>('input[aria-label="Edit task"]')];
    const deleteButtons = () => [...document.querySelectorAll<HTMLButtonElement>("ul button")];

    taskInput.value = "Ship release";
    taskInput.dispatchEvent(new Event("input", { bubbles: true }));
    addTask.click();
    assert(editInputs().length === 3, "todo add flow failed");

    const edited = editInputs()[1]!;
    edited.value = "Test keyed rows updated";
    edited.dispatchEvent(new Event("input", { bubbles: true }));
    assert(edited.value === "Test keyed rows updated", "todo edit flow failed");

    const firstCheckbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    firstCheckbox.click();
    assert(remaining.textContent === "Remaining: 3", `todo toggle flow failed: ${remaining.textContent}; checked=${firstCheckbox.checked}`);

    const filterButtons = [...document.querySelectorAll<HTMLButtonElement>("nav button")];
    filterButtons[1]!.click();
    assert(editInputs().length === 3, "active filter flow failed");
    filterButtons[2]!.click();
    assert(editInputs().length === 0, "done filter flow failed");
    assert(document.body.textContent?.includes("No matching tasks."), "empty filter fallback failed");

    filterButtons[0]!.click();
    while (deleteButtons().length) deleteButtons()[0]!.click();
    assert(editInputs().length === 0, "todo delete flow failed");
    assert(document.body.textContent?.includes("No matching tasks."), "empty todo fallback failed");
    assert(errors.length === 0, `todo runtime errors: ${errors.join(" | ")}`);
    document.body.dataset.e2eStatus = "pass";
    document.body.dataset.e2eChecks = "todo-add,edit,toggle,filter,delete,empty";
  };
  runTodoSmoke().catch(error => {
    document.body.dataset.e2eStatus = "fail";
    document.body.dataset.e2eError = error instanceof Error ? error.message : String(error);
  });
}
