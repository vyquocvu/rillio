/**
 * Rillio Studio — a small, production-shaped dashboard built with the runtime.
 *
 * The example intentionally stays dependency-free. It exercises the things a
 * App-local components need to feel good in a real app: composed controls, controlled
 * forms, keyed tables, focusable dialogs, responsive layout and live state.
 */

import { createRoot, useEffect, useMemo, useState } from "@vyquocvu/rillio";
import { installSourceViewer } from "./source-viewer.js";

type TabId = "overview" | "users" | "settings";
type Period = "7d" | "30d" | "90d";
type UserRole = "Admin" | "Editor" | "Viewer";
type UserStatus = "Active" | "Invited" | "Suspended";

interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastActive: string;
  initials: string;
  color: string;
}

interface UserDraft {
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

const initialUsers: User[] = [
  { id: 1, name: "Olivia Rhye", email: "olivia@rillio.studio", role: "Admin", status: "Active", lastActive: "2 min ago", initials: "OR", color: "#7c3aed" },
  { id: 2, name: "Phoenix Baker", email: "phoenix@rillio.studio", role: "Editor", status: "Active", lastActive: "18 min ago", initials: "PB", color: "#0ea5e9" },
  { id: 3, name: "Lana Steiner", email: "lana@rillio.studio", role: "Editor", status: "Invited", lastActive: "Yesterday", initials: "LS", color: "#f97316" },
  { id: 4, name: "Demi Wilkinson", email: "demi@rillio.studio", role: "Viewer", status: "Active", lastActive: "Yesterday", initials: "DW", color: "#16a34a" },
  { id: 5, name: "Candice Wu", email: "candice@rillio.studio", role: "Viewer", status: "Suspended", lastActive: "Oct 08, 2026", initials: "CW", color: "#db2777" },
  { id: 6, name: "Natali Craig", email: "natali@rillio.studio", role: "Editor", status: "Active", lastActive: "Oct 07, 2026", initials: "NC", color: "#0891b2" },
];

const periodData: Record<Period, {
  label: string;
  revenue: string;
  delta: string;
  orders: string;
  average: string;
  chart: number[];
}> = {
  "7d": { label: "Last 7 days", revenue: "$48,290", delta: "+18.4%", orders: "1,284", average: "$37.60", chart: [28, 42, 38, 56, 49, 72, 64, 82, 77, 96, 88, 105] },
  "30d": { label: "Last 30 days", revenue: "$184,920", delta: "+24.8%", orders: "5,842", average: "$31.65", chart: [36, 58, 51, 44, 72, 68, 84, 76, 93, 87, 112, 104] },
  "90d": { label: "Last 90 days", revenue: "$492,610", delta: "+31.2%", orders: "16,904", average: "$29.14", chart: [30, 44, 41, 63, 59, 74, 69, 78, 92, 86, 108, 120] },
};

const styles = String.raw`
  :root {
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #172033;
    background: #f7f8fc;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
  }
  * { box-sizing: border-box; }
  html, body, #app { min-height: 100%; margin: 0; }
  body { min-width: 320px; background: #f7f8fc; }
  button, input, select { font: inherit; }
  button { cursor: pointer; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid rgba(124, 58, 237, .22); outline-offset: 2px; }
  .app-shell { display: flex; min-height: 100vh; }
  .sidebar { position: sticky; top: 0; display: flex; flex: 0 0 256px; flex-direction: column; min-height: 100vh; padding: 22px 14px 16px; color: #aab4c8; background: #111827; transition: flex-basis .2s ease, transform .2s ease; z-index: 30; }
  .sidebar--collapsed { flex-basis: 84px; }
  .brand-row { display: flex; align-items: center; gap: 11px; min-height: 36px; padding: 0 10px 25px; color: #fff; }
  .brand-mark { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 10px; color: #fff; background: linear-gradient(135deg, #8b5cf6, #5b21b6); box-shadow: 0 7px 20px rgba(124, 58, 237, .35); font-size: 17px; font-weight: 800; }
  .brand-name { overflow: hidden; font-size: 16px; font-weight: 750; letter-spacing: -.02em; white-space: nowrap; }
  .brand-name span { color: #a78bfa; }
  .collapse-button { display: grid; width: 28px; height: 28px; margin-left: auto; place-items: center; border: 1px solid #2a354b; border-radius: 8px; color: #73819b; background: transparent; }
  .collapse-button:hover { color: #fff; background: #1c273a; }
  .workspace { display: flex; align-items: center; gap: 9px; margin: 0 4px 25px; padding: 10px; border: 1px solid #2b374c; border-radius: 12px; background: #182235; }
  .workspace-avatar { display: grid; flex: 0 0 28px; width: 28px; height: 28px; place-items: center; border-radius: 8px; color: #d9ccff; background: #33266d; font-size: 11px; font-weight: 800; }
  .workspace-copy { min-width: 0; overflow: hidden; }
  .workspace-label { color: #75839b; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .workspace-name { overflow: hidden; margin-top: 2px; color: #e7eaf1; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .sidebar-section { padding: 0 10px; color: #65738c; font-size: 10px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
  .sidebar-nav { display: grid; gap: 4px; margin: 9px 0 25px; }
  .nav-item { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 40px; padding: 0 11px; border: 0; border-radius: 10px; color: #9aa8be; background: transparent; text-align: left; transition: color .15s ease, background .15s ease; }
  .nav-item:hover { color: #f5f3ff; background: #1a263a; }
  .nav-item--active { color: #fff; background: linear-gradient(90deg, #33216f, #261e4c); box-shadow: inset 3px 0 #a78bfa; }
  .nav-item__label { overflow: hidden; flex: 1; white-space: nowrap; }
  .nav-item__count { display: grid; min-width: 21px; height: 21px; padding: 0 5px; place-items: center; border-radius: 6px; color: #d9ccff; background: #49328e; font-size: 10px; font-weight: 800; }
  .sidebar-spacer { flex: 1; }
  .upgrade-card { margin: 0 4px 18px; padding: 14px; border: 1px solid #3d316e; border-radius: 13px; background: radial-gradient(circle at 100% 0, rgba(139, 92, 246, .22), transparent 58%), #201a3d; }
  .upgrade-card__eyebrow { color: #bcaaf9; font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .upgrade-card p { margin: 7px 0 12px; color: #c5c1d6; font-size: 11px; line-height: 1.5; }
  .upgrade-card button { width: 100%; padding: 8px; border: 0; border-radius: 8px; color: #fff; background: #7c3aed; font-size: 11px; font-weight: 700; }
  .upgrade-card button:hover { background: #8b5cf6; }
  .sidebar-user { display: flex; align-items: center; gap: 9px; padding: 13px 10px 0; border-top: 1px solid #263247; }
  .sidebar-user__copy { min-width: 0; flex: 1; }
  .sidebar-user__name { overflow: hidden; color: #ecedf2; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .sidebar-user__email { overflow: hidden; margin-top: 2px; color: #71809a; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .sidebar--collapsed .brand-name, .sidebar--collapsed .workspace-copy, .sidebar--collapsed .workspace > svg, .sidebar--collapsed .sidebar-section, .sidebar--collapsed .nav-item__label, .sidebar--collapsed .nav-item__count, .sidebar--collapsed .upgrade-card, .sidebar--collapsed .sidebar-user__copy, .sidebar--collapsed .sidebar-user > svg { display: none; }
  .sidebar--collapsed .brand-row, .sidebar--collapsed .workspace, .sidebar--collapsed .nav-item, .sidebar--collapsed .sidebar-user { justify-content: center; }
  .sidebar--collapsed .collapse-button { margin-left: 0; }
  .sidebar--collapsed .workspace { padding: 10px 0; border-color: transparent; background: transparent; }
  .sidebar--collapsed .sidebar-user { padding-left: 0; padding-right: 0; }
  .main-shell { min-width: 0; flex: 1; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; height: 72px; padding: 0 38px; border-bottom: 1px solid #e8ebf2; background: rgba(255, 255, 255, .82); backdrop-filter: blur(14px); }
  .topbar__left, .topbar__actions, .topbar__account { display: flex; align-items: center; }
  .topbar__left { min-width: 0; gap: 15px; }
  .topbar__title { overflow: hidden; color: #263248; font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .mobile-menu { display: none; width: 34px; height: 34px; place-items: center; border: 1px solid #e2e7ef; border-radius: 9px; color: #6c7890; background: #fff; }
  .topbar__actions { gap: 9px; }
  .topbar-search { display: flex; align-items: center; gap: 8px; width: 210px; height: 36px; padding: 0 11px; border: 1px solid #e3e7ef; border-radius: 9px; color: #8792a7; background: #f8f9fc; }
  .topbar-search input { width: 100%; border: 0; outline: 0; color: #263248; background: transparent; font-size: 12px; }
  .topbar-search input::placeholder { color: #9ba5b6; }
  .topbar-search span { color: #a0a8b7; font-size: 9px; white-space: nowrap; }
  .topbar__account { gap: 9px; padding-left: 12px; border-left: 1px solid #e5e8f0; }
  .topbar__account-copy { text-align: right; }
  .topbar__account-name { color: #263248; font-size: 11px; font-weight: 750; }
  .topbar__account-role { margin-top: 2px; color: #8c97a9; font-size: 10px; }
  .content { max-width: 1540px; margin: 0 auto; padding: 38px; }
  .page-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 29px; }
  .eyebrow { margin-bottom: 7px; color: #7c3aed; font-size: 10px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
  h1, h2, h3, p { margin-top: 0; }
  h1 { margin-bottom: 7px; color: #172033; font-size: clamp(25px, 3vw, 32px); letter-spacing: -.045em; line-height: 1.08; }
  .page-heading p { margin: 0; color: #7a8599; font-size: 13px; }
  .heading-actions { display: flex; align-items: center; gap: 9px; }
  .button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 0 13px; border: 1px solid transparent; border-radius: 9px; font-size: 12px; font-weight: 750; transition: transform .15s ease, box-shadow .15s ease, background .15s ease; }
  .button:hover { transform: translateY(-1px); }
  .button--primary { color: #fff; background: #6d3bd8; box-shadow: 0 7px 16px rgba(109, 59, 216, .2); }
  .button--primary:hover { background: #7c3aed; box-shadow: 0 9px 20px rgba(109, 59, 216, .28); }
  .button--secondary { border-color: #e1e6ef; color: #526078; background: #fff; }
  .button--secondary:hover { border-color: #c9d0dd; background: #fbfcfe; }
  .button--danger { border-color: #f3d6dc; color: #c13c57; background: #fff; }
  .button--danger:hover { background: #fff4f5; }
  .button--icon { width: 36px; padding: 0; border-color: #e2e7ef; color: #718096; background: #fff; }
  .button--icon:hover { color: #6d3bd8; border-color: #d8cafa; background: #fbfaff; }
  .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 15px; margin-bottom: 17px; }
  .metric-card { position: relative; overflow: hidden; min-height: 147px; padding: 19px; border: 1px solid #e6e9f0; border-radius: 14px; background: #fff; box-shadow: 0 5px 18px rgba(30, 42, 67, .035); }
  .metric-card--featured { border-color: #7042dc; color: #fff; background: linear-gradient(140deg, #6840ce 0%, #4b2a98 100%); box-shadow: 0 11px 28px rgba(89, 48, 180, .22); }
  .metric-card--featured::after { position: absolute; width: 180px; height: 180px; right: -63px; bottom: -93px; border: 1px solid rgba(255,255,255,.18); border-radius: 50%; box-shadow: 0 0 0 17px rgba(255,255,255,.04), 0 0 0 34px rgba(255,255,255,.035); content: ""; }
  .metric-card__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .metric-card__label { color: #7d889c; font-size: 11px; font-weight: 650; }
  .metric-card--featured .metric-card__label { color: #d7ccf7; }
  .metric-card__icon { display: grid; width: 29px; height: 29px; place-items: center; border-radius: 8px; color: #7343da; background: #f0eaff; }
  .metric-card--featured .metric-card__icon { color: #e1d7ff; background: rgba(255,255,255,.15); }
  .metric-card__value { margin: 14px 0 10px; color: #182238; font-size: 25px; font-weight: 800; letter-spacing: -.04em; }
  .metric-card--featured .metric-card__value { color: #fff; }
  .metric-card__meta { display: flex; align-items: center; gap: 6px; color: #8a95a9; font-size: 10px; }
  .metric-card--featured .metric-card__meta { color: #dbd1fa; }
  .trend { display: inline-flex; align-items: center; gap: 2px; padding: 3px 5px; border-radius: 5px; color: #138a59; background: #eaf9f2; font-size: 10px; font-weight: 800; }
  .metric-card--featured .trend { color: #d9ffec; background: rgba(10, 116, 77, .28); }
  .content-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(270px, .85fr); gap: 17px; }
  .panel { border: 1px solid #e6e9f0; border-radius: 14px; background: #fff; box-shadow: 0 5px 18px rgba(30, 42, 67, .035); }
  .panel__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 20px 21px 0; }
  .panel__title { margin: 0; color: #27334a; font-size: 13px; font-weight: 780; }
  .panel__subtitle { margin: 5px 0 0; color: #909bad; font-size: 10px; }
  .period-select { height: 30px; padding: 0 9px; border: 1px solid #e4e8f0; border-radius: 7px; outline: 0; color: #67748a; background: #fbfcfe; font-size: 10px; font-weight: 700; }
  .chart-wrap { padding: 18px 20px 17px; }
  .chart-key { display: flex; align-items: center; gap: 18px; margin-bottom: 11px; color: #8994a8; font-size: 10px; }
  .chart-key__item { display: flex; align-items: center; gap: 5px; }
  .chart-key__dot { width: 7px; height: 7px; border-radius: 50%; background: #7c3aed; }
  .chart-key__dot--muted { background: #d9dce6; }
  .chart { display: block; width: 100%; height: 210px; overflow: visible; }
  .chart-grid-line { stroke: #eef0f5; stroke-width: 1; }
  .chart-area { fill: url(#chart-fill); }
  .chart-line { fill: none; stroke: #7740e2; stroke-linecap: round; stroke-linejoin: round; stroke-width: 3; }
  .chart-point { fill: #fff; stroke: #7740e2; stroke-width: 2; }
  .chart-labels { display: flex; justify-content: space-between; padding: 1px 4px 0; color: #a0a8b7; font-size: 9px; }
  .breakdown { padding: 20px 21px 19px; border-top: 1px solid #f0f1f5; }
  .breakdown__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 13px; color: #667389; font-size: 10px; }
  .breakdown__row:last-child { margin-bottom: 0; }
  .breakdown__value { color: #2c3850; font-weight: 750; }
  .progress { height: 5px; margin-top: 7px; overflow: hidden; border-radius: 99px; background: #f0f1f5; }
  .progress__bar { height: 100%; border-radius: inherit; background: #7c3aed; }
  .progress__bar--blue { background: #25a3dc; }
  .progress__bar--orange { background: #f09a37; }
  .activity-list { display: grid; gap: 0; padding: 9px 21px 12px; }
  .activity-item { display: flex; gap: 11px; padding: 12px 0; border-bottom: 1px solid #f1f2f6; }
  .activity-item:last-child { border-bottom: 0; }
  .activity-icon { display: grid; flex: 0 0 30px; width: 30px; height: 30px; place-items: center; border-radius: 9px; color: #7343da; background: #f1ebff; }
  .activity-icon--green { color: #0d9660; background: #e6f8f0; }
  .activity-icon--blue { color: #168dc3; background: #e8f7fd; }
  .activity-copy { min-width: 0; flex: 1; }
  .activity-copy p { margin: 0; color: #637087; font-size: 10px; line-height: 1.45; }
  .activity-copy strong { color: #29354b; font-weight: 750; }
  .activity-time { margin-top: 5px; color: #a0a8b7; font-size: 9px; }
  .table-panel { overflow: hidden; margin-top: 17px; }
  .table-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 13px; padding: 17px 21px; border-bottom: 1px solid #edf0f4; }
  .table-toolbar__title { display: flex; align-items: center; gap: 8px; color: #27334a; font-size: 13px; font-weight: 780; }
  .table-toolbar__count { display: grid; min-width: 24px; height: 19px; padding: 0 5px; place-items: center; border-radius: 6px; color: #7041d6; background: #f0eaff; font-size: 9px; font-weight: 800; }
  .table-actions { display: flex; align-items: center; gap: 8px; }
  .table-search { display: flex; align-items: center; gap: 7px; width: 175px; height: 32px; padding: 0 9px; border: 1px solid #e1e6ee; border-radius: 8px; color: #8b96a9; background: #fbfcfe; }
  .table-search input { width: 100%; border: 0; outline: 0; color: #38445b; background: transparent; font-size: 10px; }
  .filter-select { height: 32px; padding: 0 8px; border: 1px solid #e1e6ee; border-radius: 8px; outline: 0; color: #68758a; background: #fbfcfe; font-size: 10px; }
  .table-scroll { overflow-x: auto; }
  .data-table { width: 100%; min-width: 690px; border-collapse: collapse; }
  .data-table th { padding: 11px 21px; color: #9aa3b2; background: #fcfcfe; font-size: 9px; font-weight: 800; letter-spacing: .07em; text-align: left; text-transform: uppercase; }
  .data-table td { padding: 13px 21px; border-top: 1px solid #f0f2f6; color: #69758a; font-size: 10px; white-space: nowrap; }
  .data-table tbody tr:hover { background: #fcfbff; }
  .person { display: flex; align-items: center; gap: 9px; }
  .avatar { display: grid; flex: 0 0 30px; width: 30px; height: 30px; place-items: center; border-radius: 9px; color: #fff; font-size: 9px; font-weight: 800; }
  .person__name { color: #2e3a51; font-size: 11px; font-weight: 750; }
  .person__email { margin-top: 2px; color: #9aa3b2; font-size: 9px; }
  .pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 7px; border-radius: 99px; font-size: 9px; font-weight: 750; }
  .pill::before { width: 5px; height: 5px; border-radius: 50%; background: currentColor; content: ""; }
  .pill--active { color: #138a59; background: #eaf9f2; }
  .pill--invited { color: #ae6b13; background: #fff6df; }
  .pill--suspended { color: #c2475d; background: #fff0f2; }
  .role { color: #536077; font-weight: 650; }
  .row-actions { display: flex; gap: 3px; }
  .row-action { display: grid; width: 26px; height: 26px; place-items: center; border: 0; border-radius: 7px; color: #9aa3b2; background: transparent; }
  .row-action:hover { color: #7041d6; background: #f1edff; }
  .row-action--delete:hover { color: #c2475d; background: #fff0f2; }
  .empty-row { padding: 28px !important; color: #99a3b4 !important; text-align: center !important; }
  .settings-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(270px, .9fr); gap: 17px; }
  .settings-card { padding: 21px; }
  .settings-card + .settings-card { margin-top: 17px; }
  .settings-card__heading { margin-bottom: 20px; }
  .settings-card__heading h2 { margin: 0 0 5px; color: #27334a; font-size: 14px; }
  .settings-card__heading p { margin: 0; color: #929bad; font-size: 10px; line-height: 1.5; }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 15px 0; border-top: 1px solid #eff1f5; }
  .setting-row__copy strong { display: block; color: #344057; font-size: 11px; }
  .setting-row__copy span { display: block; margin-top: 4px; color: #929bad; font-size: 10px; line-height: 1.45; }
  .switch { position: relative; flex: 0 0 36px; width: 36px; height: 20px; padding: 0; border: 0; border-radius: 99px; background: #d9deea; transition: background .15s ease; }
  .switch::after { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(20, 30, 50, .18); transition: transform .15s ease; content: ""; }
  .switch--on { background: #7441db; }
  .switch--on::after { transform: translateX(16px); }
  .usage-card { padding: 21px; }
  .usage-summary { display: flex; align-items: flex-end; justify-content: space-between; margin: 25px 0 15px; }
  .usage-summary__value { color: #28354c; font-size: 25px; font-weight: 800; letter-spacing: -.04em; }
  .usage-summary__value small { color: #a0a8b7; font-size: 10px; font-weight: 650; letter-spacing: 0; }
  .usage-summary__label { color: #929bad; font-size: 10px; }
  .usage-bars { display: flex; align-items: flex-end; gap: 7px; height: 115px; padding-top: 12px; border-bottom: 1px solid #eef0f4; }
  .usage-bar { flex: 1; min-width: 9px; border-radius: 5px 5px 0 0; background: #dcd2fb; }
  .usage-bar:nth-child(2n) { background: #bda8f4; }
  .usage-bar--current { background: #7542dd !important; }
  .usage-labels { display: flex; justify-content: space-between; margin-top: 8px; color: #a0a8b7; font-size: 9px; }
  .modal-backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(17, 24, 39, .48); backdrop-filter: blur(4px); z-index: 100; }
  .modal { width: min(100%, 480px); max-height: min(680px, calc(100vh - 40px)); overflow: auto; border: 1px solid rgba(255,255,255,.7); border-radius: 17px; background: #fff; box-shadow: 0 25px 80px rgba(17, 24, 39, .24); }
  .modal__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 23px 23px 17px; }
  .modal__eyebrow { margin-bottom: 6px; color: #7c3aed; font-size: 9px; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }
  .modal__header h2 { margin: 0; color: #202c43; font-size: 18px; letter-spacing: -.03em; }
  .modal__header p { margin: 6px 0 0; color: #929bad; font-size: 10px; }
  .modal__body { padding: 0 23px 23px; }
  .modal__footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 19px; }
  .close-button { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 8px; color: #96a0b2; background: #f7f8fb; }
  .close-button:hover { color: #35415a; background: #eef0f5; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .form-field { display: grid; gap: 6px; }
  .form-field--full { grid-column: 1 / -1; }
  .form-field label { color: #536078; font-size: 10px; font-weight: 750; }
  .form-field input, .form-field select { width: 100%; height: 37px; padding: 0 10px; border: 1px solid #dfe4ed; border-radius: 8px; outline: 0; color: #2b3850; background: #fbfcfe; font-size: 11px; }
  .form-field input:focus, .form-field select:focus { border-color: #9d7be9; box-shadow: 0 0 0 3px rgba(124, 58, 237, .1); }
  .form-error { margin: 15px 0 0; padding: 9px 10px; border-radius: 8px; color: #bd4056; background: #fff0f2; font-size: 10px; }
  .toast { position: fixed; right: 22px; bottom: 22px; display: flex; align-items: center; gap: 9px; max-width: min(350px, calc(100vw - 44px)); padding: 12px 14px; border: 1px solid #cdebdc; border-radius: 11px; color: #176b4a; background: #f0fcf5; box-shadow: 0 12px 30px rgba(26, 79, 56, .14); font-size: 11px; font-weight: 700; z-index: 120; }
  .toast__icon { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; color: #fff; background: #20a66d; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; padding: 0; margin: -1px; border: 0; clip: rect(0, 0, 0, 0); white-space: nowrap; }
  @media (max-width: 1120px) { .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .content-grid, .settings-grid { grid-template-columns: 1fr; } }
  @media (max-width: 820px) { .sidebar { position: fixed; left: 0; transform: translateX(-100%); box-shadow: 12px 0 35px rgba(15, 23, 42, .18); } .sidebar--open { transform: translateX(0); } .mobile-menu { display: grid; } .topbar { padding: 0 22px; } .topbar-search { display: none; } .content { padding: 29px 22px; } }
  @media (max-width: 620px) { .topbar { height: 64px; padding: 0 15px; } .topbar__account-copy { display: none; } .topbar__account { padding-left: 0; border-left: 0; } .topbar__actions { gap: 5px; } .content { padding: 25px 15px; } .page-heading { display: block; } .heading-actions { margin-top: 18px; } .heading-actions .button--secondary { flex: 1; } .metric-grid { gap: 10px; } .metric-card { min-height: 132px; padding: 14px; } .metric-card__value { margin: 12px 0 8px; font-size: 21px; } .metric-card__label { font-size: 10px; } .content-grid { gap: 11px; } .panel__header { padding: 17px 16px 0; } .chart-wrap { padding: 16px 15px; } .chart { height: 165px; } .breakdown { padding: 17px 16px; } .table-toolbar { display: block; padding: 15px 16px; } .table-actions { margin-top: 12px; } .table-search { flex: 1; width: auto; } .data-table th { padding-left: 16px; padding-right: 16px; } .data-table td { padding-left: 16px; padding-right: 16px; } .form-grid { grid-template-columns: 1fr; } .form-field--full { grid-column: auto; } .modal__header, .modal__body { padding-left: 17px; padding-right: 17px; } }
`;

type IconName = "grid" | "users" | "chart" | "settings" | "help" | "bell" | "search" | "plus" | "arrow-up" | "arrow-down" | "dots" | "edit" | "trash" | "download" | "check" | "close" | "menu" | "calendar" | "spark" | "shield" | "activity";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" } as const;
  switch (name) {
    case "grid": return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
    case "users": return <svg {...common}><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20" /><circle cx="10" cy="7" r="3.5" /><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M19.5 20v-1.2a4.5 4.5 0 0 0-2.4-4" /></svg>;
    case "chart": return <svg {...common}><path d="M4 19V5M4 19h17" /><path d="m7 15 3-4 3 2 5-6" /></svg>;
    case "settings": return <svg {...common}><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" /><path d="M19.4 15a7.5 7.5 0 0 0 .1-6 7.5 7.5 0 0 0-5.2-5.2 7.5 7.5 0 0 0-6 0 7.5 7.5 0 0 0-5.2 5.2 7.5 7.5 0 0 0 0 6 7.5 7.5 0 0 0 5.2 5.2 7.5 7.5 0 0 0 6 0 7.5 7.5 0 0 0 5.2-5.2Z" /></svg>;
    case "help": return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.8 1.9c-1.1.8-1.6 1.2-1.6 2.4" /><path d="M12 16.8h.01" /></svg>;
    case "bell": return <svg {...common}><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
    case "search": return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "arrow-up": return <svg {...common}><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" /></svg>;
    case "arrow-down": return <svg {...common}><path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" /></svg>;
    case "dots": return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
    case "edit": return <svg {...common}><path d="m14 6 4 4M5 19l3.5-.8L18.8 7.9a1.8 1.8 0 0 0-2.5-2.5L6 15.7 5 19Z" /></svg>;
    case "trash": return <svg {...common}><path d="M4 7h16M10 11v5M14 11v5M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
    case "download": return <svg {...common}><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" /></svg>;
    case "check": return <svg {...common}><path d="m5 12 4.2 4.2L19 6.5" /></svg>;
    case "close": return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case "menu": return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    case "calendar": return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></svg>;
    case "spark": return <svg {...common}><path d="m12 3 1.2 5.8L19 10l-5.8 1.2L12 17l-1.2-5.8L5 10l5.8-1.2L12 3ZM19 16l.5 2.5L22 19l-2.5.5L19 22l-.5-2.5L16 19l2.5-.5L19 16Z" /></svg>;
    case "shield": return <svg {...common}><path d="M12 3 19 6v5c0 4.5-2.8 7.6-7 10-4.2-2.4-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "activity": return <svg {...common}><path d="M3 12h4l2-7 4 14 2-7h6" /></svg>;
  }
}

