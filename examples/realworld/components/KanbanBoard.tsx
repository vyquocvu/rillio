import { useAppStore } from "../store.js";
import type { Issue, IssueStatus, TeamMember } from "../types.js";
import { PlusIcon, TrashIcon } from "./Icons.js";

interface KanbanBoardProps {
  issues: Issue[];
  members: TeamMember[];
  onUpdateIssue: (issueId: string, patch: Partial<Issue>) => Promise<void>;
  onDeleteIssue: (issueId: string) => Promise<void>;
}

const columns: Array<{ id: IssueStatus; title: string; color: string }> = [
  { id: "backlog", title: "Backlog", color: "#64748b" },
  { id: "todo", title: "Todo", color: "#38bdf8" },
  { id: "in_progress", title: "In Progress", color: "#f59e0b" },
  { id: "in_review", title: "In Review", color: "#ec4899" },
  { id: "done", title: "Done", color: "#10b981" },
];

export function KanbanBoard({ issues, members, onUpdateIssue, onDeleteIssue }: KanbanBoardProps) {
  const filter = useAppStore(state => state.filter);
  const openEditModal = useAppStore(state => state.openEditModal);
  const openCreateModal = useAppStore(state => state.openCreateModal);
  const addToast = useAppStore(state => state.addToast);

  // Apply filters
  const filteredIssues = issues.filter(issue => {
    if (filter.projectId && issue.projectId !== filter.projectId) return false;
    if (filter.status !== "all" && issue.status !== filter.status) return false;
    if (filter.priority !== "all" && issue.priority !== filter.priority) return false;
    if (filter.label !== "all" && issue.label !== filter.label) return false;
    if (filter.assigneeId !== "all" && issue.assigneeId !== filter.assigneeId) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const matchTitle = issue.title.toLowerCase().includes(q);
      const matchDesc = issue.description.toLowerCase().includes(q);
      const matchId = issue.id.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchId) return false;
    }
    return true;
  });

  const memberMap = new Map(members.map(m => [m.id, m]));

  const handleMoveStatus = async (issue: Issue, nextStatus: IssueStatus) => {
    try {
      await onUpdateIssue(issue.id, { status: nextStatus });
      addToast({
        type: "info",
        title: "Status updated",
        message: `${issue.id} moved to ${nextStatus.replace("_", " ")}`,
      });
    } catch {
      addToast({
        type: "error",
        title: "Update failed",
        message: "Could not update issue status.",
      });
    }
  };

  const handleDelete = async (issueId: string) => {
    try {
      await onDeleteIssue(issueId);
      addToast({
        type: "info",
        title: "Issue deleted",
        message: `${issueId} was removed.`,
      });
    } catch {
      addToast({
        type: "error",
        title: "Delete failed",
      });
    }
  };

  const getPriorityBadge = (p: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      urgent: { bg: "#7f1d1d", text: "#fca5a5" },
      high: { bg: "#78350f", text: "#fcd34d" },
      medium: { bg: "#1e3a8a", text: "#93c5fd" },
      low: { bg: "#14532d", text: "#86efac" },
      none: { bg: "#334155", text: "#cbd5e1" },
    };
    const c = colors[p] ?? colors.none!;
    return (
      <span
        style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          padding: "2px 6px",
          borderRadius: "4px",
          backgroundColor: c.bg,
          color: c.text,
        }}
      >
        {p}
      </span>
    );
  };

  const getLabelBadge = (l: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      bug: { bg: "#450a0a", text: "#f87171" },
      feature: { bg: "#312e81", text: "#a5b4fc" },
      improvement: { bg: "#064e3b", text: "#6ee7b7" },
      design: { bg: "#701a75", text: "#f472b6" },
      security: { bg: "#7c2d12", text: "#fdba74" },
    };
    const c = colors[l] ?? { bg: "#1e293b", text: "#94a3b8" };
    return (
      <span
        style={{
          fontSize: "10px",
          fontWeight: 600,
          padding: "2px 6px",
          borderRadius: "4px",
          backgroundColor: c.bg,
          color: c.text,
        }}
      >
        {l}
      </span>
    );
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(260px, 1fr))",
        gap: "16px",
        height: "100%",
        overflowX: "auto",
        padding: "16px",
        boxSizing: "border-box",
      }}
    >
      {columns.map(col => {
        const colIssues = filteredIssues.filter(i => i.status === col.id);
        return (
          <div
            key={col.id}
            style={{
              backgroundColor: "var(--bg-col, #0b1120)",
              borderRadius: "10px",
              border: "1px solid var(--border-color, #1e293b)",
              display: "flex",
              flexDirection: "column",
              height: "calc(100vh - 120px)",
              overflow: "hidden",
            }}
          >
            {/* Column Header */}
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid var(--border-color, #1e293b)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "var(--bg-col-header, #0f172a)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: col.color,
                  }}
                />
                <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-main, #f8fafc)" }}>
                  {col.title}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    backgroundColor: "#1e293b",
                    padding: "1px 6px",
                    borderRadius: "10px",
                  }}
                >
                  {colIssues.length}
                </span>
              </div>
              <button
                type="button"
                onClick={openCreateModal}
                title="Add task to this column"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  padding: "2px",
                  borderRadius: "4px",
                }}
              >
                <PlusIcon size={14} />
              </button>
            </div>

            {/* Column Cards */}
            <div
              style={{
                padding: "12px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                flex: 1,
              }}
            >
              {colIssues.length === 0 ? (
                <div
                  style={{
                    padding: "24px 12px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: "12px",
                    border: "1px dashed var(--border-color, #1e293b)",
                    borderRadius: "8px",
                  }}
                >
                  No issues in {col.title}
                </div>
              ) : (
                colIssues.map(issue => {
                  const assignee = memberMap.get(issue.assigneeId);
                  return (
                    <div
                      key={issue.id}
                      style={{
                        backgroundColor: "var(--bg-card, #1e293b)",
                        border: "1px solid var(--border-color, #334155)",
                        borderRadius: "8px",
                        padding: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        cursor: "pointer",
                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                        transition: "transform 0.15s, border-color 0.15s",
                      }}
                      onClick={() => openEditModal(issue.id)}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#38bdf8" }}>
                          {issue.id}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {getPriorityBadge(issue.priority)}
                          <button
                            type="button"
                            title="Delete issue"
                            onClick={e => {
                              e.stopPropagation();
                              handleDelete(issue.id);
                            }}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#64748b",
                              cursor: "pointer",
                              padding: "2px",
                            }}
                          >
                            <TrashIcon size={12} />
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "13px",
                          color: "var(--text-main, #f8fafc)",
                          lineHeight: "1.3",
                        }}
                      >
                        {issue.title}
                      </div>

                      {issue.description && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-muted, #94a3b8)",
                            lineHeight: "1.4",
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {issue.description}
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: "4px",
                          paddingTop: "6px",
                          borderTop: "1px solid var(--border-color, #334155)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {getLabelBadge(issue.label)}
                          <span style={{ fontSize: "10px", color: "#64748b" }}>
                            {issue.estimatePoints} pts
                          </span>
                        </div>

                        {assignee && (
                          <div
                            title={`${assignee.name} (${assignee.role})`}
                            style={{
                              width: "22px",
                              height: "22px",
                              borderRadius: "50%",
                              backgroundColor: assignee.color,
                              color: "#ffffff",
                              display: "grid",
                              placeItems: "center",
                              fontSize: "10px",
                              fontWeight: 700,
                            }}
                          >
                            {assignee.initials}
                          </div>
                        )}
                      </div>

                      {/* Quick Move Status Buttons */}
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          marginTop: "2px",
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        {col.id !== "todo" && col.id !== "in_progress" && (
                          <button
                            type="button"
                            onClick={() => handleMoveStatus(issue, "todo")}
                            style={{
                              fontSize: "9px",
                              padding: "2px 6px",
                              backgroundColor: "#0f172a",
                              color: "#94a3b8",
                              border: "1px solid #334155",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            → Todo
                          </button>
                        )}
                        {col.id !== "in_progress" && (
                          <button
                            type="button"
                            onClick={() => handleMoveStatus(issue, "in_progress")}
                            style={{
                              fontSize: "9px",
                              padding: "2px 6px",
                              backgroundColor: "#0f172a",
                              color: "#f59e0b",
                              border: "1px solid #334155",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            → Prog
                          </button>
                        )}
                        {col.id !== "done" && (
                          <button
                            type="button"
                            onClick={() => handleMoveStatus(issue, "done")}
                            style={{
                              fontSize: "9px",
                              padding: "2px 6px",
                              backgroundColor: "#0f172a",
                              color: "#10b981",
                              border: "1px solid #334155",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            ✓ Done
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
