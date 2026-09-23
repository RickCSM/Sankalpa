// ─── Sankalpa Odisha — Visual User Manual: design system tokens ──────────────
// Single source of truth for the manual's visual language: role colors,
// status colors, palette, typography and media paths. Every manual section
// imports from here so the guide stays consistent end to end.

import type { UserRole, WorkflowStatus } from '@/data/mockData';

export const FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

/** Core palette. */
export const PALETTE = {
  ink: '#0f2747',
  inkSoft: '#1a3a5c',
  text: '#374151',
  textMuted: '#6b7280',
  line: '#e5e7eb',
  lineSoft: '#f1f5f9',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  shellBg: '#eef2f7',
  revert: '#c0392b',
  warn: '#b45309',
  warnBg: '#fff7ed',
  warnLine: '#f59e0b',
  ok: '#16a34a',
  okBg: '#dcfce7',
};

/** A reusable group token: each manual "lane" (Oversight / CMO / Department). */
export interface GroupToken {
  id: 'oversight' | 'cmo' | 'dept';
  label: string;
  color: string;
  light: string;
}

export const GROUPS: Record<GroupToken['id'], GroupToken> = {
  oversight: { id: 'oversight', label: 'Oversight', color: '#7b3eb1', light: '#ece1f7' },
  cmo: { id: 'cmo', label: "Chief Minister's Office", color: '#2c5282', light: '#dbe7f5' },
  dept: { id: 'dept', label: 'Department', color: '#1f8b4c', light: '#d6efe0' },
};

/** Per-role visual token. */
export interface RoleToken {
  role: UserRole;
  name: string;
  group: GroupToken['id'];
  color: string;
  light: string;
  icon: string; // bootstrap-icons class suffix
  tagline: string;
}

export const ROLE_TOKENS: RoleToken[] = [
  { role: 'admin', name: 'Admin', group: 'oversight', color: '#b45309', light: '#fde9c8', icon: 'bi-shield-lock', tagline: 'Runs the platform & master data' },
  { role: 'chief_minister', name: 'Chief Minister', group: 'oversight', color: '#7b3eb1', light: '#ece1f7', icon: 'bi-star', tagline: 'Executive read-only overview' },
  { role: 'cmo_nodal', name: 'CMO Nodal', group: 'cmo', color: '#2c5282', light: '#dbe7f5', icon: 'bi-pencil-square', tagline: 'Creates & submits announcements' },
  { role: 'cmo_reviewer', name: 'CMO Reviewer', group: 'cmo', color: '#1d4ed8', light: '#dde8fb', icon: 'bi-check2-circle', tagline: 'Approves, reverts & final closure' },
  { role: 'ocac_viewer', name: 'OCAC Viewer', group: 'oversight', color: '#9333ea', light: '#f0e2fb', icon: 'bi-eye', tagline: 'Read-only oversight (CM-equivalent)' },
  { role: 'dept_head', name: 'Dept Head', group: 'dept', color: '#0f766e', light: '#cdeeea', icon: 'bi-buildings', tagline: 'Read-only departmental view' },
  { role: 'dept_nodal', name: 'Dept Nodal', group: 'dept', color: '#1f8b4c', light: '#d6efe0', icon: 'bi-clipboard-check', tagline: 'Accepts, executes & requests closure' },
  { role: 'dept_reviewer', name: 'Dept Reviewer', group: 'dept', color: '#15803d', light: '#d8f0df', icon: 'bi-patch-check', tagline: 'Final acceptance & closure review' },
  { role: 'dept_user', name: 'Dept User', group: 'dept', color: '#4d7c0f', light: '#e6f0cf', icon: 'bi-person-workspace', tagline: 'Executes tagged sub-components' },
  { role: 'dept_viewer', name: 'Dept Viewer', group: 'dept', color: '#65a30d', light: '#eaf4d4', icon: 'bi-eye', tagline: 'Read-only departmental viewer' },
];

export const ROLE_BY_ID: Record<UserRole, RoleToken> = ROLE_TOKENS.reduce(
  (acc, r) => {
    acc[r.role] = r;
    return acc;
  },
  {} as Record<UserRole, RoleToken>
);

/** Status accent colors, keyed to the app's own badge palette. */
export const STATUS_ACCENT: Record<WorkflowStatus, { color: string; bg: string }> = {
  draft: { color: '#475569', bg: '#e2e8f0' },
  pending_cmo_review: { color: '#5b52c4', bg: 'rgba(175,169,238,0.18)' },
  reverted_by_cmo: { color: '#c0392b', bg: 'rgba(245,142,142,0.16)' },
  pending_cmo_reconsideration: { color: '#c0392b', bg: 'rgba(245,142,142,0.16)' },
  published: { color: '#2563eb', bg: 'rgba(59,130,246,0.14)' },
  pending_dept_acceptance: { color: '#5b52c4', bg: 'rgba(175,169,238,0.18)' },
  accepted: { color: '#0f766e', bg: 'rgba(20,184,166,0.14)' },
  in_progress: { color: '#b87d10', bg: 'rgba(253,194,74,0.18)' },
  pending_completion_review: { color: '#5b52c4', bg: 'rgba(175,169,238,0.18)' },
  reverted_by_dept_reviewer: { color: '#c0392b', bg: 'rgba(245,142,142,0.16)' },
  pending_cmo_completion_review: { color: '#5b52c4', bg: 'rgba(175,169,238,0.18)' },
  completed: { color: '#2d8f6f', bg: 'rgba(121,209,173,0.18)' },
  dropped: { color: '#c93c3c', bg: 'rgba(245,142,142,0.16)' },
  on_hold: { color: '#c0392b', bg: 'rgba(245,142,142,0.16)' },
};

/** Base URL for app-served manual media (screenshots + clips). */
export const MEDIA_BASE = `${import.meta.env.BASE_URL}manual/`;
export const shotUrl = (file: string) => `${MEDIA_BASE}shots/${file}`;
export const clipUrl = (file: string) => `${MEDIA_BASE}clips/${file}`;
