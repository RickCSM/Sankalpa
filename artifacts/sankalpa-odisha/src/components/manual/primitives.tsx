// ─── Manual visual primitives — reusable building blocks for every section ───
import type { CSSProperties, ReactNode } from 'react';
import type { WorkflowStatus } from '@/data/mockData';
import { workflowStatusLabels } from '@/data/mockData';
import { FONT, PALETTE, STATUS_ACCENT, ROLE_BY_ID, type RoleToken } from './tokens';

/** Big section heading with a kicker + lead paragraph. */
export function SectionHeader({
  kicker,
  title,
  lead,
}: {
  kicker?: string;
  title: string;
  lead?: ReactNode;
}) {
  return (
    <header className="manual-sec-head">
      {kicker && <div className="manual-kicker">{kicker}</div>}
      <h2 className="manual-h2">{title}</h2>
      {lead && <p className="manual-lead">{lead}</p>}
    </header>
  );
}

/** A surface card. */
export function Card({
  children,
  accent,
  style,
  pad = true,
}: {
  children: ReactNode;
  accent?: string;
  style?: CSSProperties;
  pad?: boolean;
}) {
  return (
    <div
      style={{
        background: PALETTE.surface,
        border: `1px solid ${PALETTE.line}`,
        borderLeft: accent ? `4px solid ${accent}` : `1px solid ${PALETTE.line}`,
        borderRadius: 12,
        padding: pad ? 16 : 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Colored callout box (info / warn / ok / revert). */
export function Callout({
  tone = 'warn',
  title,
  children,
}: {
  tone?: 'warn' | 'ok' | 'info' | 'revert';
  title?: string;
  children: ReactNode;
}) {
  const map = {
    warn: { bg: PALETTE.warnBg, line: PALETTE.warnLine, fg: PALETTE.warn, icon: 'bi-exclamation-triangle' },
    ok: { bg: PALETTE.okBg, line: PALETTE.ok, fg: '#15803d', icon: 'bi-check-circle' },
    info: { bg: '#eff6ff', line: '#3b82f6', fg: '#1d4ed8', icon: 'bi-info-circle' },
    revert: { bg: 'rgba(245,142,142,0.12)', line: PALETTE.revert, fg: PALETTE.revert, icon: 'bi-arrow-counterclockwise' },
  }[tone];
  return (
    <div
      style={{
        background: map.bg,
        borderLeft: `4px solid ${map.line}`,
        borderRadius: 8,
        padding: '12px 14px',
        display: 'flex',
        gap: 10,
        fontSize: 13,
        lineHeight: 1.55,
        color: PALETTE.text,
      }}
    >
      <i className={`bi ${map.icon}`} style={{ color: map.fg, fontSize: 16, marginTop: 1 }} />
      <div>
        {title && <div style={{ fontWeight: 700, color: map.fg, marginBottom: 2 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

/** Status chip — uses the app's own badge palette for 1:1 recognition. */
export function StatusChip({ status, size = 12 }: { status: WorkflowStatus; size?: number }) {
  const a = STATUS_ACCENT[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: size,
        fontWeight: 700,
        color: a.color,
        background: a.bg,
        whiteSpace: 'nowrap',
        fontFamily: FONT,
      }}
    >
      {workflowStatusLabels[status]}
    </span>
  );
}

/** Role badge / pill. */
export function RoleBadge({
  role,
  withIcon = true,
}: {
  role: RoleToken['role'];
  withIcon?: boolean;
}) {
  const t = ROLE_BY_ID[role];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        color: t.color,
        background: t.light,
        whiteSpace: 'nowrap',
      }}
    >
      {withIcon && <i className={`bi ${t.icon}`} style={{ fontSize: 12 }} />}
      {t.name}
    </span>
  );
}

/** Figure: an app screenshot with a caption. The dev-preview banner baked
 *  into the top of capture is cropped via an inset wrapper. */
export function Figure({
  src,
  alt,
  caption,
  cropTop = 28,
  maxHeight,
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  cropTop?: number;
  maxHeight?: number;
}) {
  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          border: `1px solid ${PALETTE.line}`,
          borderRadius: 12,
          overflow: 'hidden',
          background: PALETTE.surfaceAlt,
          boxShadow: '0 6px 20px rgba(15,39,71,0.08)',
        }}
      >
        <div style={{ overflow: 'hidden', maxHeight }}>
          <img
            src={src}
            alt={alt}
            loading="lazy"
            style={{
              display: 'block',
              width: '100%',
              marginTop: -cropTop,
              marginBottom: -2,
            }}
          />
        </div>
      </div>
      {caption && (
        <figcaption
          style={{
            fontSize: 12.5,
            color: PALETTE.textMuted,
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Auto-looping muted screen clip with a caption. */
export function Clip({
  src,
  caption,
  poster,
}: {
  src: string;
  caption?: ReactNode;
  poster?: string;
}) {
  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          border: `1px solid ${PALETTE.line}`,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#0b1220',
          boxShadow: '0 6px 20px rgba(15,39,71,0.10)',
        }}
      >
        <video
          src={src}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          style={{ display: 'block', width: '100%' }}
        />
      </div>
      {caption && (
        <figcaption
          style={{ fontSize: 12.5, color: PALETTE.textMuted, marginTop: 8, lineHeight: 1.5 }}
        >
          <i className="bi bi-play-circle" style={{ marginRight: 6 }} />
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Numbered step row for walkthroughs. */
export function StepRow({
  n,
  title,
  children,
  accent = PALETTE.inkSoft,
}: {
  n: number;
  title: ReactNode;
  children?: ReactNode;
  accent?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div
        style={{
          flex: '0 0 auto',
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: accent,
          color: '#fff',
          fontWeight: 700,
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {n}
      </div>
      <div style={{ flex: 1, paddingTop: 2 }}>
        <div style={{ fontWeight: 700, color: PALETTE.inkSoft, fontSize: 14 }}>{title}</div>
        {children && (
          <div style={{ fontSize: 13, color: PALETTE.text, lineHeight: 1.55, marginTop: 3 }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/** A simple responsive grid. */
export function Grid({
  min = 260,
  gap = 14,
  children,
  style,
}: {
  min?: number;
  gap?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