function Avatar({ initials, color, size = "normal" }: { initials: string; color: string; size?: "normal" | "large" }) {
  return <span class="avatar" style={{ background: color, width: size === "large" ? 42 : undefined, height: size === "large" ? 42 : undefined, borderRadius: size === "large" ? 12 : undefined }}>{initials}</span>;
}

function StyleSheet() {
  return <style data-rillio-studio="true">{styles}</style>;
}

function Button({ children, variant = "primary", icon, onClick, type = "button", className = "" }: { children?: any; variant?: "primary" | "secondary" | "danger"; icon?: IconName; onClick?: () => void; type?: "button" | "submit"; className?: string }) {
  return <button type={type} class={`button button--${variant} ${className}`} onClick={onClick}>{icon && <Icon name={icon} size={14} />}{children}</button>;
}

function Sidebar({ activeTab, onTabChange, collapsed, onToggle, open }: { activeTab: TabId; onTabChange: (tab: TabId) => void; collapsed: boolean; onToggle: () => void; open: boolean }) {
  const items: Array<{ id: TabId; label: string; icon: IconName; count?: number }> = [
    { id: "overview", label: "Overview", icon: "grid" },
    { id: "users", label: "Team members", icon: "users", count: 6 },
    { id: "settings", label: "Settings", icon: "settings" },
  ];
  return <aside class={`sidebar ${collapsed ? "sidebar--collapsed" : ""} ${open ? "sidebar--open" : ""}`}>
    <div class="brand-row"><span class="brand-mark">r</span><span class="brand-name">rillio<span>.</span>studio</span><button class="collapse-button" onClick={onToggle} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}><Icon name="menu" size={14} /></button></div>
    <div class="workspace"><span class="workspace-avatar">ZS</span><div class="workspace-copy"><div class="workspace-label">Workspace</div><div class="workspace-name">Rillio Studio / Production</div></div><Icon name="dots" size={15} /></div>
    <div class="sidebar-section">Workspace</div>
    <nav class="sidebar-nav" aria-label="Main navigation">{items.map(item => <button key={item.id} data-tab={item.id} class={`nav-item ${activeTab === item.id ? "nav-item--active" : ""}`} onClick={() => onTabChange(item.id)} aria-current={activeTab === item.id ? "page" : undefined}><Icon name={item.icon} size={16} /><span class="nav-item__label">{item.label}</span>{item.count !== undefined && <span class="nav-item__count">{item.count}</span>}</button>)}</nav>
    <div class="sidebar-section">Resources</div>
    <nav class="sidebar-nav"><button class="nav-item" onClick={() => window.open("/docs.html", "_blank")}><Icon name="help" size={16} /><span class="nav-item__label">Documentation</span></button><button class="nav-item" onClick={() => window.open("https://github.com/vyquocvu/rillio/blob/main/CHANGELOG.md", "_blank")}><Icon name="activity" size={16} /><span class="nav-item__label">Changelog</span></button></nav>
    <div class="sidebar-spacer" /><div class="upgrade-card"><div class="upgrade-card__eyebrow">Rillio Pro</div><p>Unlock advanced analytics and unlimited seats.</p><button onClick={() => alert("Upgrade flow coming soon")}>Explore Pro</button></div>
    <div class="sidebar-user"><Avatar initials="VK" color="#334155" /><div class="sidebar-user__copy"><div class="sidebar-user__name">Vy Quoc Vu</div><div class="sidebar-user__email">vy@rillio.studio</div></div><Icon name="dots" size={15} /></div>
  </aside>;
}

