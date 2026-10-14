import { initialActivities, initialIssues, initialMembers, initialProjects } from "./mock-data.js";
import type { ActivityLog, Issue, Project, TeamMember } from "./types.js";

const STORAGE_KEY = "taskflow_db_v1";

interface Database {
  projects: Project[];
  members: TeamMember[];
  issues: Issue[];
  activities: ActivityLog[];
}

function loadDatabase(): Database {
  if (typeof localStorage === "undefined") {
    return {
      projects: initialProjects,
      members: initialMembers,
      issues: initialIssues,
      activities: initialActivities,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return saveDatabase(initialProjects, initialMembers, initialIssues, initialActivities);
    const parsed = JSON.parse(raw);
    if (!parsed.issues || !parsed.projects) throw new Error("corrupt");
    return parsed;
  } catch {
    return saveDatabase(initialProjects, initialMembers, initialIssues, initialActivities);
  }
}

function saveDatabase(
  projects: Project[],
  members: TeamMember[],
  issues: Issue[],
  activities: ActivityLog[]
): Database {
  const db: Database = { projects, members, issues, activities };
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Ignore quota errors
    }
  }
  return db;
}

function delay(ms: number = 80): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const api = {
  async getProjects(): Promise<Project[]> {
    await delay(60);
    const db = loadDatabase();
    return db.projects;
  },

  async getMembers(): Promise<TeamMember[]> {
    await delay(70);
    const db = loadDatabase();
    return db.members;
  },

  async getIssues(projectId?: string): Promise<Issue[]> {
    await delay(100);
    const db = loadDatabase();
    return projectId ? db.issues.filter(i => i.projectId === projectId) : db.issues;
  },

  async createIssue(draft: Omit<Issue, "id" | "createdAt">): Promise<Issue> {
    await delay(120);
    const db = loadDatabase();
    const count = db.issues.length + 101;
    const project = db.projects.find(p => p.id === draft.projectId);
    const key = project?.key ?? "TF";
    const id = `${key}-${count}`;
    const newIssue: Issue = {
      ...draft,
      id,
      createdAt: new Date().toISOString().split("T")[0]!,
    };

    const newActivity: ActivityLog = {
      id: "act-" + Date.now(),
      actor: "Current User",
      action: "created issue",
      target: `${id} (${newIssue.title})`,
      timestamp: "Just now",
    };

    db.issues.unshift(newIssue);
    db.activities.unshift(newActivity);
    saveDatabase(db.projects, db.members, db.issues, db.activities);
    return newIssue;
  },

  async updateIssue(id: string, patch: Partial<Issue>): Promise<Issue> {
    await delay(80);
    const db = loadDatabase();
    const index = db.issues.findIndex(i => i.id === id);
    if (index === -1) throw new Error(`Issue not found: ${id}`);
    const updated = { ...db.issues[index]!, ...patch };
    db.issues[index] = updated;

    if (patch.status) {
      db.activities.unshift({
        id: "act-" + Date.now(),
        actor: "Current User",
        action: `moved to ${patch.status.replace("_", " ")}`,
        target: id,
        timestamp: "Just now",
      });
    }

    saveDatabase(db.projects, db.members, db.issues, db.activities);
    return updated;
  },

  async deleteIssue(id: string): Promise<void> {
    await delay(80);
    const db = loadDatabase();
    db.issues = db.issues.filter(i => i.id !== id);
    saveDatabase(db.projects, db.members, db.issues, db.activities);
  },

  async getActivities(): Promise<ActivityLog[]> {
    await delay(80);
    const db = loadDatabase();
    return db.activities;
  },

  async resetDatabase(): Promise<void> {
    await delay(60);
    saveDatabase(initialProjects, initialMembers, initialIssues, initialActivities);
  },
};
