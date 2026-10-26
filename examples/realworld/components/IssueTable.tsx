import { useState } from "@vyquocvu/rillio";
import { api } from "../api.js";
import { useAppStore } from "../store.js";
import type { Issue, IssueLabel, IssuePriority, IssueStatus, TeamMember } from "../types.js";
import { TrashIcon } from "./Icons.js";

interface IssueTableProps {
  issues: Issue[];
  members: TeamMember[];
  onRefresh: () => void;
}

type SortField = "id" | "title" | "status" | "priority" | "createdAt";

export function IssueTable({ issues, members, onRefresh }: IssueTableProps) {
  const filter = useAppStore(state => state.filter);
  const setFilter = useAppStore(state => state.setFilter);
  const openEditModal = useAppStore(state => state.openEditModal);
  const addToast = useAppStore(state => state.addToast);

  const [sortField, setSortField] = useState<SortField>("id");
  const [sortAsc, setSortAsc] = useState(false);

  const memberMap = new Map(members.map(m => [m.id, m]));

  const filtered = issues.filter(issue => {
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

  const sorted = [...filtered].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    const comp = String(valA).localeCompare(String(valB));
    return sortAsc ? comp : -comp;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteIssue(id);
      addToast({ type: "info", title: "Issue deleted", message: `${id} removed` });
      onRefresh();
    } catch {
      addToast({ type: "error", title: "Failed to delete" });
    }
  };

  return (
    <div style={{ padding: "20px", height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      {/* Filter Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>Filter:</span>
        <select
          value={filter.status}
          onChange={(e: any) => setFilter({ status: e.target.value })}
          style={{
            padding: "6px 10px",
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#f8fafc",
            fontSize: "12px",
            outline: "none",
          }}
        >
          <option value="all">All Statuses</option>
          <option value="backlog">Backlog</option>
          <option value="todo">Todo</option>
          <option value="in_progress">In Progress</option>
          <option value="in_review">In Review</option>
          <option value="done">Done</option>
        </select>

        <select
          value={filter.priority}
          onChange={(e: any) => setFilter({ priority: e.target.value })}
          style={{
            padding: "6px 10px",
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#f8fafc",
            fontSize: "12px",
            outline: "none",
          }}
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={filter.label}
          onChange={(e: any) => setFilter({ label: e.target.value })}
          style={{
            padding: "6px 10px",
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#f8fafc",
            fontSize: "12px",
            outline: "none",
          }}
        >
          <option value="all">All Labels</option>
          <option value="feature">Feature</option>
          <option value="bug">Bug</option>
          <option value="improvement">Improvement</option>
          <option value="design">Design</option>
          <option value="security">Security</option>
        </select>

        <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
          Showing <strong>{sorted.length}</strong> of {issues.length} issues
        </span>
      </div>

      {/* Table Container */}
      <div
        style={{
          backgroundColor: "#0f172a",
          borderRadius: "8px",
          border: "1px solid #1e293b",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ backgroundColor: "#1e293b", borderBottom: "1px solid #334155", color: "#94a3b8" }}>
              <th
                onClick={() => handleSort("id")}
                style={{ padding: "10px 14px", cursor: "pointer", width: "90px" }}
              >
                ID {sortField === "id" && (sortAsc ? "↑" : "↓")}
              </th>
              <th
                onClick={() => handleSort("title")}
                style={{ padding: "10px 14px", cursor: "pointer" }}
              >
                Title {sortField === "title" && (sortAsc ? "↑" : "↓")}
              </th>
              <th
                onClick={() => handleSort("status")}
                style={{ padding: "10px 14px", cursor: "pointer", width: "120px" }}
              >
                Status {sortField === "status" && (sortAsc ? "↑" : "↓")}
              </th>
              <th
                onClick={() => handleSort("priority")}
                style={{ padding: "10px 14px", cursor: "pointer", width: "100px" }}
              >
                Priority {sortField === "priority" && (sortAsc ? "↑" : "↓")}
              </th>
              <th style={{ padding: "10px 14px", width: "110px" }}>Label</th>
              <th style={{ padding: "10px 14px", width: "160px" }}>Assignee</th>
              <th
                onClick={() => handleSort("createdAt")}
                style={{ padding: "10px 14px", cursor: "pointer", width: "110px" }}
              >
                Created {sortField === "createdAt" && (sortAsc ? "↑" : "↓")}
              </th>
              <th style={{ padding: "10px 14px", width: "60px", textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: "36px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  No issues found matching the selected filters.
                </td>
              </tr>
            ) : (
              sorted.map(issue => {
                const assignee = memberMap.get(issue.assigneeId);
                return (
                  <tr
                    key={issue.id}
                    onClick={() => openEditModal(issue.id)}
                    style={{
                      borderBottom: "1px solid #1e293b",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                  >
                    <td style={{ padding: "12px 14px", fontWeight: 700, color: "#38bdf8", fontFamily: "monospace" }}>
                      {issue.id}
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: "#f8fafc" }}>
                      <div>{issue.title}</div>
                      {issue.description && (
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                          {issue.description.slice(0, 80)}...
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: "4px",
                          backgroundColor: "#1e293b",
                          color: "#cbd5e1",
                          textTransform: "capitalize",
                        }}
                      >
                        {issue.status.replace("_", " ")}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          backgroundColor:
                            issue.priority === "urgent"
                              ? "#7f1d1d"
                              : issue.priority === "high"
                              ? "#78350f"
                              : issue.priority === "medium"
                              ? "#1e3a8a"
                              : "#14532d",
                          color:
                            issue.priority === "urgent"
                              ? "#fca5a5"
                              : issue.priority === "high"
                              ? "#fcd34d"
                              : issue.priority === "medium"
                              ? "#93c5fd"
                              : "#86efac",
                          textTransform: "uppercase",
                        }}
                      >
                        {issue.priority}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>#{issue.label}</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {assignee ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div
                            style={{
                              width: "22px",
                              height: "22px",
                              borderRadius: "50%",
                              backgroundColor: assignee.color,
                              color: "#fff",
                              display: "grid",
                              placeItems: "center",
                              fontSize: "10px",
                              fontWeight: 700,
                            }}
                          >
                            {assignee.initials}
                          </div>
                          <span style={{ color: "#cbd5e1" }}>{assignee.name}</span>
                        </div>
                      ) : (
                        <span style={{ color: "#64748b" }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px", color: "#94a3b8", fontSize: "12px" }}>
                      {issue.createdAt}
                    </td>
                    <td
                      style={{ padding: "12px 14px", textAlign: "center" }}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleDelete(issue.id)}
                        title="Delete issue"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#64748b",
                          cursor: "pointer",
                          padding: "4px",
                        }}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