function Topbar({ title, onMenu, onNotify }: { title: string; onMenu: () => void; onNotify: (message: string) => void }) {
  return <header class="topbar"><div class="topbar__left"><button class="mobile-menu" onClick={onMenu} aria-label="Open navigation"><Icon name="menu" size={16} /></button><span class="topbar__title">Workspace / {title}</span></div><div class="topbar__actions"><label class="topbar-search"><Icon name="search" size={14} /><input aria-label="Search workspace" placeholder="Search workspace" onInput={(event: Event) => { if ((event.currentTarget as HTMLInputElement).value === "/") onNotify("Command palette is ready"); }} /><span>⌘ K</span></label><button class="button button--icon" onClick={() => onNotify("You're all caught up")} aria-label="Notifications"><Icon name="bell" size={15} /></button><button class="button button--icon" onClick={() => onNotify("Help center is coming soon")} aria-label="Help"><Icon name="help" size={15} /></button><div class="topbar__account"><div class="topbar__account-copy"><div class="topbar__account-name">Vy Quoc Vu</div><div class="topbar__account-role">Owner</div></div><Avatar initials="VK" color="#334155" /></div></div></header>;
}

function MetricCard({ label, value, delta, icon, featured = false }: { label: string; value: string; delta: string; icon: IconName; featured?: boolean }) {
  return <article class={`metric-card ${featured ? "metric-card--featured" : ""}`}><div class="metric-card__top"><span class="metric-card__label">{label}</span><span class="metric-card__icon"><Icon name={icon} size={15} /></span></div><div class="metric-card__value">{value}</div><div class="metric-card__meta"><span class="trend"><Icon name="arrow-up" size={11} />{delta}</span><span>vs. previous period</span></div></article>;
}

