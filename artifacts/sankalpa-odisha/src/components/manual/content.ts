// ─── Manual content data — single source for copy used across sections ───────
import type { WorkflowStatus, UserRole } from '@/data/mockData';

/** One card in the "Page tour" section: a real screenshot + scannable bullets. */
export interface PageTourEntry {
  shot: string;
  title: string;
  icon: string;
  bullets: string[];
}

export const PAGE_TOUR: PageTourEntry[] = [
  {
    shot: 'dashboard.png',
    title: 'Dashboard',
    icon: 'bi-speedometer2',
    bullets: [
      'KPI cards summarise total, in-progress, pending and completed announcements.',
      'A status donut shows the live mix across the workflow.',
      'A department-progress table tracks delivery per department.',
      'The landing page for every role except Admin.',
    ],
  },
  {
    shot: 'announcements.png',
    title: 'Announcements list',
    icon: 'bi-card-list',
    bullets: [
      'Searchable, filterable table of every announcement you can see.',
      'Status badges use the same colours as the rest of the app.',
      'Filter by department, status, category and date range.',
      'Click any row to open its detail page.',
    ],
  },
  {
    shot: 'announcement-detail.png',
    title: 'Announcement detail',
    icon: 'bi-file-earmark-text',
    bullets: [
      'Full record: metadata, current status and the action buttons for your role.',
      'Sub-components are listed with their owner and status.',
      'A timeline records every state change and comment.',
      'Revert reasons appear inline so the next owner knows what to fix.',
    ],
  },
  {
    shot: 'my-actions.png',
    title: 'My Actions',
    icon: 'bi-check2-square',
    bullets: [
      'A focused queue of items waiting on you right now.',
      'Skips the noise of the full list — only what needs your decision.',
      'Jump straight to the detail page to act.',
    ],
  },
  {
    shot: 'uoi-notes.png',
    title: 'UOI Notes',
    icon: 'bi-sticky',
    bullets: [
      'Record Under-Order-of-Implementation notes against announcements.',
      'Keeps supporting context alongside the workflow.',
      'Notes can be removed with confirmation.',
    ],
  },
  {
    shot: 'report-aging.png',
    title: 'Reports',
    icon: 'bi-graph-up',
    bullets: [
      'Sankalpa Patra Ageing Analysis and department-wise performance reports.',
      'Ageing highlights announcements sitting too long in a status.',
      'Available to Admin, Chief Minister, CMO Nodal and CMO Reviewer.',
    ],
  },
  {
    shot: 'user-management.png',
    title: 'User management',
    icon: 'bi-people',
    bullets: [
      'Create, edit, deactivate and assign roles to users.',
      'Admin manages everyone; a Dept Nodal manages only their own dept staff.',
      'The landing page for Admins after sign-in.',
    ],
  },
  {
    shot: 'masters-departments.png',
    title: 'Master data',
    icon: 'bi-database-gear',
    bullets: [
      'Manage departments, districts, categories and tags.',
      'Admin-only. Referenced departments cannot be deleted.',
      'Keeps dropdowns across the app consistent.',
    ],
  },
  {
    shot: 'activity-log.png',
    title: 'Activity log',
    icon: 'bi-clock-history',
    bullets: [
      'A chronological audit of every state-changing action.',
      'Useful for accountability and onboarding.',
      'Each entry ties an action to a user and a time.',
    ],
  },
];

