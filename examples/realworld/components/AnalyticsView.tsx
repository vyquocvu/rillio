import type { ActivityLog, Issue, TeamMember } from "../types.js";

interface AnalyticsViewProps {
  issues: Issue[];
  members: TeamMember[];
  activities: ActivityLog[];
}

export function AnalyticsView({ issues, members, activities }: AnalyticsViewProps) {
  const total = issues.length;
  const done = issues.filter(i => i.status === "done").length;
  const inProgress = issues.filter(i => i.status === "in_progress" || i.status === "in_review").length;
  const backlog = issues.filter(i => i.status === "backlog" || i.status === "todo").length;
  const totalPoints = issues.reduce((acc, i) => acc + (i.estimatePoints || 0), 0);
  const donePoints = issues
    .filter(i => i.status === "done")
    .reduce((acc, i) => acc + (i.estimatePoints || 0), 0);

  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const pointsPct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;

  const urgentCount = issues.filter(i => i.priority === "urgent").length;
  const highCount = issues.filter(i => i.priority === "high").length;
  const mediumCount = issues.filter(i => i.priority === "medium").length;
  const lowCount = issues.filter(i => i.priority === "low" || i.priority === "none").length;

  return (
    <div style={{ padding: "24px", height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 700, color: "var(--text-main, #f8fafc)" }}>
        Workspace Analytics & Velocity
      </h2>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            backgroundColor: "#0f172a",
            padding: "16px",
            borderRadius: "10px",
            border: "1px solid #1e293b",
          }}
        >
          <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>Total Issues</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#38bdf8", marginTop: "4px" }}>
            {total}
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            {backlog} open in backlog/todo
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#0f172a",
            padding: "16px",
            borderRadius: "10px",
            border: "1px solid #1e293b",
          }}
        >
          <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>Active WIP</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#f59e0b", marginTop: "4px" }}>
            {inProgress}
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            Under active development or review
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#0f172a",
            padding: "16px",
            borderRadius: "10px",
            border: "1px solid #1e293b",
          }}
        >
          <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>Resolution Rate</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>
            {completionPct}%
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            {done} completed of {total} total
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#0f172a",
            padding: "16px",
            borderRadius: "10px",
            border: "1px solid #1e293b",
          }}
        >
          <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>Velocity Delivered</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#a855f7", marginTop: "4px" }}>
            {donePoints} <span style={{ fontSize: "14px", color: "#94a3b8" }}>/ {totalPoints} pts</span>
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            {pointsPct}% of sprint capacity
          </div>
        </div>
      </div>

      {/* Main Charts & Activity Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Status Breakdown Card */}
        <div
          style={{
            backgroundColor: "#0f172a",
            padding: "20px",
            borderRadius: "10px",
            border: "1px solid #1e293b",
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#f8fafc" }}>
            Status Distribution
          </h3>

          <div style={{ display: "flex", height: "12px", borderRadius: "6px", overflow: "hidden", marginBottom: "16px" }}>
            <div style={{ width: `${(done / (total || 1)) * 100}%`, backgroundColor: "#10b981" }} title={`Done: ${done}`} />
            <div style={{ width: `${(inProgress / (total || 1)) * 100}%`, backgroundColor: "#f59e0b" }} title={`In Progress: ${inProgress}`} />
            <div style={{ width: `${(backlog / (total || 1)) * 100}%`, backgroundColor: "#38bdf8" }} title={`Backlog: ${backlog}`} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#10b981" }} />
                <span style={{ color: "#cbd5e1" }}>Done</span>
              </div>
              <strong style={{ color: "#f8fafc" }}>{done}</strong>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#f59e0b" }} />
                <span style={{ color: "#cbd5e1" }}>In Progress & Review</span>
              </div>
              <strong style={{ color: "#f8fafc" }}>{inProgress}</strong>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#38bdf8" }} />
                <span style={{ color: "#cbd5e1" }}>Todo & Backlog</span>
              </div>
              <strong style={{ color: "#f8fafc" }}>{backlog}</strong>
            </div>
          </div>

          {/* Priority Tiers */}
          <h4 style={{ margin: "20px 0 10px", fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>
            Priority Breakdown
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", textAlign: "center" }}>
            <div style={{ backgroundColor: "#1e293b", padding: "8px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", color: "#f87171", fontWeight: 700 }}>URGENT</div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#fca5a5" }}>{urgentCount}</div>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "8px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", color: "#fcd34d", fontWeight: 700 }}>HIGH</div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#fde68a" }}>{highCount}</div>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "8px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", color: "#93c5fd", fontWeight: 700 }}>MEDIUM</div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#bfdbfe" }}>{mediumCount}</div>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "8px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", color: "#86efac", fontWeight: 700 }}>LOW</div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#bbf7d0" }}>{lowCount}</div>
            </div>
          </div>
        </div>

        {/* Live Activity Timeline */}
        <div
          style={{
            backgroundColor: "#0f172a",
            padding: "20px",
            borderRadius: "10px",
            border: "1px solid #1e293b",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#f8fafc" }}>
            Recent Activity Feed
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", flex: 1 }}>
            {activities.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "24px" }}>
                No recent activity logged yet.
              </div>
            ) : (
              activities.map(act => (
                <div
                  key={act.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    paddingBottom: "10px",
                    borderBottom: "1px solid #1e293b",
                    fontSize: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "#38bdf8",
                      marginTop: "5px",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, color: "#f8fafc" }}>{act.actor}</span>{" "}
                    <span style={{ color: "#94a3b8" }}>{act.action}</span>{" "}
                    <span style={{ color: "#38bdf8", fontWeight: 500 }}>{act.target}</span>
                    <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                      {act.timestamp}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