function RevenueChart({ period, onPeriodChange }: { period: Period; onPeriodChange: (period: Period) => void }) {
  const data = periodData[period].chart;
  const max = Math.max(...data) + 12;
  const points = data.map((value, index) => `${(index / (data.length - 1)) * 620},${205 - (value / max) * 174}`).join(" ");
  const area = `M 0 205 L ${points.replaceAll(" ", " L ")} L 620 205 Z`;
  return <section class="panel"><div class="panel__header"><div><h2 class="panel__title">Revenue overview</h2><p class="panel__subtitle">Track your income performance over time</p></div><select class="period-select" value={period} onChange={(event: Event) => onPeriodChange((event.currentTarget as HTMLSelectElement).value as Period)} aria-label="Revenue period"><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select></div><div class="chart-wrap"><div class="chart-key"><span class="chart-key__item"><span class="chart-key__dot" />Revenue</span><span class="chart-key__item"><span class="chart-key__dot chart-key__dot--muted" />Previous period</span></div><svg class="chart" viewBox="0 0 620 220" preserveAspectRatio="none" role="img" aria-label={`Revenue chart for ${periodData[period].label}`}><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".22" /><stop offset="1" stop-color="#8b5cf6" stop-opacity="0" /></linearGradient></defs><line class="chart-grid-line" x1="0" y1="30" x2="620" y2="30" /><line class="chart-grid-line" x1="0" y1="88" x2="620" y2="88" /><line class="chart-grid-line" x1="0" y1="146" x2="620" y2="146" /><line class="chart-grid-line" x1="0" y1="205" x2="620" y2="205" /><path class="chart-area" d={area} /><polyline class="chart-line" points={points} />{data.map((value, index) => <circle key={index} class="chart-point" cx={(index / (data.length - 1)) * 620} cy={205 - (value / max) * 174} r="3.5" />)}</svg><div class="chart-labels"><span>Oct 01</span><span>Oct 03</span><span>Oct 05</span><span>Oct 07</span><span>Oct 09</span><span>Oct 11</span></div></div><div class="breakdown"><div class="breakdown__row"><div style={{ flex: 1 }}>Direct sales<div class="progress"><div class="progress__bar" style={{ width: "76%" }} /></div></div><span class="breakdown__value">76%</span></div><div class="breakdown__row"><div style={{ flex: 1 }}>Organic search<div class="progress"><div class="progress__bar progress__bar--blue" style={{ width: "58%" }} /></div></div><span class="breakdown__value">58%</span></div><div class="breakdown__row"><div style={{ flex: 1 }}>Referrals<div class="progress"><div class="progress__bar progress__bar--orange" style={{ width: "41%" }} /></div></div><span class="breakdown__value">41%</span></div></div></section>;
}

