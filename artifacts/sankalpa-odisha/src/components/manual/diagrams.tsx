// ─── Manual SVG flow diagrams + low-level drawing primitives ─────────────────
import { FONT, PALETTE, GROUPS } from './tokens';

const COL = {
  cmo: GROUPS.cmo.color,
  cmoLight: GROUPS.cmo.light,
  dept: GROUPS.dept.color,
  deptLight: GROUPS.dept.light,
  neutral: '#475569',
  revert: PALETTE.revert,
  textDark: PALETTE.inkSoft,
};

const ARROW_COLORS = [COL.neutral, COL.cmo, COL.dept, COL.revert, '#16a34a'];

function ArrowDefs({ idPrefix }: { idPrefix: string }) {
  return (
    <defs>
      {ARROW_COLORS.map((c) => (
        <marker
          key={c}
          id={`${idPrefix}-arrow-${c.replace('#', '')}`}
          markerWidth={10}
          markerHeight={10}
          refX={9}
          refY={3}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill={c} />
        </marker>
      ))}
    </defs>
  );
}

function Box({
  x, y, w, h, fill, stroke, label, sub,
}: {
  x: number; y: number; w: number; h: number;
  fill: string; stroke: string; label: string; sub?: string;
}) {
  const cx = x + w / 2;
  const labelY = sub ? y + h / 2 - 2 : y + h / 2 + 4;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} ry={8} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={cx} y={labelY} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: COL.textDark, fontFamily: FONT }}>
        {label}
      </text>
      {sub && (
        <text x={cx} y={y + h / 2 + 14} textAnchor="middle" style={{ fontSize: 10, fill: '#475569', fontFamily: FONT }}>
          {sub}
        </text>
      )}
    </g>
  );
}

function Arrow({
  x1, y1, x2, y2, color = COL.neutral, prefix,
}: {
  x1: number; y1: number; x2: number; y2: number; color?: string; prefix: string;
}) {
  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.6} markerEnd={`url(#${prefix}-arrow-${color.replace('#', '')})`} />
  );
}

function Label({
  x, y, text, color = COL.neutral, anchor = 'middle',
}: {
  x: number; y: number; text: string; color?: string; anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} style={{ fontSize: 10, fill: color, fontWeight: 600, fontFamily: FONT }}>
      {text}
    </text>
  );
}

export function CreationApprovalDiagram() {
  return (
    <svg viewBox="0 0 1000 360" width="100%" style={{ maxWidth: 1000, display: 'block', margin: '0 auto' }}>
      <ArrowDefs idPrefix="d2" />
      <text x={20} y={50} style={{ fontSize: 11, fontWeight: 700, fill: COL.cmo, fontFamily: FONT }}>CMO LANE</text>
      <text x={20} y={250} style={{ fontSize: 11, fontWeight: 700, fill: COL.dept, fontFamily: FONT }}>DEPT LANE</text>
      <line x1={100} y1={20} x2={100} y2={340} stroke="#e5e7eb" strokeWidth={1} />
      <line x1={100} y1={200} x2={980} y2={200} stroke="#e5e7eb" strokeDasharray="4 4" />
      <Box x={130} y={60} w={180} h={56} fill={COL.cmoLight} stroke={COL.cmo} label="CMO Nodal" sub="Creates draft" />
      <Arrow x1={310} y1={88} x2={355} y2={88} color={COL.cmo} prefix="d2" />
      <Label x={332} y={80} text="Submit" color={COL.cmo} />
      <Box x={360} y={60} w={200} h={56} fill={COL.cmoLight} stroke={COL.cmo} label="Pending CMO Review" sub="Round-robin assigned" />
      <Arrow x1={560} y1={88} x2={605} y2={88} color={COL.cmo} prefix="d2" />
      <Box x={610} y={60} w={200} h={56} fill={COL.cmoLight} stroke={COL.cmo} label="CMO Reviewer" sub="Approve / Revert" />
      <Arrow x1={710} y1={116} x2={710} y2={258} color={COL.dept} prefix="d2" />
      <Label x={720} y={195} text="Approve" color={COL.dept} anchor="start" />
      <Box x={610} y={258} w={200} h={56} fill={COL.deptLight} stroke={COL.dept} label="Pending Dept Acceptance" />
      <Arrow x1={810} y1={286} x2={855} y2={286} color={COL.dept} prefix="d2" />
      <Box x={860} y={258} w={120} h={56} fill={COL.deptLight} stroke={COL.dept} label="Dept Notified" sub="Head/Nodal/Rev." />
      <path d="M 660 60 Q 460 0 220 60" fill="none" stroke={COL.revert} strokeWidth={1.5} strokeDasharray="5 4" markerEnd={`url(#d2-arrow-${COL.revert.replace('#', '')})`} />
      <Label x={440} y={20} text="Revert (with reason) — back to creator" color={COL.revert} />
    </svg>
  );
}

