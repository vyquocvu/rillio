import { useAppStore } from "../store.js";
import type { IssuePriority, IssueStatus } from "../types.js";
import { DevToolsIcon, MoonIcon, PlusIcon, SearchIcon, SunIcon } from "./Icons.js";

export function Header() {
  const filter = useAppStore(state => state.filter);
  const setFilter = useAppStore(state => state.setFilter);
  const openCreateModal = useAppStore(state => state.openCreateModal);
  const toggleDevTools = useAppStore(state => state.toggleDevTools);
  const isDevToolsOpen = useAppStore(state => state.isDevToolsOpen);
  const theme = useAppStore(state => state.theme);
  const toggleTheme = useAppStore(state => state.toggleTheme);

  return (
    <header
      style={{
        height: "56px",
        borderBottom: "1px solid var(--border-color, #1e293b)",
        backgroundColor: "var(--bg-header, #0f172a)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, maxWidth: "480px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "var(--bg-input, #1e293b)",
            border: "1px solid var(--border-color, #334155)",
            borderRadius: "6px",
            padding: "6px 12px",
            width: "100%",
          }}
        >
          <span style={{ color: "#94a3b8", display: "grid", placeItems: "center" }}>
            <SearchIcon size={14} />
          </span>
          <input
            type="text"
            placeholder="Search issues, tags, assignees..."
            value={filter.search}
            onInput={(e: any) => setFilter({ search: e.target.value })}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-main, #f8fafc)",
              fontSize: "13px",
              width: "100%",
            }}
          />
          {filter.search && (
            <button
              type="button"
              onClick={() => setFilter({ search: "" })}
              style={{
                background: "transparent",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                padding: "0",
                fontSize: "11px",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          style={{
            padding: "8px",
            borderRadius: "6px",
            backgroundColor: "var(--bg-button, #1e293b)",
            border: "1px solid var(--border-color, #334155)",
            color: "#94a3b8",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
          }}
        >
          {theme === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
        </button>

        <button
          type="button"
          onClick={toggleDevTools}
          title="Toggle Rillio Flat Index DevTools HUD"
          style={{
            padding: "7px 12px",
            borderRadius: "6px",
            backgroundColor: isDevToolsOpen ? "#38bdf8" : "var(--bg-button, #1e293b)",
            border: isDevToolsOpen ? "1px solid #38bdf8" : "1px solid var(--border-color, #334155)",
            color: isDevToolsOpen ? "#0f172a" : "#38bdf8",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontWeight: 600,
            fontSize: "12px",
          }}
        >
          <DevToolsIcon size={15} />
          <span>Flat Index</span>
        </button>

        <button
          type="button"
          onClick={openCreateModal}
          style={{
            padding: "7px 14px",
            borderRadius: "6px",
            backgroundColor: "#6366f1",
            border: "none",
            color: "#ffffff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontWeight: 600,
            fontSize: "12px",
            boxShadow: "0 2px 4px rgba(99, 102, 241, 0.3)",
          }}
        >
          <PlusIcon size={15} />
          <span>New Issue</span>
        </button>

        <div
          title="Alex Rivera (Lead)"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            backgroundColor: "#6366f1",
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            fontSize: "12px",
            fontWeight: 700,
            border: "2px solid #0f172a",
            cursor: "pointer",
          }}
        >
          AR
        </div>
      </div>
    </header>
  );
}
