// ─── Manual interactive pieces — animated lifecycle + step walkthroughs ──────
import { useEffect, useState } from 'react';
import type { WorkflowStatus, UserRole } from '@/data/mockData';
import { workflowStatusLabels } from '@/data/mockData';
import { FONT, PALETTE, GROUPS, STATUS_ACCENT, shotUrl, clipUrl } from './tokens';
import { RoleBadge } from './primitives';
import type { WalkthroughFlow } from './content';
import { useManualExport } from './ManualExportContext';

/** Respect the user's reduced-motion preference for all auto-playing visuals. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

// ── Animated lifecycle ───────────────────────────────────────────────────────
interface Stage {
  status: WorkflowStatus;
  owner: UserRole | null;
  action: string;
}

const STAGES: Stage[] = [
  { status: 'draft', owner: 'cmo_nodal', action: 'Drafts the announcement' },
  { status: 'pending_cmo_review', owner: 'cmo_reviewer', action: 'Reviews & approves' },
  { status: 'published', owner: 'dept_nodal', action: 'Receives for acceptance' },
  { status: 'pending_dept_acceptance', owner: 'dept_reviewer', action: 'Grants final acceptance' },
  { status: 'accepted', owner: 'dept_nodal', action: 'Adds sub-components' },
  { status: 'in_progress', owner: 'dept_user', action: 'Executes the work' },
  { status: 'pending_completion_review', owner: 'dept_reviewer', action: 'Reviews the closure' },
  { status: 'pending_cmo_completion_review', owner: 'cmo_reviewer', action: 'Gives final sign-off' },
  { status: 'completed', owner: null, action: 'Delivered & closed' },
];

const STEP_MS = 2000;

function LifecyclePlayer() {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setI((p) => (p + 1) % STAGES.length), STEP_MS);
    return () => clearInterval(t);
  }, [playing]);

  const stage = STAGES[i];
  const accent = STATUS_ACCENT[stage.status];

  return (
    <div
      style={{
        background: PALETTE.surface,
        border: `1px solid ${PALETTE.line}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Happy path — playing through each stage
        </div>
        <button
          type="button"
          className="manual-play-btn"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause animation' : 'Play animation'}
        >
          <i className={`bi ${playing ? 'bi-pause-fill' : 'bi-play-fill'}`} />
          <span>{playing ? 'Pause' : 'Play'}</span>
        </button>
      </div>

      {/* Rail of stages */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
        {STAGES.map((s, idx) => {
          const on = idx === i;
          const done = idx < i;
          const a = STATUS_ACCENT[s.status];
          return (
            <button
              key={s.status}
              type="button"
              onClick={() => { setI(idx); setPlaying(false); }}
              className="manual-stage-chip"
              aria-current={on}
              style={{
                color: on || done ? a.color : PALETTE.textMuted,
                background: on ? a.bg : done ? a.bg : PALETTE.lineSoft,
                boxShadow: on ? `0 0 0 2px ${a.color}` : 'none',
                opacity: on || done ? 1 : 0.7,
                transform: on ? 'translateY(-1px)' : 'none',
              }}
            >
              {workflowStatusLabels[s.status]}
            </button>
          );
        })}
      </div>

      {/* Now-playing card */}
      <div
        aria-live="polite"
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          background: accent.bg,
          borderRadius: 10,
          padding: '12px 14px',
          transition: 'background 0.3s ease',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: accent.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Stage {i + 1} / {STAGES.length}
        </span>
        <span style={{ fontWeight: 800, color: accent.color, fontFamily: FONT }}>
          {workflowStatusLabels[stage.status]}
        </span>
        {stage.owner ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: PALETTE.text }}>
            <i className="bi bi-arrow-right" style={{ color: PALETTE.textMuted }} />
            <RoleBadge role={stage.owner} />
            <span>{stage.action}</span>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#15803d', fontWeight: 700 }}>
            <i className="bi bi-check-circle-fill" />
            {stage.action}
          </span>
        )}
      </div>
      {reduced && (
        <div style={{ marginTop: 10, fontSize: 12, color: PALETTE.textMuted }}>
          Animation paused — your system prefers reduced motion. Tap a stage to step through manually.
        </div>
      )}
    </div>
  );
}

