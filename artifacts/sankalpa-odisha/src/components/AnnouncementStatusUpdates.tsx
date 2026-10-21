import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateAnnouncementStatusUpdate,
  getGetAnnouncementQueryKey,
  getListAnnouncementsQueryKey,
  getListCommentsQueryKey,
} from '@workspace/api-client-react';
import AttachmentsPanel from './AttachmentsPanel';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';

interface Props {
  announcementId: number;
  version: number;
  userId: number;
}

export default function AnnouncementStatusUpdates({ announcementId, version, userId }: Props) {
  const queryClient = useQueryClient();
  const mutation = useCreateAnnouncementStatusUpdate();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const submitting = useRef(false);
  const uploadingRef = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || uploadingRef.current) return;
    setSaved(false);
    if (!comment.trim()) {
      setError('Please enter a status update.');
      return;
    }
    submitting.current = true;
    setError('');
    try {
      await mutation.mutateAsync({ id: announcementId, data: { version, comment: comment.trim() } });
      setComment('');
      setSaved(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetAnnouncementQueryKey(announcementId) }),
        queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() }),
      ]);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Could not save the status update. Please try again.'));
      // Recover the actual workflow/version after a concurrent change, without
      // clearing the user's unsaved remarks.
      void queryClient.invalidateQueries({ queryKey: getGetAnnouncementQueryKey(announcementId) });
    } finally {
      submitting.current = false;
    }
  }

  return (
    <section className="card" style={{ marginBottom: 20 }} aria-labelledby="announcement-status-updates-heading">
      <div className="card-body">
        <h5 id="announcement-status-updates-heading" style={{ fontSize: 16, fontWeight: 700, color: '#1a3a5c' }}>Status Updates</h5>
        <p style={{ fontSize: 13, color: '#666' }}>When no sub-tasks are needed, record progress directly against this announcement.</p>
        <form onSubmit={submit}>
          <label htmlFor="announcement-status-update" style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Update remarks <span aria-hidden="true">*</span></label>
          <textarea id="announcement-status-update" className="form-control" rows={4} maxLength={2000}
            value={comment} disabled={mutation.isPending} aria-required="true"
            aria-invalid={!!error} aria-describedby={error ? 'status-update-error' : undefined}
            placeholder="Describe the current progress or status…"
            onChange={event => { setComment(event.target.value); setError(''); setSaved(false); }} />
          <p style={{ fontSize: 12, color: '#666', marginTop: 10 }}>
            Attachments are optional (JPEG/JPG, PNG or PDF; up to 10 MB each). Uploaded files are saved immediately in the announcement’s Attachments section, independently of these remarks.
          </p>
          <AttachmentsPanel announcementId={announcementId} canUpload={!mutation.isPending}
            canDeleteRow={attachment => !mutation.isPending && attachment.uploadedBy === userId}
            onUploadingChange={value => { uploadingRef.current = value; setUploading(value); }} />
          {error && <p id="status-update-error" role="alert" style={{ color: '#b91c1c', marginTop: 10 }}>{error}</p>}
          {saved && <p role="status" style={{ color: '#166534', marginTop: 10 }}>Status update saved in Review History.</p>}
          <button type="submit" className="btn-approve" disabled={mutation.isPending || uploading} style={{ marginTop: 12 }}>
            {mutation.isPending ? 'Saving…' : uploading ? 'Uploading…' : 'Save Status Update'}
          </button>
        </form>
      </div>
    </section>
  );
}