/** A rectangle (percent of the visible media frame) to spotlight on a step. */
export interface WalkHighlight {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A single step in an interactive walkthrough. */
export interface WalkStep {
  shot?: string;
  clip?: string;
  title: string;
  instruction: string;
  /** Spotlights the relevant area of the screenshot for this step. */
  highlight?: WalkHighlight;
}

export interface WalkthroughFlow {
  id: string;
  title: string;
  role: UserRole;
  accentGroup: 'cmo' | 'dept' | 'oversight';
  steps: WalkStep[];
}

export const WALKTHROUGHS: WalkthroughFlow[] = [
  {
    id: 'wt-create',
    title: 'Sign in & create an announcement',
    role: 'cmo_nodal',
    accentGroup: 'cmo',
    steps: [
      {
        clip: 'login.mp4',
        title: 'Sign in',
        instruction:
          'Every user signs in with a username and password. Admin lands on the Users page; all other roles land on the Dashboard.',
      },
      {
        clip: 'tour-create.mp4',
        title: 'Open the create form',
        instruction:
          'As CMO Nodal, choose New Announcement and fill in title, department, occasion, location and dates.',
      },
      {
        shot: 'add-announcement.png',
        title: 'Let the form help you',
        instruction:
          'Selecting a constituency auto-fills District and Block; duplicate detection warns you before saving.',
        highlight: { x: 3, y: 14, w: 62, h: 32 },
      },
      {
        shot: 'announcements.png',
        title: 'Submit for review',
        instruction:
          'Save, then submit. The item becomes Pending CMO Review and is auto-assigned to a reviewer round-robin.',
        highlight: { x: 1, y: 12, w: 98, h: 16 },
      },
    ],
  },
  {
    id: 'wt-approve',
    title: 'CMO review: approve & publish',
    role: 'cmo_reviewer',
    accentGroup: 'cmo',
    steps: [
      {
        clip: 'flow-approve.mp4',
        title: 'Open the pending item',
        instruction:
          'As the assigned CMO Reviewer, open an announcement in Pending CMO Review to see its full detail and action bar.',
      },
      {
        shot: 'announcement-detail.png',
        title: 'Approve or revert',
        instruction:
          'Approve to publish it to the target department, or Revert with a required reason back to the creator.',
        highlight: { x: 50, y: 4, w: 48, h: 18 },
      },
    ],
  },
  {
    id: 'wt-accept',
    title: 'Department accepts',
    role: 'dept_nodal',
    accentGroup: 'dept',
    steps: [
      {
        clip: 'flow-accept.mp4',
        title: 'Open the published announcement',
        instruction:
          'As Dept Nodal, open the published announcement targeted at your department.',
      },
      {
        shot: 'dept-announcement-detail.png',
        title: 'Accept on behalf of the department',
        instruction:
          'Click Accept — you become the recorded accepting nodal. A Dept Reviewer then grants final acceptance, moving it to In Progress.',
        highlight: { x: 50, y: 4, w: 48, h: 18 },
      },
    ],
  },
  {
    id: 'wt-execute',
    title: 'Add & execute sub-components',
    role: 'dept_nodal',
    accentGroup: 'dept',
    steps: [
      {
        clip: 'flow-execute.mp4',
        title: 'Break the work into sub-components',
        instruction:
          'After final acceptance, the accepting Dept Nodal adds sub-components and tags one owner (a Dept Nodal or Dept User) to each.',
      },
      {
        shot: 'announcement-detail.png',
        title: 'Track status & timeline',
        instruction:
          'Only the tagged owner can move a sub-component Pending → In Progress → Completed. Every change is recorded in the timeline.',
        highlight: { x: 1, y: 6, w: 52, h: 18 },
      },
    ],
  },
  {
    id: 'wt-closure',
    title: 'Request & approve closure',
    role: 'dept_nodal',
    accentGroup: 'dept',
    steps: [
      {
        clip: 'flow-closure.mp4',
        title: 'Request closure',
        instruction:
          'Once every sub-component is Completed, the accepting Dept Nodal requests closure.',
      },
      {
        shot: 'announcement-detail.png',
        title: 'Department review',
        instruction:
          'The Dept Reviewer approves (forwarding to the CMO) or reverts with a required reason.',
        highlight: { x: 50, y: 4, w: 48, h: 18 },
      },
      {
        shot: 'announcement-detail.png',
        title: 'CMO sign-off',
        instruction:
          'A CMO Reviewer gives final approval — the announcement becomes Completed.',
        highlight: { x: 50, y: 4, w: 48, h: 18 },
      },
    ],
  },
];

/** Status groupings for the scannable legend. */
export const STATUS_LEGEND: { label: string; statuses: WorkflowStatus[] }[] = [
  {
    label: 'In flight',
    statuses: [
      'draft',
      'pending_cmo_review',
      'published',
      'pending_dept_acceptance',
      'accepted',
      'in_progress',
      'pending_completion_review',
      'pending_cmo_completion_review',
    ],
  },
  { label: 'Done', statuses: ['completed'] },
  {
    label: 'Sent back',
    statuses: ['reverted_by_cmo', 'reverted_by_dept_reviewer'],
  },
  {
    label: 'Exception',
    statuses: ['on_hold', 'dropped', 'pending_cmo_reconsideration'],
  },
];

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin:
    'Manages users, master data (departments, categories, tags) and oversees the whole platform.',
  chief_minister:
    'Read-only executive view of all announcements, departmental performance and recent completions.',
  cmo_nodal:
    'Creates announcements and submits them for CMO review. Can edit own drafts and reverted-by-CMO items.',
  cmo_reviewer:
    'Approves or reverts announcements. Final closure approver. Auto-assigned round-robin.',
  ocac_viewer:
    'Read-only oversight view, equivalent to the Chief Minister — sees all announcements and performance, takes no actions.',
  dept_head:
    'Read-only departmental view; tracks team performance and announcements by status.',
  dept_nodal:
    'Accepts announcements, adds & tags sub-components, requests closure. Manages dept users.',
  dept_reviewer:
    'Final acceptance of announcements; first-level closure approval / revert.',
  dept_user: 'Department staff member tagged on sub-components for execution.',
  dept_viewer:
    'Read-only departmental viewer; sees the department\'s announcements and progress without acting.',
};