function ActivityPanel({ onNotify }: { onNotify: (message: string) => void }) {
  const activities: Array<{ icon: IconName; tone: string; copy: any; time: string }> = [
    { icon: "users", tone: "", copy: <><strong>Olivia Rhye</strong> invited a new teammate</>, time: "12 minutes ago" },
    { icon: "check", tone: "green", copy: <><strong>Monthly report</strong> was exported successfully</>, time: "42 minutes ago" },
    { icon: "shield", tone: "blue", copy: <><strong>Security settings</strong> were updated</>, time: "2 hours ago" },
    { icon: "spark", tone: "", copy: <><strong>New feature</strong> is ready to try</>, time: "Yesterday at 4:20 PM" },
  ];
  return <section class="panel"><div class="panel__header"><div><h2 class="panel__title">Recent activity</h2><p class="panel__subtitle">The latest events in your workspace</p></div><button class="row-action" onClick={() => onNotify("Activity history opened")} aria-label="Open activity history"><Icon name="dots" size={16} /></button></div><div class="activity-list">{activities.map((item, index) => <div class="activity-item" key={index}><span class={`activity-icon ${item.tone ? `activity-icon--${item.tone}` : ""}`}><Icon name={item.icon} size={14} /></span><div class="activity-copy"><p>{item.copy}</p><div class="activity-time">{item.time}</div></div></div>)}</div></section>;
}

