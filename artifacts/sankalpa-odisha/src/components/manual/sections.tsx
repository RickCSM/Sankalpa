// ─── Manual sections — content for every nav entry ───────────────────────────
import type { ReactNode } from 'react';
import type { WorkflowStatus } from '@/data/mockData';
import { workflowStatusLabels } from '@/data/mockData';
import { FONT, PALETTE, GROUPS, ROLE_TOKENS, type GroupToken } from './tokens';
import {
  SectionHeader, Card, Callout, StatusChip, RoleBadge, Figure, Clip, StepRow, Grid,
} from './primitives';
import {
  CreationApprovalDiagram, DeptAcceptanceDiagram, SubComponentDiagram, ClosureDiagram,
} from './diagrams';
import {
  ROLE_DESCRIPTIONS, STATUS_DETAILS, STATUS_ORDER, NOTIFICATION_MATRIX, RULES,
  PAGE_TOUR, WALKTHROUGHS, STATUS_LEGEND,
} from './content';
import { AnimatedLifecycle, Walkthrough } from './interactive';
import { shotUrl, clipUrl } from './tokens';

export interface ManualSection {
  id: string;
  label: string;
  icon: string;
  group: string;
  Component: () => ReactNode;
}

// ── Small shared helpers ─────────────────────────────────────────────────────
function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.line}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1, fontFamily: FONT }}>{value}</div>
      <div style={{ fontSize: 12.5, color: PALETTE.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ── 1. Overview ──────────────────────────────────────────────────────────────
function Overview() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Welcome"
        title="Sankalpa Odisha — at a glance"
        lead={
          <>
            Sankalpa Odisha tracks the <strong>Hon'ble Chief Minister's announcements</strong> from
            creation all the way to closure. Ten roles collaborate across the Chief Minister's
            Office and the executing Department. This guide shows every role, the full workflow,
            and the rules the system enforces — with real screens from the app.
          </>
        }
      />
      <Grid min={150} gap={12}>
        <Stat value="10" label="Roles" color={GROUPS.cmo.color} />
        <Stat value="3" label="Groups" color={GROUPS.dept.color} />
        <Stat value="14" label="Workflow statuses" color={GROUPS.oversight.color} />
        <Stat value="12" label="Notified events" color={PALETTE.warn} />
      </Grid>
      <Figure
        src={shotUrl('login.png')}
        alt="Sankalpa Odisha sign-in screen"
        caption="Sign in with your username and password. Admins land on the Users page; everyone else lands on the Dashboard."
      />
      <Grid min={240}>
        <Card accent={GROUPS.cmo.color}>
          <div style={{ fontWeight: 700, color: GROUPS.cmo.color, marginBottom: 4 }}>Create & approve</div>
          <div style={{ fontSize: 13, color: PALETTE.text, lineHeight: 1.55 }}>The CMO drafts an announcement, a reviewer approves it, and it publishes to the department.</div>
        </Card>
        <Card accent={GROUPS.dept.color}>
          <div style={{ fontWeight: 700, color: GROUPS.dept.color, marginBottom: 4 }}>Accept & execute</div>
          <div style={{ fontSize: 13, color: PALETTE.text, lineHeight: 1.55 }}>The department accepts in two steps, breaks the work into sub-components, and executes them.</div>
        </Card>
        <Card accent={PALETTE.ok}>
          <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 4 }}>Close the loop</div>
          <div style={{ fontSize: 13, color: PALETTE.text, lineHeight: 1.55 }}>Closure is requested, reviewed by the department, and finally signed off by the CMO.</div>
        </Card>
      </Grid>
    </div>
  );
}