export const STATUS_DETAILS: Record<
  WorkflowStatus,
  { description: string; nextOwner: string }
> = {
  draft: {
    description:
      'Saved by the creator but not yet submitted. Visible only to the CMO Nodal who created it.',
    nextOwner: 'CMO Nodal (creator) — submits for review',
  },
  pending_cmo_review: {
    description:
      'Submitted to the CMO. Auto-assigned to a CMO Reviewer using round-robin.',
    nextOwner: 'Assigned CMO Reviewer — approve or revert',
  },
  reverted_by_cmo: {
    description:
      'CMO Reviewer sent it back with a reason. Only the original creator can edit and resubmit.',
    nextOwner: 'CMO Nodal (creator) — edit and resubmit',
  },
  pending_cmo_reconsideration: {
    description:
      'Department Nodal sent the published announcement back to CMO with remarks, requesting reconsideration before department acceptance.',
    nextOwner: 'CMO Nodal (creator) or assigned CMO Reviewer — edit and re-publish',
  },
  published: {
    description:
      'Approved by CMO and published to the target department for action.',
    nextOwner: 'Dept Nodal — accept on behalf of department',
  },
  pending_dept_acceptance: {
    description:
      'Awaiting acceptance by the target department. Sub-components cannot be added yet — that opens only after the Department Reviewer grants final acceptance.',
    nextOwner: 'Dept Reviewer — grant final acceptance',
  },
  accepted: {
    description:
      'Department Reviewer has granted final acceptance and the accepting Dept Nodal is recorded. Sub-components may now be added and execution can begin.',
    nextOwner: 'Accepting Dept Nodal — add sub-components and start progress',
  },
  in_progress: {
    description:
      'Final-accepted by Dept Reviewer. Sub-components are being executed by their tagged owners.',
    nextOwner:
      'Tagged owners — complete sub-components; accepting Dept Nodal — request closure',
  },
  pending_completion_review: {
    description:
      'Accepting Dept Nodal has requested closure (all sub-components Completed). Awaiting Dept Reviewer.',
    nextOwner: 'Dept Reviewer — approve or revert closure',
  },
  reverted_by_dept_reviewer: {
    description:
      'Dept Reviewer rejected the closure with a reason. Returns to the accepting Dept Nodal only.',
    nextOwner: 'Accepting Dept Nodal — address feedback and resubmit',
  },
  pending_cmo_completion_review: {
    description:
      'Closure approved by Dept Reviewer and forwarded to the CMO for final sign-off.',
    nextOwner: 'CMO Reviewer — final approve or revert',
  },
  completed: {
    description:
      'CMO Reviewer has approved the closure. The announcement is fully delivered and closed.',
    nextOwner: '— (no further action)',
  },
  dropped: {
    description:
      'Marked as Dropped by Admin or CMO Nodal with mandatory remarks. The announcement will not proceed further.',
    nextOwner: '— (no further action)',
  },
  on_hold: {
    description:
      'Placed On Hold by Admin or CMO Nodal with mandatory remarks. Requires deliberate intervention to resume.',
    nextOwner: 'Admin or CMO Nodal — to resume or drop',
  },
};

