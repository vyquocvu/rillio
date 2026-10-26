import { createStore } from "rillio/reactive";
import { For, Show, derive, mount, resource, select } from "rillio/dom";
import { installSourceViewer } from "./source-viewer.js";

interface Task {
  id: number;
  title: string;
}

interface RemoteSnapshot {
  version: number;
  loadedAt: string;
  rows: string[];
}

function App() {
  console.log("[data-lab] App mount render #1");
  const tasks = createStore<Task[]>([
    { id: 1, title: "Track the initial item" },
    { id: 2, title: "Keep keyed DOM identity" },
  ]);
  const remote = resource<RemoteSnapshot>(async (_source, info) => {
    const version = (info.previous?.version ?? 0) + 1;
    console.log(`[data-lab] resource fetch start v${version}`);
    await new Promise(resolve => setTimeout(resolve, 240));
    const snapshot = {
      version,
      loadedAt: new Date().toLocaleTimeString(),
      rows: ["Projects", "Issues", `Refresh ${version}`],
    };
    console.log(`[data-lab] resource fetch success v${version}`);
    return snapshot;
  });

  let nextId = 3;
  const commitTasks = (reason: string, update: (current: Task[]) => Task[]) => {
    tasks.set(update);
    console.log(`[data-lab] data update (${reason}): ${tasks.get().map(task => task.id).join(",") || "empty"}`);
  };

  return (
    <main class="lab-shell" id="data-lab-app">
      <div class="lab-topline"><a href="/demos.html">Rillio examples</a><span>/</span><span>Reactive data</span></div>
      <header class="lab-hero">
        <h1>Reactive data lab</h1>
        <p>This page uses the mount-once <code>rillio/dom</code> API. Store changes patch bound text and keyed rows without calling the root function again.</p>
        <div class="lab-callout">Logs use <code>[data-lab]</code>. Add, edit, reorder, or remove tasks, then refetch the async resource. Row mount logs show when a keyed row is actually created.</div>
      </header>

      <div class="lab-grid">
        <section class="lab-card" id="task-data-panel">
          <h2>Keyed task data</h2>
          <p class="lab-muted">The list is keyed by id. Editing and reordering should retain each row's DOM node.</p>
          <div class="lab-value"><strong id="task-count">{select(tasks, rows => rows.length)}</strong><span>tasks · root mount render = 1</span></div>
          <div class="lab-actions">
            <button class="lab-button lab-button--primary" id="add-task" onClick={() => {
              const task = { id: nextId++, title: `New task ${nextId - 1}` };
              commitTasks("add", current => [...current, task]);
            }}>Add task</button>
            <button class="lab-button" id="reorder-tasks" onClick={() => {
              commitTasks("rotate", current => current.length > 1 ? [...current.slice(1), current[0]!] : current);
            }}>Rotate first to last</button>
            <button class="lab-button" id="remove-task" onClick={() => {
              commitTasks("remove last", current => current.slice(0, -1));
            }}>Remove last</button>
          </div>
          <Show when={select(tasks, rows => rows.length > 0)} fallback={<p id="empty-tasks">No tasks yet.</p>}>
            <ul class="lab-list" id="task-list">
              <For each={select(tasks, rows => rows)} by={task => task.id}>
                {(task, current) => {
                  console.log(`[data-lab] row mount id=${task.id}`);
                  return (
                    <li class="lab-row" data-task-id={task.id}>
                      <span>{derive(() => {
                        const latest = current();
                        console.log(`[data-lab] row data id=${latest.id} title=${latest.title}`);
                        return latest.title;
                      })}</span>
                      <button type="button" onClick={() => {
                        const id = current().id;
                        commitTasks(`edit ${id}`, rows => rows.map(row =>
                          row.id === id ? { ...row, title: row.title.endsWith(" ✓") ? row.title.slice(0, -2) : `${row.title} ✓` } : row
                        ));
                      }}>Toggle mark</button>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </section>

        <section class="lab-card" id="resource-panel">
          <h2>Async resource</h2>
          <p class="lab-muted">Resource state exposes loading, status, data, and refetch behavior.</p>
          <div class="lab-pill" id="resource-status">Status: {select(remote.status, status => status)}</div>
          <div class="lab-actions">
            <button class="lab-button lab-button--primary" id="refetch-resource" onClick={() => { void remote.refetch(); }}>
              Refetch resource
            </button>
          </div>
          <Show when={select(remote.loading, loading => loading)} fallback={
            <div id="resource-data">
              <div class="lab-value"><strong style={{ fontSize: "20px" }}>Version {select(remote.data, data => data?.version ?? 0)}</strong></div>
              <p>Loaded at {select(remote.data, data => data?.loadedAt ?? "waiting")}</p>
              <p id="resource-rows">Rows: {select(remote.data, data => data?.rows.join(" · ") ?? "")}</p>
            </div>
          }>
            <p id="resource-loading">Loading resource data…</p>
          </Show>
        </section>
      </div>

      <footer class="lab-footer"><span>Console prefix: <code>[data-lab]</code></span><a href="/render-lab.html">Back to render scope lab →</a></footer>
    </main>
  );
}

const container = document.getElementById("app");
if (container) mount(App, container);
installSourceViewer("data-lab.tsx", () => import("./data-lab.tsx?raw").then(module => module.default));
