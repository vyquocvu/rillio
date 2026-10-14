/**
 * TaskFlow: Real-World Domain Types and Contracts.
 */

export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done";
export type IssuePriority = "urgent" | "high" | "medium" | "low" | "none";
export type IssueLabel = "bug" | "feature" | "improvement" | "design" | "security";

export interface Issue {
  id: string; // e.g., "TF-101"
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  label: IssueLabel;
  assigneeId: string;
  projectId: string;
  createdAt: string;
  estimatePoints: number;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  color: string;
  leadId: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  initials: string;
  color: string;
  role: "Lead" | "Staff Engineer" | "Product Designer" | "Core Dev";
  capacityHours: number;
  activeIssuesCount: number;
  status: "online" | "in_meeting" | "offline";
}

export interface ActivityLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
}

export interface ToastMessage {
  id: string;
  type: "success" | "info" | "warning" | "error";
  title: string;
  message?: string;
}

export type ViewMode = "board" | "table" | "analytics" | "team" | "settings";

export interface FilterState {
  search: string;
  status: IssueStatus | "all";
  priority: IssuePriority | "all";
  label: IssueLabel | "all";
  assigneeId: string | "all";
  projectId: string;
}