function UsagePanel() {
  const bars = [42, 57, 48, 72, 63, 83, 74, 91, 78, 98, 87, 105];
  return <section class="panel usage-card"><div class="panel__header" style={{ padding: 0 }}><div><h2 class="panel__title">Workspace activity</h2><p class="panel__subtitle">Weekly engagement score</p></div><Icon name="activity" size={17} /></div><div class="usage-summary"><div class="usage-summary__value">82<small>/100</small></div><div class="usage-summary__label">+12.5% this week</div></div><div class="usage-bars">{bars.map((height, index) => <span key={index} class={`usage-bar ${index === bars.length - 1 ? "usage-bar--current" : ""}`} style={{ height: `${height}%` }} />)}</div><div class="usage-labels"><span>Mon</span><span>Sun</span></div></section>;
}

function Overview({ users, period, onPeriodChange, onAddUser, onNotify }: { users: User[]; period: Period; onPeriodChange: (period: Period) => void; onAddUser: () => void; onNotify: (message: string) => void }) {
  const data = periodData[period];
  return <><div class="page-heading"><div><div class="eyebrow">Monday, October 12, 2026</div><h1>Good morning, Vy <span aria-label="waving hand">👋</span></h1><p>Here’s what’s happening across your workspace today.</p></div><div class="heading-actions"><Button variant="secondary" icon="download" onClick={() => onNotify("Your report is being prepared")}>Export report</Button><Button icon="plus" onClick={onAddUser}>Add member</Button></div></div><div class="metric-grid"><MetricCard label="Total revenue" value={data.revenue} delta={data.delta} icon="chart" featured /><MetricCard label="Active members" value={String(users.filter(user => user.status === "Active").length + 182)} delta="8.2%" icon="users" /><MetricCard label="Total orders" value={data.orders} delta="12.5%" icon="activity" /><MetricCard label="Avg. order value" value={data.average} delta="4.7%" icon="spark" /></div><div class="content-grid"><RevenueChart period={period} onPeriodChange={onPeriodChange} /><ActivityPanel onNotify={onNotify} /><UsagePanel /></div><section class="panel table-panel"><div class="table-toolbar"><div class="table-toolbar__title">Team members <span class="table-toolbar__count">{users.length}</span></div><div class="table-actions"><button class="button button--secondary" onClick={() => onNotify("Showing all team members")}><Icon name="users" size={13} />View all</button></div></div><UserTable users={users.slice(0, 4)} compact onEdit={() => onNotify("Open Team members to edit a profile")} onDelete={() => onNotify("Open Team members to manage access")} /></section></>;
}

