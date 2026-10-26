import { create } from "rillio/external-store";
import type { ActivityLog, FilterState, Issue, ToastMessage, ViewMode } from "./types.js";

export interface AppState {
  view: ViewMode;
  selectedProjectId: string;
  filter: FilterState;
  issues: Issue[];
  activities: ActivityLog[];
  toasts: ToastMessage[];
  isCreateModalOpen: boolean;
  editingIssueId: string | null;
  isDevToolsOpen: boolean;
  theme: "dark" | "light";

  // Actions
  setView: (view: ViewMode) => void;
  setSelectedProjectId: (id: string) => void;
  setFilter: (patch: Partial<FilterState>) => void;
  resetFilter: () => void;
  setIssues: (next: Issue[] | ((current: Issue[]) => Issue[])) => void;
  setActivities: (activities: ActivityLog[]) => void;
  setIssueData: (issues: Issue[], activities: ActivityLog[]) => void;
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
  openCreateModal: () => void;
  openEditModal: (issueId: string) => void;
  closeModal: () => void;
  toggleDevTools: () => void;
  toggleTheme: () => void;
}

const defaultFilter: FilterState = {
  search: "",
  status: "all",
  priority: "all",
  label: "all",
  assigneeId: "all",
  projectId: "proj-1",
};

export const useAppStore = create<AppState>((set, get) => ({
  view: "board",
  selectedProjectId: "proj-1",
  filter: defaultFilter,
  issues: [],
  activities: [],
  toasts: [],
  isCreateModalOpen: false,
  editingIssueId: null,
  isDevToolsOpen: false,
  theme: "dark",

  setView: view => set({ view }),

  setSelectedProjectId: id =>
    set(state => ({
      selectedProjectId: id,
      filter: { ...state.filter, projectId: id },
    })),

  setFilter: patch =>
    set(state => ({
      filter: { ...state.filter, ...patch },
    })),

  resetFilter: () =>
    set(state => ({
      filter: { ...defaultFilter, projectId: state.selectedProjectId },
    })),

  setIssues: next =>
    set(state => ({
      issues: typeof next === "function" ? next(state.issues) : next,
    })),

  setActivities: activities => set({ activities }),

  setIssueData: (issues, activities) => set({ issues, activities }),

  addToast: toast => {
    const id = "toast-" + Math.random().toString(36).substring(2, 9);
    set(state => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    // Auto dismiss after 4 seconds
    setTimeout(() => {
      get().removeToast(id);
    }, 4000);
  },

  removeToast: id =>
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id),
    })),

  openCreateModal: () => set({ isCreateModalOpen: true, editingIssueId: null }),

  openEditModal: issueId => set({ isCreateModalOpen: true, editingIssueId: issueId }),

  closeModal: () => set({ isCreateModalOpen: false, editingIssueId: null }),

  toggleDevTools: () => set(state => ({ isDevToolsOpen: !state.isDevToolsOpen })),

  toggleTheme: () =>
    set(state => {
      const nextTheme = state.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = nextTheme;
      return { theme: nextTheme };
    }),
}));