// ── 2. Roles ─────────────────────────────────────────────────────────────────
function Roles() {
  const groupsOrder: GroupToken['id'][] = ['oversight', 'cmo', 'dept'];
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="People"
        title="The ten roles"
        lead="Roles span three groups: Oversight, the Chief Minister's Office, and the Department. Colour and icon stay consistent for each role throughout this guide."
      />
      {groupsOrder.map((gid) => {
        const g = GROUPS[gid];
        const roles = ROLE_TOKENS.filter((r) => r.group === gid);
        return (
          <div key={gid}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: g.color }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: g.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>{g.label}</span>
            </div>
            <Grid min={260}>
              {roles.map((r) => (
                <div key={r.role} style={{ background: r.light, borderRadius: 12, padding: 14, border: `1px solid ${r.color}22` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 9, background: r.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                      <i className={`bi ${r.icon}`} />
                    </span>
                    <div>
                      <div style={{ fontWeight: 800, color: r.color, fontSize: 14 }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: PALETTE.textMuted }}>{r.tagline}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: PALETTE.text, lineHeight: 1.5 }}>{ROLE_DESCRIPTIONS[r.role]}</div>
                </div>
              ))}
            </Grid>
          </div>
        );
      })}
    </div>
  );
}

// ── 3. Lifecycle ─────────────────────────────────────────────────────────────
function StatusRail() {
  const happy: WorkflowStatus[] = ['draft', 'pending_cmo_review', 'published', 'pending_dept_acceptance', 'accepted', 'in_progress', 'pending_completion_review', 'pending_cmo_completion_review', 'completed'];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      {happy.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusChip status={s} />
          {i < happy.length - 1 && <i className="bi bi-arrow-right" style={{ color: PALETTE.textMuted, fontSize: 13 }} />}
        </div>
      ))}
    </div>
  );
}

