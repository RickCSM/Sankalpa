import { useEffect, useRef, useState } from 'react';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import { showLoadingNotice } from '@/lib/loading';
import AttachmentsPanel from './AttachmentsPanel';
import './ClosureRequestDialog.css';

interface Props {
  announcementId: number;
  announcementTitle: string;
  userId: number;
  isAdmin: boolean;
  onSubmit: (comment: string) => Promise<void>;
  onClose: () => void;
}

export default function StartProgressDialog({ announcementId, announcementTitle, userId, isAdmin, onSubmit, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const uploadingRef = useRef(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const busy = submitting || uploading;

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); trigger?.focus(); };
  }, []);

  const submit = async () => {
    if (inFlight.current || uploadingRef.current) return;
    if (!comment.trim()) {
      setError('Please enter a comment before starting progress.');
      commentRef.current?.focus();
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(comment.trim());
      showLoadingNotice('Progress started successfully.');
      onClose();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to start progress. Please try again.'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="closure-request-dialog" aria-labelledby="start-progress-title"
      aria-busy={busy}
      onCancel={event => { event.preventDefault(); if (!inFlight.current && !uploadingRef.current) onClose(); }}
      style={{ width: 'min(620px, 92vw)', maxHeight: '85vh', overflowY: 'auto', border: '1px solid #d6dee7', borderRadius: 12, padding: 24, color: '#1a3a5c' }}>
      <h2 id="start-progress-title" style={{ fontSize: 20, marginBottom: 12 }}>Start Progress</h2>
      <p style={{ overflowWrap: 'anywhere' }}>{announcementTitle}</p>
      <p style={{ fontSize: 14, color: '#666' }}>Enter a comment before marking this announcement as In Progress. Your comment will be saved in its history.</p>
      <div className="form-group">
        <label htmlFor="start-progress-comment">Comments (Required)</label>
        <textarea ref={commentRef} id="start-progress-comment" rows={4} maxLength={2000} autoFocus
          required aria-required="true" aria-invalid={!!error} aria-describedby={error ? 'start-progress-error start-progress-hint' : 'start-progress-hint'}
          value={comment} disabled={busy} placeholder="Enter your comment before starting progress..."
          style={{ width: '100%', boxSizing: 'border-box' }}
          onChange={event => { setComment(event.target.value); setError(''); }} />
        <small id="start-progress-hint">{comment.length}/2000 characters</small>
      </div>
      <section aria-labelledby="start-progress-attachments-title" style={{ marginTop: 16 }}>
        <h3 id="start-progress-attachments-title" style={{ fontSize: 15 }}>Attachments (Optional)</h3>
        <p style={{ fontSize: 13, color: '#666' }}>JPEG/JPG, PNG or PDF, up to 10 MB per file. Uploaded files are saved to this announcement immediately and remain available even if you cancel starting progress.</p>
        <AttachmentsPanel announcementId={announcementId} canUpload={!submitting}
          canDeleteRow={attachment => !submitting && (isAdmin || attachment.uploadedBy === userId)}
          onUploadingChange={active => { uploadingRef.current = active; setUploading(active); }} />
      </section>
      {error && <p id="start-progress-error" role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="btn-approve" disabled={busy} onClick={() => void submit()}>
          {uploading ? 'Uploading…' : submitting ? 'Starting progress…' : 'Start Progress'}
        </button>
      </div>
    </dialog>
  );
}