/** Linear "happy path" order used by the lifecycle visual + status table. */
export const STATUS_ORDER: WorkflowStatus[] = [
  'draft',
  'pending_cmo_review',
  'reverted_by_cmo',
  'published',
  'pending_dept_acceptance',
  'accepted',
  'in_progress',
  'pending_completion_review',
  'reverted_by_dept_reviewer',
  'pending_cmo_completion_review',
  'completed',
];

export const NOTIFICATION_MATRIX: { event: string; recipients: string }[] = [
  { event: 'Announcement created & submitted by CMO Nodal', recipients: 'Assigned CMO Reviewer (round-robin)' },
  { event: 'CMO Reviewer approves announcement', recipients: 'CMO Nodal (creator), Dept Head, Dept Nodal, Dept Reviewer of target dept' },
  { event: 'CMO Reviewer reverts announcement', recipients: "CMO Nodal (creator) — with reviewer's reason" },
  { event: 'Dept Nodal accepts announcement', recipients: 'Dept Reviewer (for final acceptance)' },
  { event: 'Dept Reviewer grants final acceptance', recipients: 'Accepting Dept Nodal' },
  { event: 'Sub-component added & tagged', recipients: 'Tagged owner (Dept Nodal or Dept User)' },
  { event: 'Final sub-component marked Completed', recipients: 'Accepting Dept Nodal — ready to request closure' },
  { event: 'Dept Nodal requests closure', recipients: 'Dept Reviewer of the department' },
  { event: 'Dept Reviewer approves closure', recipients: 'CMO Reviewers (all)' },
  { event: 'Dept Reviewer reverts closure', recipients: 'Accepting Dept Nodal — with reason' },
  { event: 'CMO Reviewer approves closure (Completed)', recipients: 'CMO Nodal, all CMO Reviewers, Dept Head/Nodal/Reviewer of dept' },
  { event: 'CMO Reviewer reverts closure', recipients: 'Accepting Dept Nodal — with reason' },
];