function UserTable({ users, compact = false, onEdit, onDelete }: { users: User[]; compact?: boolean; onEdit: (user: User) => void; onDelete: (user: User) => void }) {
  return <div class="table-scroll"><table class="data-table"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Last active</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>{users.length ? users.map(user => <tr key={user.id}><td><div class="person"><Avatar initials={user.initials} color={user.color} /><div><div class="person__name">{user.name}</div><div class="person__email">{user.email}</div></div></div></td><td><span class="role">{user.role}</span></td><td><span class={`pill pill--${user.status.toLowerCase()}`}>{user.status}</span></td><td>{user.lastActive}</td><td><div class="row-actions"><button class="row-action" onClick={() => onEdit(user)} aria-label={`Edit ${user.name}`}><Icon name="edit" size={13} /></button>{!compact && <button class="row-action row-action--delete" onClick={() => onDelete(user)} aria-label={`Remove ${user.name}`}><Icon name="trash" size={13} /></button>}</div></td></tr>) : <tr><td class="empty-row" colSpan={5}>No team members match your filters.</td></tr>}</tbody></table></div>;
}

function UsersView({ users, onEdit, onDelete, onAddUser }: { users: User[]; onEdit: (user: User) => void; onDelete: (user: User) => void; onAddUser: () => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | UserStatus>("all");
  const filtered = useMemo(() => users.filter(user => { const query = search.trim().toLowerCase(); return (!query || `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query)) && (status === "all" || user.status === status); }), [users, search, status]);
  return <><div class="page-heading"><div><div class="eyebrow">Workspace directory</div><h1>Team members</h1><p>Manage roles, access and collaborators in one place.</p></div><div class="heading-actions"><Button variant="secondary" icon="download">Export CSV</Button><Button icon="plus" onClick={onAddUser}>Add member</Button></div></div><section class="panel table-panel" style={{ marginTop: 0 }}><div class="table-toolbar"><div class="table-toolbar__title">All members <span class="table-toolbar__count">{filtered.length}</span></div><div class="table-actions"><label class="table-search"><Icon name="search" size={13} /><input placeholder="Search members" value={search} onInput={(event: Event) => setSearch((event.currentTarget as HTMLInputElement).value)} aria-label="Search members" /></label><select class="filter-select" value={status} onChange={(event: Event) => setStatus((event.currentTarget as HTMLSelectElement).value as "all" | UserStatus)} aria-label="Filter by status"><option value="all">All status</option><option value="Active">Active</option><option value="Invited">Invited</option><option value="Suspended">Suspended</option></select></div></div><UserTable users={filtered} onEdit={onEdit} onDelete={onDelete} /></section></>;
}

function UserModal({ user, open, onClose, onSave }: { user?: User; open: boolean; onClose: () => void; onSave: (draft: UserDraft) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("Viewer");
  const [status, setStatus] = useState<UserStatus>("Active");
  const [error, setError] = useState("");
  useEffect(() => { setName(user?.name ?? ""); setEmail(user?.email ?? ""); setRole(user?.role ?? "Viewer"); setStatus(user?.status ?? "Active"); setError(""); }, [user, open]);
  if (!open) return null;
  const submit = (event: Event) => { event.preventDefault(); if (!name.trim() || !email.trim()) { setError("Add a name and email to continue."); return; } onSave({ name: name.trim(), email: email.trim(), role, status }); };
  return <div class="modal-backdrop" role="presentation"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="member-modal-title"><div class="modal__header"><div><div class="modal__eyebrow">{user ? "Edit profile" : "New teammate"}</div><h2 id="member-modal-title">{user ? "Update member" : "Add a team member"}</h2><p>{user ? "Change this member’s role or access status." : "Invite someone to your Rillio Studio workspace."}</p></div><button class="close-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" size={15} /></button></div><form class="modal__body" onSubmit={submit}><div class="form-grid"><div class="form-field form-field--full"><label for="member-name">Full name</label><input id="member-name" value={name} onInput={(event: Event) => setName((event.currentTarget as HTMLInputElement).value)} placeholder="e.g. Ada Lovelace" /></div><div class="form-field form-field--full"><label for="member-email">Work email</label><input id="member-email" type="email" value={email} onInput={(event: Event) => setEmail((event.currentTarget as HTMLInputElement).value)} placeholder="name@company.com" /></div><div class="form-field"><label for="member-role">Role</label><select id="member-role" value={role} onChange={(event: Event) => setRole((event.currentTarget as HTMLSelectElement).value as UserRole)}><option>Admin</option><option>Editor</option><option>Viewer</option></select></div><div class="form-field"><label for="member-status">Status</label><select id="member-status" value={status} onChange={(event: Event) => setStatus((event.currentTarget as HTMLSelectElement).value as UserStatus)}><option>Active</option><option>Invited</option><option>Suspended</option></select></div></div>{error && <div class="form-error">{error}</div>}<div class="modal__footer"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" icon="check">{user ? "Save changes" : "Send invite"}</Button></div></form></div></div>;
}

function SettingsView({ preferences, onToggle, onNotify }: { preferences: { email: boolean; product: boolean; security: boolean }; onToggle: (key: "email" | "product" | "security") => void; onNotify: (message: string) => void }) {
  const rows: Array<{ key: "email" | "product" | "security"; title: string; description: string }> = [{ key: "email", title: "Email notifications", description: "Get a daily digest of important workspace activity." }, { key: "product", title: "Product updates", description: "Hear about new Rillio features and early access releases." }, { key: "security", title: "Security alerts", description: "Be notified whenever a sign-in or permission changes." }];
  return <><div class="page-heading"><div><div class="eyebrow">Workspace controls</div><h1>Settings</h1><p>Keep your workspace preferences clear and under control.</p></div><Button icon="check" onClick={() => onNotify("Settings saved successfully")}>Save changes</Button></div><div class="settings-grid"><div><section class="panel settings-card"><div class="settings-card__heading"><h2>Notifications</h2><p>Choose what you want to hear about from your workspace.</p></div>{rows.map(row => <div class="setting-row" key={row.key}><div class="setting-row__copy"><strong>{row.title}</strong><span>{row.description}</span></div><button class={`switch ${preferences[row.key] ? "switch--on" : ""}`} onClick={() => onToggle(row.key)} aria-label={`${preferences[row.key] ? "Disable" : "Enable"} ${row.title}`} aria-pressed={preferences[row.key]} /></div>)}</section><section class="panel settings-card"><div class="settings-card__heading"><h2>Security</h2><p>Protect your account with sensible defaults.</p></div><div class="setting-row"><div class="setting-row__copy"><strong>Two-factor authentication</strong><span>Required for all workspace owners and admins.</span></div><span class="pill pill--active">Enabled</span></div></section></div><UsagePanel /></div></>;
}

function Toast({ message }: { message: string }) {
  return <div class="toast"><span class="toast__icon"><Icon name="check" size={13} /></span>{message}</div>;
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [period, setPeriod] = useState<Period>("7d");
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalUser, setModalUser] = useState<User | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [preferences, setPreferences] = useState({ email: true, product: false, security: true });

  const notify = (message: string) => setToast(message);
  useEffect(() => { document.title = `Rillio Studio — ${activeTab[0].toUpperCase()}${activeTab.slice(1)}`; }, [activeTab]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(timer); }, [toast]);
  const openCreate = () => { setModalUser(undefined); setModalOpen(true); };
  const openEdit = (user: User) => { setModalUser(user); setModalOpen(true); };
  const saveUser = (draft: UserDraft) => { if (modalUser) setUsers(previous => previous.map(user => user.id === modalUser.id ? { ...user, ...draft } : user)); else { const id = Math.max(0, ...users.map(user => user.id)) + 1; const initials = draft.name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase(); setUsers(previous => [...previous, { ...draft, id, initials, color: "#6366f1", lastActive: "Just now" }]); } setModalOpen(false); notify(modalUser ? "Member profile updated" : "Invitation sent successfully"); };
  const deleteUser = (user: User) => { setUsers(previous => previous.filter(item => item.id !== user.id)); notify(`${user.name} was removed from the workspace`); };
  const selectTab = (tab: TabId) => { setActiveTab(tab); setSidebarOpen(false); };
  const title = activeTab === "overview" ? "Overview" : activeTab === "users" ? "Team members" : "Settings";
  return <><StyleSheet /><div class="app-shell"><Sidebar activeTab={activeTab} onTabChange={selectTab} collapsed={collapsed} onToggle={() => setCollapsed(previous => !previous)} open={sidebarOpen} /><div class="main-shell"><Topbar title={title} onMenu={() => setSidebarOpen(true)} onNotify={notify} /><main class="content">{activeTab === "overview" && <Overview users={users} period={period} onPeriodChange={setPeriod} onAddUser={openCreate} onNotify={notify} />}{activeTab === "users" && <UsersView users={users} onEdit={openEdit} onDelete={deleteUser} onAddUser={openCreate} />}{activeTab === "settings" && <SettingsView preferences={preferences} onToggle={key => setPreferences(previous => ({ ...previous, [key]: !previous[key] }))} onNotify={notify} />}</main></div></div>{modalOpen && <UserModal user={modalUser} open={modalOpen} onClose={() => setModalOpen(false)} onSave={saveUser} />}{toast && <Toast message={toast} />}</>;
}

const root = createRoot(document.getElementById("app")!);
root.render(<Dashboard />);

if (new URLSearchParams(window.location.search).has("e2e")) {
  const errors: string[] = [];
  window.addEventListener("error", event => errors.push(event.message));
  window.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const runStudioSmoke = async () => {
    await nextFrame();
    assert(document.querySelector(".metric-card"), "overview metrics did not mount");
    assert(document.querySelector(".chart"), "overview chart did not mount");
    const usersTab = document.querySelector<HTMLButtonElement>('[data-tab="users"]');
    assert(usersTab, "team navigation did not mount");
    usersTab.click();
    await nextFrame();
    assert(document.querySelector("h1")?.textContent === "Team members", "team view did not render");
    const addButton = document.querySelector<HTMLButtonElement>(".page-heading .button--primary");
    assert(addButton, "add member action did not mount");
    addButton.click();
    await nextFrame();
    const name = document.querySelector<HTMLInputElement>("#member-name");
    const email = document.querySelector<HTMLInputElement>("#member-email");
    assert(name && email, "member dialog did not open");
    name.value = "Ada Lovelace";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    email.value = "ada@rillio.studio";
    email.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector<HTMLButtonElement>(".modal__footer .button--primary")?.click();
    await nextFrame();
    assert(document.body.textContent?.includes("Ada Lovelace"), "member form did not add a row");
    assert(!document.querySelector('[role="dialog"]:not([hidden])'), "member dialog did not close");
    assert(errors.length === 0, `dashboard runtime errors: ${errors.join(" | ")}`);
    document.body.dataset.e2eStatus = "pass";
    document.body.dataset.e2eChecks = "metrics,chart,navigation,form,table,errors";
  };
  runStudioSmoke().catch(error => {
    document.body.dataset.e2eStatus = "fail";
    document.body.dataset.e2eError = error instanceof Error ? error.message : String(error);
  });
}

installSourceViewer("admin-dashboard.tsx", () => import("./admin-dashboard.tsx?raw").then(module => module.default));
