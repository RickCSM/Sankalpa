import { useEffect, useRef, useState } from 'react';
import type { Announcement, AnnouncementComment, SubComponent } from '@/data/mockData';
import { formatDateTime } from '@/data/mockData';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import AttachmentsPanel from './AttachmentsPanel';
import './ClosureRequestDialog.css';

interface Props {
  announcement: Announcement;
  request?: AnnouncementComment;
  subComponents: SubComponent[];
  onSubmit: (action: 'approve' | 'revert', comments: string) => Promise<void>;
  onClose: () => void;
}

export default function DepartmentCompletionReviewDialog({ announcement, request, subComponents, onSubmit, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [comments, setComments] = useState('');
  const [action, setAction] = useState<'approve' | 'revert'>('approve');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); trigger?.focus(); };
  }, []);

  return (
    <dialog ref={dialog} className="closure-request-dialog" aria-labelledby="dept-review-title"
      onCancel={event => { event.preventDefault(); if (!submitting) onClose(); }}
      style={{ width: 'min(760px, 94vw)', maxHeight: '88vh', overflowY: 'auto', border: '1px solid #d6dee7', borderRadius: 12, padding: 24, color: '#1a3a5c' }}>
      <h2 id="dept-review-title" style={{ fontSize: 20 }}>Department Completion Review</h2>
      <section aria-label="Request details" style={{ overflowWrap: 'anywhere' }}>
        <h3 style={{ fontSize: 16 }}>{announcement.uniqueId} — {announcement.title}</h3>
        <p><strong>Department:</strong> {announcement.department}</p>
        <p><strong>Location:</strong> {[announcement.district, announcement.block, announcement.location].filter(Boolean).join(' / ') || '—'}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{announcement.description}</p>
        <p><strong>Requested by:</strong> {request?.userName || 'See announcement history'}</p>
        <p><strong>Requested on:</strong> {request ? formatDateTime(request.timestamp) : 'See announcement history'}</p>
        <p><strong>Nodal confirmation remarks:</strong></p>
        <p style={{ whiteSpace: 'pre-wrap', background: '#f5f8fc', padding: 12, borderRadius: 6 }}>{request?.comment || 'No confirmation remarks recorded on this older request.'}</p>
        <h3 style={{ fontSize: 15 }}>Sub-components ({subComponents.length})</h3>
        <ul>{subComponents.map(sub => <li key={sub.id}>{sub.title} — {sub.status}</li>)}</ul>
        <h3 style={{ fontSize: 15 }}>Announcement attachments</h3>
        <AttachmentsPanel announcementId={announcement.id} canUpload={false} canDeleteRow={() => false} />
      </section>
      <div className="form-group" style={{ marginTop: 16 }}>
        <label htmlFor="dept-review-comments">Comments{action === 'revert' ? ' *' : ''}</label>
        <textarea id="dept-review-comments" autoFocus rows={4} maxLength={500}
          style={{ width: '100%', boxSizing: 'border-box' }} disabled={submitting}
          placeholder="Enter your review comments..." value={comments} onChange={event => setComments(event.target.value)} />
        <small>{comments.length}/500. Comments are required when reverting.</small>
      </div>
      <div className="form-group">
        <label htmlFor="dept-review-decision">Decision</label>
        <select id="dept-review-decision" value={action} disabled={submitting}
          onChange={event => setAction(event.target.value as 'approve' | 'revert')}>
          <option value="approve">Approve — forward to CMO Reviewer</option>
          <option value="revert">Revert — return to Department Nodal Officer</option>
        </select>
      </div>
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" disabled={submitting} onClick={onClose}>Cancel</button>
        <button type="button" className={action === 'approve' ? 'btn-approve' : 'btn-revert'} disabled={submitting}
          onClick={async () => {
            if (submitting) return;
            if (action === 'revert' && !comments.trim()) { setError('Comments are required when reverting a completion request.'); return; }
            setError('');
            setSubmitting(true);
            try {
              await onSubmit(action, comments.trim() || 'Completion approved.');
              onClose();
            } catch (err) {
              setError(getFriendlyErrorMessage(err, 'Unable to save the review. Please try again.'));
            } finally { setSubmitting(false); }
          }}>
          {submitting ? 'Saving…' : action === 'approve' ? 'Submit & Approve' : 'Submit & Revert'}
        </button>
      </div>
    </dialog>
  );
}
