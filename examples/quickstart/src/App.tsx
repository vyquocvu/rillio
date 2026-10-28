import { useState } from "@vyquocvu/rillio";

interface Task {
  id: number;
  text: string;
  done: boolean;
}

export function App() {
  const [count, setCount] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, text: "Install @vyquocvu/rillio via npm", done: true },
    { id: 2, text: "Build a responsive addressable-DOM app", done: true },
    { id: 3, text: "Explore transactional PatchEngine", done: false }
  ]);
  const [newText, setNewText] = useState("");

  const addTask = (event: Event) => {
    event.preventDefault();
    const text = newText.trim();
    if (!text) return;
    setTasks(prev => [...prev, { id: Date.now(), text, done: false }]);
    setNewText("");
  };

  const toggleTask = (id: number) => {
    setTasks(prev =>
      prev.map(task => (task.id === id ? { ...task, done: !task.done } : task))
    );
  };

  const deleteTask = (id: number) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  };

  return (
    <div class="container">
      <header class="header">
        <span class="header-badge">Standalone Project Demo</span>
        <h1>Rillio Quickstart App</h1>
        <p>A production-ready project using <code>@vyquocvu/rillio</code> from npm.</p>
      </header>

      {/* Feature 1: JSX State */}
      <section class="card">
        <h2>1. Counter (useState)</h2>
        <p class="card-desc">Tests stateful JSX updates and event handlers.</p>
        <div class="counter-box">
          <button
            type="button"
            class="btn-secondary"
            onClick={() => setCount(c => c - 1)}
          >
            -
          </button>
          <span class="counter-value">{count}</span>
          <button
            type="button"
            class="btn-primary"
            onClick={() => setCount(c => c + 1)}
          >
            +
          </button>
          <button
            type="button"
            class="btn-secondary"
            onClick={() => setCount(0)}
          >
            Reset
          </button>
        </div>
      </section>

      {/* Feature 2: Keyed List */}
      <section class="card">
        <h2>2. Keyed Task List</h2>
        <p class="card-desc">
          Tests keyed collection diffing, addition, toggle, and item removal.
        </p>

        <form class="task-form" onSubmit={addTask}>
          <input
            type="text"
            placeholder="Add a new task..."
            value={newText}
            onInput={(e: Event) => setNewText((e.currentTarget as HTMLInputElement).value)}
          />
          <button type="submit" class="btn-primary">Add</button>
        </form>

        <ul class="task-list">
          {tasks.map(task => (
            <li key={task.id} class={`task-item ${task.done ? "completed" : ""}`}>
              <label class="task-left">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => toggleTask(task.id)}
                />
                <span>{task.text}</span>
              </label>
              <button
                type="button"
                class="btn-danger"
                onClick={() => deleteTask(task.id)}
                aria-label={`Delete task: ${task.text}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section class="card">
        <h2>3. Package Information</h2>
        <p class="card-desc">Installed directly from the npm registry:</p>
        <pre><code>npm install @vyquocvu/rillio</code></pre>
      </section>
    </div>
  );
}