export function DeptAcceptanceDiagram() {
  return (
    <svg viewBox="0 0 900 390" width="100%" style={{ maxWidth: 900, display: 'block', margin: '0 auto' }}>
      <ArrowDefs idPrefix="d3" />
      <Box x={250} y={30} w={260} h={56} fill={COL.deptLight} stroke={COL.dept} label="Pending Dept Acceptance" sub="Status from CMO publish" />
      <Arrow x1={380} y1={86} x2={380} y2={130} color={COL.dept} prefix="d3" />
      <Label x={395} y={112} text="Dept Nodal clicks Accept" color={COL.dept} anchor="start" />
      <Box x={250} y={130} w={260} h={66} fill="#fff" stroke={COL.dept} label="Dept Nodal Accepted" sub="acceptedByDeptNodalId is recorded" />
      <Arrow x1={380} y1={196} x2={380} y2={240} color={COL.dept} prefix="d3" />
      <Label x={395} y={222} text="Forward to Dept Reviewer" color={COL.dept} anchor="start" />
      <Box x={250} y={240} w={260} h={66} fill="#fff" stroke={COL.dept} label="Dept Reviewer Final-Accepts" sub="Status → in_progress" />
      <Arrow x1={380} y1={306} x2={380} y2={344} color="#16a34a" prefix="d3" />
      <Box x={290} y={344} w={180} h={32} fill="#dcfce7" stroke="#16a34a" label="Execution begins" />
      <rect x={560} y={130} width={310} height={176} rx={8} fill="#fff7ed" stroke="#f59e0b" strokeWidth={1} />
      <text x={580} y={155} style={{ fontSize: 12, fontWeight: 700, fill: '#b45309', fontFamily: FONT }}>Why two steps?</text>
      <text x={580} y={178} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>• Dept Nodal owns delivery</text>
      <text x={580} y={198} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>• Dept Reviewer formally approves on</text>
      <text x={580} y={213} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>  behalf of the department</text>
      <text x={580} y={236} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>• Sub-components & closure are gated</text>
      <text x={580} y={251} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>  by the accepting Dept Nodal only</text>
      <text x={580} y={274} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>• Reverts return to that same nodal</text>
      <text x={580} y={289} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>  for resubmission</text>
    </svg>
  );
}

export function SubComponentDiagram() {
  return (
    <svg viewBox="0 0 1000 280" width="100%" style={{ maxWidth: 1000, display: 'block', margin: '0 auto' }}>
      <ArrowDefs idPrefix="d4" />
      <Box x={20} y={110} w={170} h={60} fill={COL.deptLight} stroke={COL.dept} label="Dept Nodal" sub="Adds sub-component" />
      <Arrow x1={190} y1={140} x2={245} y2={140} color={COL.dept} prefix="d4" />
      <Label x={217} y={132} text="Tag owner" color={COL.dept} />
      <Box x={250} y={110} w={190} h={60} fill="#fff" stroke={COL.dept} label="Sub-component" sub="Owner: Dept Nodal / User" />
      <Arrow x1={440} y1={140} x2={495} y2={140} color={COL.neutral} prefix="d4" />
      <Box x={500} y={50} w={140} h={48} fill="#fef3c7" stroke="#f59e0b" label="Pending" />
      <Arrow x1={640} y1={74} x2={695} y2={74} color={COL.neutral} prefix="d4" />
      <Label x={667} y={66} text="Owner starts" color={COL.neutral} />
      <Box x={700} y={50} w={140} h={48} fill="#dbeafe" stroke="#3b82f6" label="In Progress" />
      <Arrow x1={770} y1={98} x2={770} y2={195} color={COL.neutral} prefix="d4" />
      <Label x={780} y={150} text="Owner completes" color={COL.neutral} anchor="start" />
      <Box x={700} y={195} w={140} h={48} fill="#dcfce7" stroke="#16a34a" label="Completed" />
      <rect x={20} y={210} width={420} height={50} rx={6} fill="#fff7ed" stroke="#f59e0b" strokeWidth={1} />
      <text x={32} y={232} style={{ fontSize: 11, fontWeight: 700, fill: '#b45309', fontFamily: FONT }}>Ownership rule</text>
      <text x={32} y={250} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>Only the tagged owner (or Admin) can change a sub-component's status.</text>
    </svg>
  );
}