// ── Interactive walkthrough ──────────────────────────────────────────────────
function WalkthroughPlayer({ flow }: { flow: WalkthroughFlow }) {
  const [i, setI] = useState(0);
  const group = GROUPS[flow.accentGroup];
  const step = flow.steps[i];
  const total = flow.steps.length;

  return (
    <div
      style={{
        background: PALETTE.surface,
        border: `1px solid ${PALETTE.line}`,
        borderLeft: `4px solid ${group.color}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${PALETTE.lineSoft}` }}>
        <RoleBadge role={flow.role} />
        <div style={{ fontWeight: 800, color: PALETTE.inkSoft, fontSize: 15 }}>{flow.title}</div>
      </div>

      <div className="manual-walk-grid">
        {/* Media */}
        <div className="manual-walk-media">
          <div
            className="manual-walk-frame"
            style={{
              position: 'relative',
              overflow: 'hidden',
              maxHeight: step.clip ? undefined : 320,
              borderRadius: 8,
              border: `1px solid ${PALETTE.line}`,
            }}
          >
            {step.clip ? (
              <video
                key={step.clip}
                src={clipUrl(step.clip)}
                autoPlay
                loop
                muted
                playsInline
                style={{ display: 'block', width: '100%' }}
              />
            ) : (
              <img
                key={step.shot}
                src={shotUrl(step.shot!)}
                alt={`${flow.title} — ${step.title}`}
                loading="lazy"
                style={{ display: 'block', width: '100%', marginTop: -28 }}
              />
            )}
            {step.highlight && (
              <div
                className="manual-walk-highlight"
                aria-hidden="true"
                style={{
                  left: `${step.highlight.x}%`,
                  top: `${step.highlight.y}%`,
                  width: `${step.highlight.w}%`,
                  height: `${step.highlight.h}%`,
                }}
              />
            )}
          </div>
        </div>

        {/* Step body */}
        <div className="manual-walk-side">
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {flow.steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Go to step ${idx + 1}`}
                onClick={() => setI(idx)}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  background: idx <= i ? group.color : PALETTE.line,
                  transition: 'background 0.2s ease',
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: group.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Step {i + 1} of {total}
          </div>
          <div style={{ fontWeight: 800, color: PALETTE.inkSoft, fontSize: 15, margin: '4px 0 6px' }}>{step.title}</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: PALETTE.text, margin: 0, flex: 1 }}>{step.instruction}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="manual-walk-btn"
              disabled={i === 0}
              onClick={() => setI((p) => Math.max(0, p - 1))}
            >
              <i className="bi bi-arrow-left" /> Back
            </button>
            <button
              type="button"
              className="manual-walk-btn primary"
              disabled={i === total - 1}
              onClick={() => setI((p) => Math.min(total - 1, p + 1))}
              style={{ background: group.color, borderColor: group.color }}
            >
              Next <i className="bi bi-arrow-right" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Export-mode variants (fully expanded, static-friendly) ───────────────────
// Used when the manual is rendered into the downloadable PDF / HTML: every stage
// and every walkthrough step is shown at once so nothing is hidden behind a
// player control. CSS-driven motion (spotlights, looping muted clips) survives.

function LifecycleStatic() {
  return (
    <div style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.line}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 }}>
        Happy path — every stage in order
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STAGES.map((s, idx) => {
          const accent = STATUS_ACCENT[s.status];
          return (
            <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: accent.bg, borderRadius: 10, padding: '10px 14px' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: accent.color, textTransform: 'uppercase', letterSpacing: 0.4, minWidth: 62 }}>
                Stage {idx + 1}
              </span>
              <span style={{ fontWeight: 800, color: accent.color, fontFamily: FONT }}>{workflowStatusLabels[s.status]}</span>
              {s.owner ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: PALETTE.text }}>
                  <i className="bi bi-arrow-right" style={{ color: PALETTE.textMuted }} />
                  <RoleBadge role={s.owner} />
                  <span>{s.action}</span>
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#15803d', fontWeight: 700 }}>
                  <i className="bi bi-check-circle-fill" />
                  {s.action}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnimatedLifecycle() {
  const isExport = useManualExport();
  return isExport ? <LifecycleStatic /> : <LifecyclePlayer />;
}

function WalkthroughStatic({ flow }: { flow: WalkthroughFlow }) {
  const group = GROUPS[flow.accentGroup];
  const total = flow.steps.length;
  return (
    <div
      style={{
        background: PALETTE.surface,
        border: `1px solid ${PALETTE.line}`,
        borderLeft: `4px solid ${group.color}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${PALETTE.lineSoft}` }}>
        <RoleBadge role={flow.role} />
        <div style={{ fontWeight: 800, color: PALETTE.inkSoft, fontSize: 15 }}>{flow.title}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 16 }}>
        {flow.steps.map((step, idx) => (
          <div
            key={idx}
            className="manual-export-walkstep"
            style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}
          >
            <div
              className="manual-walk-frame"
              style={{ position: 'relative', overflow: 'hidden', maxHeight: step.clip ? undefined : 320, borderRadius: 8, border: `1px solid ${PALETTE.line}` }}
            >
              {step.clip ? (
                <video key={step.clip} src={clipUrl(step.clip)} autoPlay loop muted playsInline style={{ display: 'block', width: '100%' }} />
              ) : (
                <img key={step.shot} src={shotUrl(step.shot!)} alt={`${flow.title} — ${step.title}`} style={{ display: 'block', width: '100%', marginTop: -28 }} />
              )}
              {step.highlight && (
                <div
                  className="manual-walk-highlight"
                  aria-hidden="true"
                  style={{ left: `${step.highlight.x}%`, top: `${step.highlight.y}%`, width: `${step.highlight.w}%`, height: `${step.highlight.h}%` }}
                />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: group.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Step {idx + 1} of {total}
              </div>
              <div style={{ fontWeight: 800, color: PALETTE.inkSoft, fontSize: 15, margin: '4px 0 6px' }}>{step.title}</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: PALETTE.text, margin: 0 }}>{step.instruction}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Walkthrough({ flow }: { flow: WalkthroughFlow }) {
  const isExport = useManualExport();
  return isExport ? <WalkthroughStatic flow={flow} /> : <WalkthroughPlayer flow={flow} />;
}
