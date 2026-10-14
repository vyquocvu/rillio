import type { Issue, TeamMember } from "../types.js";

interface TeamViewProps {
  members: TeamMember[];
  issues: Issue[];
}

export function TeamView({ members, issues }: TeamViewProps) {
  return (
    <div style={{ padding: "24px", height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 700, color: "var(--text-main, #f8fafc)" }}>
          Team Members & Capacity
        </h2>
        <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>
          Monitor engineering workload, active task assignments, and sprint capacity.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "16px",
        }}
      >
        {members.map(member => {
          const memberIssues = issues.filter(i => i.assigneeId === member.id);
          const doneCount = memberIssues.filter(i => i.status === "done").length;
          const openCount = memberIssues.length - doneCount;

          const statusColor =
            member.status === "online"
              ? "#10b981"
              : member.status === "in_meeting"
              ? "#f59e0b"
              : "#64748b";

          return (
            <div
              key={member.id}
              style={{
                backgroundColor: "#0f172a",
                borderRadius: "10px",
                border: "1px solid #1e293b",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              {/* Profile Header */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      backgroundColor: member.color,
                      color: "#ffffff",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 700,
                      fontSize: "15px",
                    }}
                  >
                    {member.initials}
                  </div>
                  <span
                    style={{
                      position: "absolute",
                      bottom: "0",
                      right: "0",
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: statusColor,
                      border: "2px solid #0f172a",
                    }}
                    title={member.status}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "#f8fafc" }}>
                    {member.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>{member.email}</div>
                </div>

                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    backgroundColor: "#1e293b",
                    color: "#38bdf8",
                  }}
                >
                  {member.role}
                </span>
              </div>

              {/* Workload Stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                  backgroundColor: "#1e293b",
                  borderRadius: "6px",
                  padding: "10px",
                  textAlign: "center",
                  fontSize: "11px",
                }}
              >
                <div>
                  <div style={{ color: "#94a3b8" }}>Active</div>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: "#f59e0b", marginTop: "2px" }}>
                    {openCount}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94a3b8" }}>Done</div>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: "#10b981", marginTop: "2px" }}>
                    {doneCount}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94a3b8" }}>Capacity</div>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: "#cbd5e1", marginTop: "2px" }}>
                    {member.capacityHours}h/wk
                  </div>
                </div>
              </div>

              {/* Assigned Tasks preview */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "6px", textTransform: "uppercase" }}>
                  Current Assignments ({memberIssues.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {memberIssues.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                      No active assignments.
                    </div>
                  ) : (
                    memberIssues.slice(0, 3).map(issue => (
                      <div
                        key={issue.id}
                        style={{
                          fontSize: "12px",
                          color: "#cbd5e1",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: "#020617",
                          padding: "6px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        <span style={{ fontWeight: 600, color: "#38bdf8", marginRight: "6px" }}>
                          {issue.id}
                        </span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {issue.title}
                        </span>
                        <span style={{ fontSize: "10px", color: "#64748b", marginLeft: "6px" }}>
                          {issue.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