function Lifecycle() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="The journey"
        title="Lifecycle of an announcement"
        lead="Every announcement moves through a defined set of statuses. The happy path runs left to right; reverts and exceptions branch off it. This is the canonical status reference."
      />
      <AnimatedLifecycle />
      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Happy path</div>
        <StatusRail />
      </Card>
      <StatusLegend />
      <Card pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: PALETTE.lineSoft }}>
                <th style={thCell}>#</th>
                <th style={thCell}>Status</th>
                <th style={thCell}>What it means</th>
                <th style={thCell}>Next action / owner</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_ORDER.map((status, idx) => (
                <tr key={status} style={{ borderBottom: `1px solid ${PALETTE.lineSoft}` }}>
                  <td style={{ ...tdCell, color: PALETTE.textMuted, whiteSpace: 'nowrap' }}>{idx + 1}</td>
                  <td style={{ ...tdCell, whiteSpace: 'nowrap' }}><StatusChip status={status} size={11} /></td>
                  <td style={tdCell}>{STATUS_DETAILS[status].description}</td>
                  <td style={tdCell}>{STATUS_DETAILS[status].nextOwner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Status legend (scannable chip reference) ─────────────────────────────────
function StatusLegend() {
  return (
    <Card>
      <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 }}>
        Every status at a glance
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STATUS_LEGEND.map((grp) => (
          <div key={grp.label} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span style={{ minWidth: 84, fontSize: 11.5, fontWeight: 700, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {grp.label}
            </span>
            {grp.statuses.map((s) => <StatusChip key={s} status={s} size={11.5} />)}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── 4. Create & Approve ──────────────────────────────────────────────────────
function CreateApprove() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="CMO flow"
        title="Create & get approved"
        lead={<>A <RoleBadge role="cmo_nodal" /> drafts the announcement and submits it. A <RoleBadge role="cmo_reviewer" /> (auto-assigned round-robin) approves it — publishing to the department — or reverts it with a reason.</>}
      />
      <Card><CreationApprovalDiagram /></Card>
      <Grid min={320} gap={16}>
        <Figure src={shotUrl('add-announcement.png')} alt="Create announcement form" caption="The create form: selecting a constituency auto-fills District and Block; duplicate detection warns before saving." maxHeight={460} />
        <Clip src={clipUrl('tour-create.mp4')} caption="Walkthrough of the announcement creation form." />
      </Grid>
      <div className="manual-stack" style={{ gap: 14 }}>
        <StepRow n={1} title="Create a draft" accent={GROUPS.cmo.color}>The CMO Nodal fills in title, department, occasion, location and dates, then saves.</StepRow>
        <StepRow n={2} title="Submit for review" accent={GROUPS.cmo.color}>On submit it becomes <StatusChip status="pending_cmo_review" size={11} /> and is auto-assigned to a reviewer.</StepRow>
        <StepRow n={3} title="Reviewer decides" accent={GROUPS.cmo.color}>Approve publishes to the department; Revert (with a required reason) returns it to the creator as <StatusChip status="reverted_by_cmo" size={11} />.</StepRow>
      </div>
      <Callout tone="info" title="Recall & delete">A creator (or Admin) can recall a pending item back to draft before the reviewer acts, and can permanently delete it while in draft, pending review, reverted, or pending reconsideration.</Callout>
    </div>
  );
}

// ── 5. Department acceptance ─────────────────────────────────────────────────
function DeptAcceptance() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Department flow"
        title="Two-step acceptance"
        lead={<>Once published, a <RoleBadge role="dept_nodal" /> accepts the announcement, then a <RoleBadge role="dept_reviewer" /> grants final acceptance — moving it to In Progress. The accepting Dept Nodal is recorded; closure and edit-after-revert are tied to that exact officer.</>}
      />
      <Card><DeptAcceptanceDiagram /></Card>
      <Figure src={shotUrl('dept-announcement-detail.png')} alt="Announcement detail with department actions" caption="The announcement detail view, where the department acts on a published announcement." maxHeight={460} />
    </div>
  );
}

// ── 6. Sub-components ────────────────────────────────────────────────────────
function SubComponents() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Execution"
        title="Sub-components & execution"
        lead="The accepting Dept Nodal breaks the work into sub-components and tags one owner per item. Only the tagged owner can move a sub-component Pending → In Progress → Completed."
      />
      <Card><SubComponentDiagram /></Card>
      <Callout tone="warn" title="When can sub-components be added?">Only after the Dept Reviewer grants final acceptance — i.e. status <em>accepted</em>, <em>in_progress</em>, or <em>reverted_by_dept_reviewer</em>. Never while still published or pending acceptance.</Callout>
    </div>
  );
}

// ── 7. Closure ───────────────────────────────────────────────────────────────
function Closure() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Sign-off"
        title="The closure pipeline"
        lead="Closure is the most strictly gated part of the workflow. Only the accepting Dept Nodal can request it — and only after every sub-component is Completed. It then passes Dept Reviewer → CMO Reviewer; either may revert with a reason."
      />
      <Card><ClosureDiagram /></Card>
    </div>
  );
}

// ── 8. Exceptions ────────────────────────────────────────────────────────────
function Exceptions() {
  const cards: { status: WorkflowStatus; title: string; body: string }[] = [
    { status: 'on_hold', title: 'On Hold', body: 'Admin or CMO Nodal can place an announcement on hold with mandatory remarks. It needs a deliberate action to resume or drop.' },
    { status: 'dropped', title: 'Dropped', body: 'Admin or CMO Nodal can drop an announcement with mandatory remarks. It will not proceed further.' },
    { status: 'pending_cmo_reconsideration', title: 'Reconsideration', body: 'Before department acceptance, a Dept Nodal can send a published announcement back to the CMO with remarks for reconsideration.' },
  ];
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Off the happy path"
        title="Hold, Drop & Reconsideration"
        lead="Three exception states let the CMO and department pause, stop, or push back an announcement — each requires mandatory remarks."
      />
      <Grid min={260}>
        {cards.map((c) => (
          <Card key={c.status}>
            <div style={{ marginBottom: 8 }}><StatusChip status={c.status} /></div>
            <div style={{ fontWeight: 700, color: PALETTE.inkSoft, marginBottom: 4 }}>{c.title}</div>
            <div style={{ fontSize: 13, color: PALETTE.text, lineHeight: 1.55 }}>{c.body}</div>
          </Card>
        ))}
      </Grid>
    </div>
  );
}

