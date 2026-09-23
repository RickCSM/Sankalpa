import { useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import {
  useListAnnouncementAttachments,
  useRegisterAnnouncementAttachment,
  useDeleteAttachment,
  getListAnnouncementAttachmentsQueryKey,
  type AttachmentRecord,
} from '@workspace/api-client-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg';
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

interface Props {
  announcementId: number;
  canUpload: boolean;
  canDeleteRow: (att: AttachmentRecord) => boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(contentType: string): { icon: string; color: string; label: string } {
  if (contentType.includes('pdf'))
    return { icon: 'bi-file-earmark-pdf-fill', color: '#dc2626', label: 'PDF' };
  if (contentType.startsWith('image'))
    return { icon: 'bi-file-earmark-image-fill', color: '#16a34a', label: 'Image' };
  return { icon: 'bi-file-earmark-fill', color: '#6b7280', label: 'File' };
}

function streamUrlFor(att: AttachmentRecord): string {
  const trimmed = att.objectPath.startsWith('/') ? att.objectPath.slice(1) : att.objectPath;
  return `/api/storage/${trimmed}`;
}

// Request the download variant of the stream URL. The server responds with
// Content-Disposition: attachment and the original filename, so downloads are
// reliable and correctly named regardless of the browser's `download` attribute.
function downloadUrlFor(att: AttachmentRecord): string {
  return `${streamUrlFor(att)}?download=1`;
}

function AttachmentModal({ att, onClose }: { att: AttachmentRecord; onClose: () => void }) {
  const url = streamUrlFor(att);
  const isImage = att.contentType.startsWith('image/');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12,
          width: '90vw', height: '90vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px', borderBottom: '1px solid #e2e8f0',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: '#1a3a5c',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {att.fileName}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {formatFileSize(att.fileSize)}
            </div>
          </div>
          <a
            href={downloadUrlFor(att)}
            download={att.fileName}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', background: '#e87722', color: '#fff',
              borderRadius: 6, fontSize: 13, fontWeight: 600,
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            <i className="bi bi-download"></i> Download
          </a>
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: 'transparent', border: '1px solid #d1d5db',
              borderRadius: 6, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 18, color: '#374151', flexShrink: 0,
            }}
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f8fafc', padding: isImage ? 20 : 0,
        }}>
          {isImage ? (
            <img
              src={url}
              alt={att.fileName}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }}
            />
          ) : (
            <embed
              src={url}
              type="application/pdf"
              width="100%"
              height="100%"
              style={{ display: 'block' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function AttachmentsPanel({ announcementId, canUpload, canDeleteRow }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<AttachmentRecord | null>(null);

  const { data, isLoading } = useListAnnouncementAttachments(announcementId);
  const register = useRegisterAnnouncementAttachment();
  const remove = useDeleteAttachment();

  const attachments = data?.attachments ?? [];

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: getListAnnouncementAttachmentsQueryKey(announcementId),
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setError('Only PDF, JPEG, or PNG files are allowed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('File size exceeds 10MB limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      setProgressMsg('Requesting upload URL…');
      const tokenRes = await fetch('/api/storage/uploads/request-url', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          announcementId,
        }),
      });
      if (!tokenRes.ok) {
        throw new Error(`Upload URL request failed (${tokenRes.status})`);
      }
      const tokenData = (await tokenRes.json()) as {
        uploadURL: string;
        objectPath: string;
        uploadToken: string;
      };

      setProgressMsg('Uploading…');
      const putRes = await fetch(tokenData.uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }

      setProgressMsg('Saving…');
      await register.mutateAsync({
        id: announcementId,
        data: {
          objectPath: tokenData.objectPath,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream',
          uploadToken: tokenData.uploadToken,
        },
      });

      await refresh();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
      setProgressMsg(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this attachment? This cannot be undone.')) return;
    try {
      await remove.mutateAsync({ id });
      await refresh();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Delete failed. Please try again.'));
    }
  };

  return (
    <div style={{ padding: '16px 24px 20px', borderTop: '1px solid #eee' }}>
      {preview && <AttachmentModal att={preview} onClose={() => setPreview(null)} />}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a3a5c', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="bi bi-paperclip"></i> Attachments {attachments.length > 0 && `(${attachments.length})`}
        </div>
        {canUpload && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS}
              onChange={handleFileChange}
              id="att-upload"
              style={{ display: 'none' }}
              disabled={uploading}
            />
            <label
              htmlFor="att-upload"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px',
                background: uploading ? '#9ca3af' : '#1a3a5c',
                color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              <i className={`bi ${uploading ? 'bi-cloud-arrow-up' : 'bi-plus-lg'}`}></i>
              {uploading ? (progressMsg ?? 'Uploading…') : 'Add Attachment'}
            </label>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px',
          borderRadius: 6, color: '#991b1b', fontSize: 12, marginBottom: 10,
        }}>
          {error}
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: 13, color: '#666' }}>Loading attachments…</div>
      ) : attachments.length === 0 ? (
        <div style={{ fontSize: 13, color: '#999', fontStyle: 'italic' }}>
          No attachments yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attachments.map(att => {
            const ic = iconFor(att.contentType);
            const url = streamUrlFor(att);
            return (
              <div key={att.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 10,
              }}>
                <i className={`bi ${ic.icon}`} style={{ fontSize: 28, color: ic.color }}></i>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#333', wordBreak: 'break-word' }}>
                    {att.fileName}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {formatFileSize(att.fileSize)} · {ic.label}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreview(att)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', background: '#1a3a5c', color: '#fff',
                    borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  <i className="bi bi-eye"></i> View
                </button>
                <a
                  href={downloadUrlFor(att)}
                  download={att.fileName}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', background: '#e87722', color: '#fff',
                    borderRadius: 6, fontSize: 12, fontWeight: 600,
                    textDecoration: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  <i className="bi bi-download"></i> Download
                </a>
                {canDeleteRow(att) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(att.id)}
                    title="Delete attachment"
                    style={{
                      background: 'transparent', border: 'none',
                      color: '#dc2626', cursor: 'pointer', fontSize: 18,
                      padding: 4,
                    }}
                  >
                    <i className="bi bi-trash"></i>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