export const RULES: { group: string; icon: string; items: string[] }[] = [
  {
    group: 'Authentication & Access',
    icon: 'bi-shield-check',
    items: [
      'All users sign in with username + password. Admin lands on the Users page; all other roles land on the Dashboard.',
      'Permissions are enforced by role; menu items and action buttons hide automatically when not permitted.',
      'Drafts are visible only to their creator. Other users do not see in-progress drafts in any list.',
      'Every workflow action — Approve, Revert, Accept, Final Accept, Start, Request/Approve/Revert Completion, Drop, Hold, Delete, sub-component Start/Complete/Reassign, user delete or deactivate, and UOI note delete — requires explicit confirmation before it runs.',
    ],
  },
  {
    group: 'Master Data (Admin only)',
    icon: 'bi-database-gear',
    items: [
      'Only Admin can create, edit, or delete departments, announcement categories, and tags.',
      'Departments referenced by existing announcements cannot be deleted.',
    ],
  },
  {
    group: 'Announcement Creation',
    icon: 'bi-pencil-square',
    items: [
      'Only a CMO Nodal Officer can create a new announcement.',
      'Each announcement belongs to exactly one department (single-department model).',
      'Announcement IDs follow the format CM<HouseLetter>-<ConstituencyNo>A<Sequence>, e.g. CMA-001A0023.',
      'Duplicate detection compares title + date + department; the system warns the creator before saving.',
      'Selecting a constituency auto-fills District and Block; these stay editable.',
    ],
  },
  {
    group: 'CMO Review',
    icon: 'bi-check2-circle',
    items: [
      'On submit, the announcement is auto-assigned to a CMO Reviewer using round-robin.',
      'CMO Reviewer can Approve (publishes to the department) or Revert (back to creator).',
      'Every revert requires a non-empty comment that is sent to the recipient as the reason.',
      'A reverted-by-CMO announcement may be edited and resubmitted only by its original creator.',
      'A pending-CMO-review announcement can be recalled for editing by its creator (or Admin) before the CMO Reviewer acts — it resets to draft and notifies the reviewer.',
      'The creator (or Admin) may permanently delete an announcement while it is in draft, pending CMO review, reverted-by-CMO, or pending-CMO-reconsideration status. This is irreversible.',
    ],
  },
  {
    group: 'Department Acceptance',
    icon: 'bi-clipboard-check',
    items: [
      'After publication the announcement is in pending_dept_acceptance.',
      'Step 1: A Dept Nodal Officer clicks Accept. The system records acceptedByDeptNodalId = that user.',
      'Step 2: A Dept Reviewer grants final acceptance, moving the status to in_progress.',
      'Only the Dept Nodal who accepted is treated as the "owner" for closure and edit-after-revert.',
    ],
  },
  {
    group: 'Sub-components & Execution',
    icon: 'bi-diagram-3',
    items: [
      'Sub-components can be added only after final acceptance — i.e. status accepted, in_progress, or reverted_by_dept_reviewer. Never while published or pending_dept_acceptance.',
      'Added by the accepting Dept Nodal and tagged to one owner (a Dept Nodal or Dept User).',
      'Only the tagged owner (or Admin) may move a sub-component through Pending → In Progress → Completed.',
      'Sub-components may be retagged only by the originating CMO Nodal, and only while the announcement is pending_dept_acceptance.',
      'The tagged assignee (or Admin) may post Interim Updates while the parent is post-final-acceptance and the sub-component is not yet Completed; each mirrors into the timeline and notifies the accepting Dept Nodal.',
    ],
  },
  {
    group: 'Closure Workflow (Strictly Gated)',
    icon: 'bi-lock',
    items: [
      'Only the accepting Dept Nodal (acceptedByDeptNodalId) may request closure. Admin override is allowed.',
      'Closure cannot be requested until every sub-component is Completed. The button is disabled with a reason banner.',
      'If an announcement has no sub-components, the accepting Dept Nodal can request closure immediately.',
      'Dept Reviewer reviews: Approve forwards to CMO Reviewer; Revert returns to the accepting Dept Nodal with a required reason.',
      'CMO Reviewer is the final approver: Approve marks the announcement Completed; Revert returns to the accepting Dept Nodal with a reason.',
      'A reverted-completion announcement may be edited and resubmitted only by the accepting Dept Nodal (or Admin).',
    ],
  },
  {
    group: 'Notifications',
    icon: 'bi-bell',
    items: [
      'Every state change fires targeted notifications (see the matrix).',
      "Revert notifications always include the reviewer's reason text.",
      'Completion-revert notifications go to the accepting Dept Nodal specifically — not every Dept Nodal in the department.',
    ],
  },
  {
    group: 'Users & Activity',
    icon: 'bi-people',
    items: [
      'Admin can manage all users. A Dept Nodal can manage only Dept Reviewer & Dept User accounts within their own department.',
      'Every state-changing action writes to the announcement timeline and to the per-user Activity Log.',
      'Reports (Sankalpa Patra Ageing Analysis, Pending Actions, etc.) are visible to Admin, Chief Minister, CMO Nodal, and CMO Reviewer.',
    ],
  },
];