// ── 9. Dashboard & reports ───────────────────────────────────────────────────
function DashboardReports() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Using the app"
        title="Dashboard & reports"
        lead="The Dashboard gives a live status overview with KPI cards, a status donut, and department progress. Reports drill into ageing and department-wise performance."
      />
      <Figure src={shotUrl('dashboard.png')} alt="Dashboard with KPI cards and department progress" caption="KPI cards, status donut and the department progress table." />
      <Clip src={clipUrl('tour-dashboard.mp4')} caption="A tour of the Dashboard." />
      <Grid min={300} gap={16}>
        <Figure src={shotUrl('report-aging.png')} alt="Sankalpa Patra Ageing Analysis Report" caption="Sankalpa Patra Ageing Analysis Report." maxHeight={320} />
        <Figure src={shotUrl('report-department-wise.png')} alt="Department-wise report" caption="Department-wise performance." maxHeight={320} />
      </Grid>
      <Callout tone="info">Reports are available to Admin, Chief Minister, CMO Nodal and CMO Reviewer.</Callout>
    </div>
  );
}

// ── 10. Admin & master data ──────────────────────────────────────────────────
function AdminData() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Using the app"
        title="Admin & master data"
        lead={<>The <RoleBadge role="admin" /> manages users, tagging, master data (districts, departments, categories, tags) and the activity log.</>}
      />
      <Figure src={shotUrl('user-management.png')} alt="User management screen" caption="User management — create, edit, deactivate and assign roles." />
      <Clip src={clipUrl('tour-users.mp4')} caption="A tour of user management." />
      <Grid min={300} gap={16}>
        <Figure src={shotUrl('masters-districts.png')} alt="Districts master data" caption="Districts master data." maxHeight={320} />
        <Figure src={shotUrl('masters-departments.png')} alt="Departments master data" caption="Departments master data." maxHeight={320} />
        <Figure src={shotUrl('user-tagging.png')} alt="User tagging" caption="User tagging." maxHeight={320} />
        <Figure src={shotUrl('activity-log.png')} alt="Activity log" caption="Activity log of every state-changing action." maxHeight={320} />
      </Grid>
    </div>
  );
}

// ── 11. Notifications ────────────────────────────────────────────────────────
function Notifications() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Reference"
        title="Notification matrix"
        lead="Notifications keep every stakeholder in the loop. Reverts always carry the reviewer's reason so the recipient knows what to fix."
      />
      <Card pad={false}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: GROUPS.cmo.light }}>
              <th style={{ ...thCell, width: '45%', color: PALETTE.inkSoft }}>Event</th>
              <th style={{ ...thCell, color: PALETTE.inkSoft }}>Notified</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_MATRIX.map((m, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? PALETTE.surface : PALETTE.surfaceAlt }}>
                <td style={{ ...tdCell, borderBottom: `1px solid ${PALETTE.line}` }}>{m.event}</td>
                <td style={{ ...tdCell, borderBottom: `1px solid ${PALETTE.line}` }}>{m.recipients}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── 12. Rules ────────────────────────────────────────────────────────────────
function Rules() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Reference"
        title="Rules the system enforces"
        lead="A consolidated checklist of every rule the platform enforces — useful for onboarding and for auditing role behaviour."
      />
      <Grid min={320}>
        {RULES.map((g) => (
          <Card key={g.group} accent={GROUPS.cmo.color}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <i className={`bi ${g.icon}`} style={{ color: GROUPS.cmo.color, fontSize: 16 }} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: PALETTE.inkSoft }}>{g.group}</div>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: PALETTE.text }}>
              {g.items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{it}</li>)}
            </ul>
          </Card>
        ))}
      </Grid>
    </div>
  );
}

