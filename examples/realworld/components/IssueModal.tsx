import { createPortal, useEffect, useState } from "rillio";
import { api } from "../api.js";
import { useAppStore } from "../store.js";
import type { Issue, IssueLabel, IssuePriority, IssueStatus, Project, TeamMember } from "../types.js";
import { CloseIcon } from "./Icons.js";

interface IssueModalProps {
  projects: Project[];
  members: TeamMember[];
  initialIssue?: Issue | null;
  onSaved: () => void;
}

export function IssueModal({ projects, members, initialIssue, onSaved }: IssueModalProps) {
  const isOpen = useAppStore(state => state.isCreateModalOpen);
  const closeModal = useAppStore(state => state.closeModal);
  const addToast = useAppStore(state => state.addToast);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);

  const [title, setTitle] = useState(initialIssue?.title ?? "");
  const [description, setDescription] = useState(initialIssue?.description ?? "");
  const [status, setStatus] = useState<IssueStatus>(initialIssue?.status ?? "todo");
  const [priority, setPriority] = useState<IssuePriority>(initialIssue?.priority ?? "medium");
  const [label, setLabel] = useState<IssueLabel>(initialIssue?.label ?? "feature");
  const [assigneeId, setAssigneeId] = useState(initialIssue?.assigneeId ?? members[0]?.id ?? "");
  const [projectId, setProjectId] = useState(initialIssue?.projectId ?? selectedProjectId);
  const [estimatePoints, setEstimatePoints] = useState(String(initialIssue?.estimatePoints ?? 3));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state if initialIssue changes
  useEffect(() => {
    if (initialIssue) {
      setTitle(initialIssue.title);
      setDescription(initialIssue.description);
      setStatus(initialIssue.status);
      setPriority(initialIssue.priority);
      setLabel(initialIssue.label);
      setAssigneeId(initialIssue.assigneeId);
      setProjectId(initialIssue.projectId);
      setEstimatePoints(String(initialIssue.estimatePoints));
    } else {
      setTitle("");
      setDescription("");
      setStatus("todo");
      setPriority("medium");
      setLabel("feature");
      setAssigneeId(members[0]?.id ?? "");
      setProjectId(selectedProjectId);
      setEstimatePoints("3");
    }
  }, [initialIssue, selectedProjectId]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setError(null);
    setSaving(true);

    try {
      if (initialIssue) {
        await api.updateIssue(initialIssue.id, {
          title: title.trim(),
          description: description.trim(),
          status,
          priority,
          label,
          assigneeId,
          projectId,
          estimatePoints: Number(estimatePoints) || 1,
        });
        addToast({
          type: "success",
          title: "Issue updated",
          message: `${initialIssue.id} saved successfully.`,
        });
      } else {
        const created = await api.createIssue({
          title: title.trim(),
          description: description.trim(),
          status,
          priority,
          label,
          assigneeId,
          projectId,
          estimatePoints: Number(estimatePoints) || 1,
        });
        addToast({
          type: "success",
          title: "Issue created",
          message: `${created.id} added to workspace.`,
        });
      }

      onSaved();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save issue");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        padding: "16px",
      }}
      onClick={e => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          backgroundColor: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          color: "#f8fafc",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #1e293b",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
            {initialIssue ? `Edit Issue: ${initialIssue.id}` : "Create New Issue"}
          </h2>
          <button
            type="button"
            onClick={closeModal}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {error && (
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: "#7f1d1d",
                border: "1px solid #dc2626",
                borderRadius: "6px",
                color: "#fecaca",
                fontSize: "12px",
              }}
            >
              {error}
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
              Title *
            </label>
            <input
              type="text"
              value={title}
              onInput={(e: any) => setTitle(e.target.value)}
              placeholder="e.g. Implement resilient data fetching with resource()"
              style={{
                width: "100%",
                padding: "10px 12px",
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
              Description
            </label>
            <textarea
              value={description}
              onInput={(e: any) => setDescription(e.target.value)}
              placeholder="Describe requirements, acceptance criteria, or context..."
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                Project
              </label>
              <select
                value={projectId}
                onChange={(e: any) => setProjectId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#f8fafc",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                Assignee
              </label>
              <select
                value={assigneeId}
                onChange={(e: any) => setAssigneeId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#f8fafc",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                Status
              </label>
              <select
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#f8fafc",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                <option value="backlog">Backlog</option>
                <option value="todo">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                Priority
              </label>
              <select
                value={priority}
                onChange={(e: any) => setPriority(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#f8fafc",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="none">None</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                Label
              </label>
              <select
                value={label}
                onChange={(e: any) => setLabel(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#f8fafc",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                <option value="feature">Feature</option>
                <option value="bug">Bug</option>
                <option value="improvement">Improvement</option>
                <option value="design">Design</option>
                <option value="security">Security</option>
              </select>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
              paddingTop: "16px",
              borderTop: "1px solid #1e293b",
            }}
          >
            <button
              type="button"
              onClick={closeModal}
              style={{
                padding: "8px 16px",
                backgroundColor: "transparent",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#cbd5e1",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "8px 18px",
                backgroundColor: "#6366f1",
                border: "none",
                borderRadius: "6px",
                color: "#ffffff",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: "13px",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving..." : initialIssue ? "Save Changes" : "Create Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
