import { createRoot, useEffect, useState, ErrorBoundary } from "zui";
import { createInspectorOverlay, type InspectorOverlayHandle } from "zui/devtools";
import { api } from "./api.js";
import { AnalyticsView } from "./components/AnalyticsView.js";
import { Header } from "./components/Header.js";
import { IssueModal } from "./components/IssueModal.js";
import { KanbanBoard } from "./components/KanbanBoard.js";
import { IssueTable } from "./components/IssueTable.js";
import { SettingsView } from "./components/SettingsView.js";
import { Sidebar } from "./components/Sidebar.js";
import { TeamView } from "./components/TeamView.js";
import { ToastContainer } from "./components/ToastContainer.js";
import { useAppStore } from "./store.js";
import type { Issue, Project, TeamMember, ViewMode } from "./types.js";

const globalStyles = `
  :root {
    --bg-app: #030712;
    --bg-sidebar: #0b0f19;
    --bg-header: #0f172a;
    --bg-col: #090e1a;
    --bg-col-header: #0f172a;
    --bg-card: #1e293b;
    --bg-input: #1e293b;
    --bg-button: #1e293b;
    --bg-active-nav: #1e293b;
    --bg-active-project: #1e293b;
    --bg-status-card: #020617;
    --border-color: #1e293b;
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
    color-scheme: dark;
  }

  [data-theme="light"] {
    --bg-app: #f8fafc;
    --bg-sidebar: #f1f5f9;
    --bg-header: #ffffff;
    --bg-col: #f1f5f9;
    --bg-col-header: #e2e8f0;
    --bg-card: #ffffff;
    --bg-input: #ffffff;
    --bg-button: #e2e8f0;
    --bg-active-nav: #e2e8f0;
    --bg-active-project: #e2e8f0;
    --bg-status-card: #ffffff;
    --border-color: #e2e8f0;
    --text-main: #0f172a;
    --text-muted: #64748b;
    color-scheme: light;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: var(--bg-app);
    color: var(--text-main);
    overflow: hidden;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;

function App() {
  const currentView = useAppStore(state => state.view);
  const isDevToolsOpen = useAppStore(state => state.isDevToolsOpen);
  const editingIssueId = useAppStore(state => state.editingIssueId);

  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (silent: boolean = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const [p, m, i, a] = await Promise.all([
        api.getProjects(),
        api.getMembers(),
        api.getIssues(),
        api.getActivities(),
      ]);
      setProjects(p);
      setMembers(m);
      useAppStore.getState().setIssueData(i, a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace data");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleUpdateIssue = async (issueId: string, patch: Partial<Issue>) => {
    useAppStore.getState().setIssues(prev =>
      prev.map(issue => (issue.id === issueId ? { ...issue, ...patch } : issue))
    );
    try {
      await api.updateIssue(issueId, patch);
      const a = await api.getActivities();
      useAppStore.getState().setActivities(a);
    } catch (err) {
      await loadData(true);
      throw err;
    }
  };

  const handleDeleteIssue = async (issueId: string) => {
    useAppStore.getState().setIssues(prev => prev.filter(issue => issue.id !== issueId));
    try {
      await api.deleteIssue(issueId);
      const a = await api.getActivities();
      useAppStore.getState().setActivities(a);
    } catch (err) {
      await loadData(true);
      throw err;
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // DevTools live overlay synchronization
  useEffect(() => {
    let overlay: InspectorOverlayHandle | undefined;
    if (isDevToolsOpen && typeof document !== "undefined") {
      const appContainer = document.getElementById("app");
      overlay = createInspectorOverlay({
        targetRoot: appContainer ?? undefined,
        position: "bottom-right",
        refreshIntervalMs: 1000,
      });
    }
    return () => {
      overlay?.dispose();
    };
  }, [isDevToolsOpen]);

  const editingIssue = editingIssueId
    ? useAppStore.getState().issues.find(issue => issue.id === editingIssueId) ?? null
    : null;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <Sidebar projects={projects} />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <Header />

        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {loading ? (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                height: "100%",
                color: "#94a3b8",
                fontSize: "14px",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    border: "3px solid #334155",
                    borderTopColor: "#38bdf8",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    margin: "0 auto 12px",
                  }}
                />
                <div>Loading TaskFlow Workspace...</div>
              </div>
            </div>
          ) : error ? (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                height: "100%",
                padding: "24px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#450a0a",
                  border: "1px solid #dc2626",
                  padding: "24px",
                  borderRadius: "8px",
                  maxWidth: "400px",
                  textAlign: "center",
                  color: "#fecaca",
                }}
              >
                <h3 style={{ margin: "0 0 8px" }}>Failed to Load Data</h3>
                <p style={{ margin: "0 0 16px", fontSize: "13px" }}>{error}</p>
                <button
                  type="button"
                  onClick={() => loadData()}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#dc2626",
                    border: "none",
                    borderRadius: "4px",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <WorkspaceView
              currentView={currentView}
              members={members}
              onRefresh={() => loadData(true)}
              onUpdateIssue={handleUpdateIssue}
              onDeleteIssue={handleDeleteIssue}
            />
          )}
        </div>
      </main>

      <ToastContainer />
      <IssueModal
        projects={projects}
        members={members}
        initialIssue={editingIssue}
        onSaved={() => loadData(true)}
      />
    </div>
  );
}

interface WorkspaceViewProps {
  currentView: ViewMode;
  members: TeamMember[];
  onRefresh: () => void;
  onUpdateIssue: (issueId: string, patch: Partial<Issue>) => Promise<void>;
  onDeleteIssue: (issueId: string) => Promise<void>;
}

function WorkspaceView({
  currentView,
  members,
  onRefresh,
  onUpdateIssue,
  onDeleteIssue,
}: WorkspaceViewProps) {
  const issues = useAppStore(state => state.issues);
  const activities = useAppStore(state => currentView === "analytics" ? state.activities : undefined);

  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div style={{ padding: "32px", textAlign: "center", color: "#f87171" }}>
          <h3>View Rendering Error</h3>
          <p style={{ fontSize: "13px", color: "#cbd5e1" }}>{err.message}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "8px 16px",
              backgroundColor: "#334155",
              border: "none",
              borderRadius: "6px",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reset View
          </button>
        </div>
      )}
    >
      {currentView === "board" && (
        <KanbanBoard
          issues={issues}
          members={members}
          onUpdateIssue={onUpdateIssue}
          onDeleteIssue={onDeleteIssue}
        />
      )}
      {currentView === "table" && (
        <IssueTable issues={issues} members={members} onRefresh={onRefresh} />
      )}
      {currentView === "analytics" && (
        <AnalyticsView issues={issues} members={members} activities={activities ?? []} />
      )}
      {currentView === "team" && <TeamView members={members} issues={issues} />}
      {currentView === "settings" && <SettingsView onResetDatabase={onRefresh} />}
    </ErrorBoundary>
  );
}

// Inject global stylesheet
if (typeof document !== "undefined") {
  const styleEl = document.createElement("style");
  styleEl.textContent = globalStyles;
  document.head.appendChild(styleEl);

  const container = document.getElementById("app");
  if (container) {
    createRoot(container).render(<App />);
  }
}