// ── Walkthroughs (interactive step-by-step) ──────────────────────────────────
function Walkthroughs() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Step by step"
        title="Guided walkthroughs"
        lead="Click through each core flow one step at a time — every step pairs a real screen from the app with a single, plain instruction. Use Back / Next or the progress bar to move around."
      />
      {WALKTHROUGHS.map((flow) => (
        <Walkthrough key={flow.id} flow={flow} />
      ))}
      <Callout tone="info">These walkthroughs mirror the rules the system enforces — buttons only appear for the role and status that allow the action.</Callout>
    </div>
  );
}

// ── Page tour (quick visual index of every major page) ───────────────────────
function PageTour() {
  return (
    <div className="manual-stack">
      <SectionHeader
        kicker="Using the app"
        title="Page tour"
        lead="A quick visual index of every major screen, with the few things each page is for. Open any page in the app to see it live."
      />
      <Grid min={320} gap={16}>
        {PAGE_TOUR.map((p) => (
          <Card key={p.shot} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflow: 'hidden', maxHeight: 150, borderBottom: `1px solid ${PALETTE.line}` }}>
              <img
                src={shotUrl(p.shot)}
                alt={`${p.title} screen`}
                loading="lazy"
                style={{ display: 'block', width: '100%', marginTop: -28 }}
              />
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <i className={`bi ${p.icon}`} style={{ color: GROUPS.cmo.color, fontSize: 16 }} />
                <div style={{ fontWeight: 800, color: PALETTE.inkSoft, fontSize: 14.5 }}>{p.title}</div>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, color: PALETTE.text }}>
                {p.bullets.map((b, i) => <li key={i} style={{ marginBottom: 3 }}>{b}</li>)}
              </ul>
            </div>
          </Card>
        ))}
      </Grid>
    </div>
  );
}

const thCell: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', borderBottom: `1px solid ${PALETTE.line}`, color: PALETTE.inkSoft, fontWeight: 700 };
const tdCell: React.CSSProperties = { padding: '9px 12px', color: PALETTE.text, lineHeight: 1.5, verticalAlign: 'top' };

export const SECTIONS: ManualSection[] = [
  { id: 'overview', label: 'Overview', icon: 'bi-house-door', group: 'Getting started', Component: Overview },
  { id: 'roles', label: 'Roles', icon: 'bi-people', group: 'Getting started', Component: Roles },
  { id: 'lifecycle', label: 'Lifecycle', icon: 'bi-signpost-split', group: 'The workflow', Component: Lifecycle },
  { id: 'create', label: 'Create & Approve', icon: 'bi-pencil-square', group: 'The workflow', Component: CreateApprove },
  { id: 'dept-acceptance', label: 'Dept Acceptance', icon: 'bi-clipboard-check', group: 'The workflow', Component: DeptAcceptance },
  { id: 'subcomponents', label: 'Sub-components', icon: 'bi-diagram-3', group: 'The workflow', Component: SubComponents },
  { id: 'closure', label: 'Closure', icon: 'bi-flag', group: 'The workflow', Component: Closure },
  { id: 'walkthroughs', label: 'Walkthroughs', icon: 'bi-collection-play', group: 'The workflow', Component: Walkthroughs },
  { id: 'exceptions', label: 'Hold / Drop', icon: 'bi-pause-circle', group: 'The workflow', Component: Exceptions },
  { id: 'page-tour', label: 'Page Tour', icon: 'bi-grid-1x2', group: 'Using the app', Component: PageTour },
  { id: 'dashboard', label: 'Dashboard & Reports', icon: 'bi-bar-chart', group: 'Using the app', Component: DashboardReports },
  { id: 'admin', label: 'Admin & Master Data', icon: 'bi-shield-lock', group: 'Using the app', Component: AdminData },
  { id: 'notifications', label: 'Notifications', icon: 'bi-bell', group: 'Reference', Component: Notifications },
  { id: 'rules', label: 'Rules & Policies', icon: 'bi-journal-check', group: 'Reference', Component: Rules },
];
