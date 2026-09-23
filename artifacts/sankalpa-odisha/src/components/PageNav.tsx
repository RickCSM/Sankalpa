import { useLocation } from 'wouter';
import { useNavHistory } from '@/context/NavHistory';
import { buildBreadcrumbs, getSequence, sequenceLabel } from '@/lib/breadcrumbs';

export default function PageNav({ variant = 'top' }: { variant?: 'top' | 'bottom' }) {
  const [location, navigate] = useLocation();
  const { goBack } = useNavHistory();
  const crumbs = buildBreadcrumbs(location);
  const seq = getSequence(location);
  const isDashboard = location === '/' || location === '';

  return (
    <div className={`page-nav page-nav--${variant}`}>
      <div className="page-nav__left">
        <button type="button" className="page-nav__btn" onClick={goBack} title="Go back to the previous page">
          <i className="bi bi-arrow-left" /> Back
        </button>
        {!isDashboard && (
          <button type="button" className="page-nav__btn" onClick={() => navigate('/')} title="Go to the dashboard">
            <i className="bi bi-house-door" /> Home
          </button>
        )}
        <nav className="page-nav__crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={i} className="page-nav__crumb">
                {c.path && !isLast ? (
                  <a onClick={() => navigate(c.path!)}>{c.label}</a>
                ) : (
                  <span className={isLast ? 'page-nav__crumb--current' : undefined}>{c.label}</span>
                )}
                {!isLast && <i className="bi bi-chevron-right page-nav__sep" />}
              </span>
            );
          })}
        </nav>
      </div>
      {(seq.prev || seq.next) && (
        <div className="page-nav__right">
          <button
            type="button"
            className="page-nav__btn"
            disabled={!seq.prev}
            onClick={() => seq.prev && navigate(seq.prev)}
            title={seq.prev ? `Previous: ${sequenceLabel(seq.prev)}` : 'No previous page'}
          >
            <i className="bi bi-chevron-left" /> Prev
          </button>
          <button
            type="button"
            className="page-nav__btn"
            disabled={!seq.next}
            onClick={() => seq.next && navigate(seq.next)}
            title={seq.next ? `Next: ${sequenceLabel(seq.next)}` : 'No next page'}
          >
            Next <i className="bi bi-chevron-right" />
          </button>
        </div>
      )}
    </div>
  );
}
