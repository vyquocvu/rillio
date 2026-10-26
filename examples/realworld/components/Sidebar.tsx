import { useAppStore } from "../store.js";
import type { Project, ViewMode } from "../types.js";
import { AnalyticsIcon, BoardIcon, SettingsIcon, TableIcon, TeamIcon } from "./Icons.js";

interface SidebarProps {
  projects: Project[];
}

export function Sidebar({ projects }: SidebarProps) {
  const currentView = useAppStore(state => state.view);
  const setView = useAppStore(state => state.setView);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);
  const setSelectedProjectId = useAppStore(state => state.setSelectedProjectId);

  const navItems: Array<{ id: ViewMode; label: string; icon: any }> = [
    { id: "board", label: "Board", icon: BoardIcon },
    { id: "table", label: "Issues List", icon: TableIcon },
    { id: "analytics", label: "Analytics", icon: AnalyticsIcon },
    { id: "team", label: "Team & Capacity", icon: TeamIcon },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <aside
      style={{
        width: "240px",
        height: "100%",
        borderRight: "1px solid var(--border-color, #1e293b)",
        backgroundColor: "var(--bg-sidebar, #090d16)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "16px 12px",
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 8px 18px", borderBottom: "1px solid var(--border-color, #1e293b)" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "grid",
              placeItems: "center",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "14px",
            }}
          >
            T
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-main, #f8fafc)" }}>
              TaskFlow
            </div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              Workspace v0.1
            </div>
          </div>
        </div>

        <nav style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: active ? "var(--bg-active-nav, #1e293b)" : "transparent",
                  color: active ? "#38bdf8" : "var(--text-muted, #94a3b8)",
                  fontWeight: active ? 600 : 500,
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: "24px" }}>
          <div
            style={{
              padding: "0 8px",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#64748b",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            Projects
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {projects.map(proj => {
              const active = selectedProjectId === proj.id;
              return (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => setSelectedProjectId(proj.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "7px 10px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: active ? "var(--bg-active-project, #1e293b)" : "transparent",
                    color: active ? "var(--text-main, #f8fafc)" : "var(--text-muted, #94a3b8)",
                    fontWeight: active ? 600 : 400,
                    fontSize: "12px",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: proj.color,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {proj.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "10px",
          backgroundColor: "var(--bg-status-card, #020617)",
          borderRadius: "8px",
          border: "1px solid var(--border-color, #1e293b)",
          fontSize: "11px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#10b981" }} />
          <strong style={{ color: "#10b981" }}>Rillio Runtime</strong>
        </div>
        <div style={{ color: "#64748b", lineHeight: 1.3 }}>
          Flat Index: Single source of truth. Zero VDOM tree diffing.
        </div>
      </div>
    </aside>
  );
}