export function ClosureDiagram() {
  return (
    <svg viewBox="0 0 1080 420" width="100%" style={{ maxWidth: 1080, display: 'block', margin: '0 auto' }}>
      <ArrowDefs idPrefix="d5" />
      <Box x={20} y={200} w={170} h={60} fill={COL.deptLight} stroke={COL.dept} label="Accepting Dept Nodal" sub="Requests closure" />
      <Arrow x1={190} y1={230} x2={235} y2={230} color={COL.dept} prefix="d5" />
      <Box x={240} y={200} w={170} h={60} fill="#fff" stroke={COL.dept} label="Pending Dept" sub="Completion Review" />
      <Arrow x1={410} y1={230} x2={455} y2={230} color={COL.dept} prefix="d5" />
      <Box x={460} y={200} w={170} h={60} fill={COL.deptLight} stroke={COL.dept} label="Dept Reviewer" sub="Approve / Revert" />
      <Arrow x1={630} y1={230} x2={675} y2={230} color={COL.cmo} prefix="d5" />
      <Label x={652} y={222} text="Approve" color={COL.cmo} />
      <Box x={680} y={200} w={170} h={60} fill={COL.cmoLight} stroke={COL.cmo} label="CMO Reviewer" sub="Final approval" />
      <Arrow x1={850} y1={230} x2={895} y2={230} color={COL.cmo} prefix="d5" />
      <Label x={872} y={222} text="Approve" color={COL.cmo} />
      <Box x={900} y={200} w={140} h={60} fill="#dcfce7" stroke="#16a34a" label="Completed" />
      <path d="M 545 200 Q 320 110 105 200" fill="none" stroke={COL.revert} strokeWidth={1.6} strokeDasharray="5 4" markerEnd={`url(#d5-arrow-${COL.revert.replace('#', '')})`} />
      <Label x={325} y={120} text="Dept Reviewer Revert (with reason)" color={COL.revert} />
      <path d="M 765 260 Q 430 360 105 260" fill="none" stroke={COL.revert} strokeWidth={1.6} strokeDasharray="5 4" markerEnd={`url(#d5-arrow-${COL.revert.replace('#', '')})`} />
      <Label x={435} y={355} text="CMO Reviewer Revert (with reason) — back to same accepting nodal" color={COL.revert} />
      <rect x={20} y={30} width={420} height={140} rx={8} fill="#fff7ed" stroke="#f59e0b" strokeWidth={1} />
      <text x={36} y={56} style={{ fontSize: 13, fontWeight: 700, fill: '#b45309', fontFamily: FONT }}>Closure Gate (system-enforced)</text>
      <text x={36} y={80} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>1. Only the accepting Dept Nodal may request closure</text>
      <text x={36} y={100} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>2. All sub-components must be Completed first</text>
      <text x={36} y={120} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>3. Every revert requires a non-empty reason comment</text>
      <text x={36} y={140} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>4. Reverts always route back to that same accepting nodal</text>
      <text x={36} y={160} style={{ fontSize: 11, fill: '#374151', fontFamily: FONT }}>5. Edit-after-revert is restricted to the accepting nodal</text>
    </svg>
  );
}
