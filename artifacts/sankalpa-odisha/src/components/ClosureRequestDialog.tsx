import { useEffect, useRef, useState } from 'react';
import AttachmentsPanel from './AttachmentsPanel';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import './ClosureRequestDialog.css';

interface Props {
  announcementId: number;
  userId: number;
  isAdmin: boolean;
  onSubmit: (remarks: string) => Promise<void>;
  onClose: () => void;
}

export default function ClosureRequestDialog({ announcementId, userId, isAdmin, onSubmit, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [remarks, setRemarks] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const busy = uploading || submitting;

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      trigger?.focus();
    };
  }, []);

  return (
    <dialog ref={dialog} className="closure-request-dialog" aria-labelledby="closure-dialog-title"
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      style={{ width: 'min(620px, 92vw)', maxHeight: '85vh', overflowY: 'auto', border: '1px solid #d6dee7', borderRadius: 12, padding: 24, color: '#1a3a5c' }}>
      <div>
        <h2 id="closure-dialog-title" style={{ fontSize: 20, marginBottom: 12 }}>Request Completion Review</h2>
        {!remarks.trim() && (
          <p role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, color: '#b91c1c', fontWeight: 600 }}>
            Remarks are mandatory. Please enter confirmation remarks before requesting completion review.
          </p>
        )}
        <p>The announcement will be submitted to the Department Reviewer for closure review.</p>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label htmlFor="closure-remarks">Confirmation remarks *</label>
          <textarea id="closure-remarks" autoFocus rows={4} required maxLength={2000}
            placeholder="Confirm completion and provide closure remarks..."
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={remarks} disabled={submitting} onChange={event => setRemarks(event.target.value)} />
          <small>{remarks.length}/2000 — Remarks are mandatory.</small>
        </div>
        <p style={{ fontSize: 13 }}>Attachment (optional): JPEG/JPG, PNG or PDF only, up to 10 MB. Uploaded files are saved immediately to the announcement, even if you cancel this request.</p>
        <AttachmentsPanel announcementId={announcementId}
          canUpload={!submitting}
          canDeleteRow={attachment => !busy && (isAdmin || attachment.uploadedBy === userId)}
          onUploadingChange={setUploading} />
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="btn-approve" disabled={busy} onClick={async () => {
        if (busy) return;
        if (!remarks.trim()) {
          document.getElementById('closure-remarks')?.focus();
          return;
        }
        setSubmitting(true);
        setError('');
        try {
          await onSubmit(remarks.trim());
          onClose();
        } catch (err) {
          setError(getFriendlyErrorMessage(err, 'Unable to request completion. Please try again.'));
        } finally {
          setSubmitting(false);
        }
      }}>
            {uploading ? 'Uploading…' : submitting ? 'Submitting…' : 'Confirm Request'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
