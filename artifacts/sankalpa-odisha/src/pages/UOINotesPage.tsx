import { useState, useMemo, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import {
  useListUoiNotes,
  getListUoiNotesQueryKey,
  listUoiNotes,
  useCreateUoiNote,
  useUpdateUoiNote,
  useDeleteUoiNote,
  useListDepartments,
  getListDepartmentsQueryKey,
  useListOccasions,
  getListOccasionsQueryKey,
  useCreateOccasion,
} from '@workspace/api-client-react';
import CreatableSelect from '@/components/CreatableSelect';
import { useQueryClient } from '@tanstack/react-query';
import ReportDownloadButtons from '@/components/ReportDownloadButtons';
import { ExcelBuilder, PdfBuilder, type ReportColumn } from '@/lib/reportDownloads';
import UoiNoteAttachmentsPanel from '@/components/UoiNoteAttachmentsPanel';
import {
  UOI_ALLOWED_EXTENSIONS,
  uploadUoiNoteAttachment,
  validateUoiNoteFile,
} from '@/lib/uoiNoteUploads';

const PAGE_SIZE_DEFAULT = 20;

function toAppDate(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

function fromAppDate(appDate: string): string {
  if (!appDate) return '';
  const parts = appDate.split('-');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  return `${y}-${m}-${d}`;
}

interface NoteForm {
  title: string;
  date: string;
  departmentId: number | '';
  occasion: string;
  location: string;
  description: string;
}

const EMPTY_FORM: NoteForm = {
  title: '',
  date: '',
  departmentId: '',
  occasion: '',
  location: '',
  description: '',
};

export default function UOINotesPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();

  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);

  const buildUrl = (page: number, pageSize: number, search: string, deptId: number | '') => {
    const p = new URLSearchParams();
    if (page > 1) p.set('page', String(page));
    if (pageSize !== PAGE_SIZE_DEFAULT) p.set('pageSize', String(pageSize));
    if (search) p.set('search', search);
    if (deptId !== '') p.set('departmentId', String(deptId));
    const qs = p.toString();
    return qs ? `/uoi-notes?${qs}` : '/uoi-notes';
  };

  const [page, setPage] = useState(() => {
    const pg = parseInt(params.get('page') || '1', 10);
    return pg > 0 ? pg : 1;
  });
  const [pageSize] = useState(() => {
    const ps = parseInt(params.get('pageSize') || String(PAGE_SIZE_DEFAULT), 10);
    return ps > 0 ? ps : PAGE_SIZE_DEFAULT;
  });
  const [searchInput, setSearchInput] = useState(() => params.get('search') || '');
  const [search, setSearch] = useState(() => params.get('search') || '');
  const [filterDeptId, setFilterDeptId] = useState<number | ''>(() => {
    const d = params.get('departmentId');
    return d ? Number(d) : '';
  });

  const [isInternalUpdate, setIsInternalUpdate] = useState(false);

  useEffect(() => {
    if (isInternalUpdate) {
      setIsInternalUpdate(false);
      return;
    }
    const pg = parseInt(params.get('page') || '1', 10);
    const s = params.get('search') || '';
    const d = params.get('departmentId');
    setPage(pg > 0 ? pg : 1);
    setSearch(s);
    setSearchInput(s);
    setFilterDeptId(d ? Number(d) : '');
  }, [searchString]);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<NoteForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NoteForm, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  // Files chosen while creating a new note (the note has no id yet, so they are
  // uploaded after the note is created). Edit mode uses the live panel instead.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);


  const isAdmin = can('manage_all_users');
  const canManageNotes = can('manage_uoi_notes');
  const canDownload = can('download_uoi_reports');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const notesParams = {
    page,
    pageSize,
    ...(filterDeptId !== '' ? { departmentId: filterDeptId as number } : {}),
    ...(search ? { search } : {}),
  };

  const { data, isLoading } = useListUoiNotes(notesParams, {
    query: {
      queryKey: getListUoiNotesQueryKey(notesParams),
    },
  });

  const deptQuery = useListDepartments({
    query: { queryKey: getListDepartmentsQueryKey(), staleTime: 5 * 60 * 1000 },
  });
  const departments = deptQuery.data?.departments ?? [];

  const canManageMasters = can('manage_master_data');
  const occasionsQuery = useListOccasions({
    query: { queryKey: getListOccasionsQueryKey(), staleTime: 5 * 60 * 1000 },
  });
  const occasionOptions = useMemo(() => {
    const active = (occasionsQuery.data?.occasions ?? [])
      .filter((o) => o.isActive)
      .map((o) => o.name);
    if (form.occasion && !active.includes(form.occasion)) active.push(form.occasion);
    return active;
  }, [occasionsQuery.data, form.occasion]);
  const createOccasionMutation = useCreateOccasion();
  const addOccasionOption = (option: string) => {
    const trimmed = option.trim();
    if (!trimmed) return;
    if (!canManageMasters) return;
    createOccasionMutation.mutate(
      { data: { name: trimmed } },
      { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListOccasionsQueryKey() }); } },
    );
  };

  // Create is driven via mutateAsync in handleSubmit so pending attachments can
  // be uploaded after the note id exists, before the modal closes.
  const createMutation = useCreateUoiNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUoiNotesQueryKey() });
      },
    },
  });

  const updateMutation = useUpdateUoiNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUoiNotesQueryKey() });
        setShowModal(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        setFormErrors({});
        setSubmitError('');
        setSuccessMsg('UOI Note updated successfully.');
        setTimeout(() => setSuccessMsg(''), 4000);
      },
      onError: (err: unknown) => {
        setSubmitError(getFriendlyErrorMessage(err, 'Failed to update note.'));
      },
    },
  });

  const deleteMutation = useDeleteUoiNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUoiNotesQueryKey() });
        setSuccessMsg('UOI Note deleted successfully.');
        setTimeout(() => setSuccessMsg(''), 4000);
      },
    },
  });

  const notes = data?.notes ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goToPage(next: number) {
    setIsInternalUpdate(true);
    setPage(next);
    navigate(buildUrl(next, pageSize, search, filterDeptId), { replace: true });
  }

  function handleSearchApply() {
    const s = searchInput.trim();
    setIsInternalUpdate(true);
    setSearch(s);
    setPage(1);
    navigate(buildUrl(1, pageSize, s, filterDeptId), { replace: true });
  }

  function handleDeptFilter(val: string) {
    const d = val === '' ? '' : Number(val);
    setIsInternalUpdate(true);
    setFilterDeptId(d as number | '');
    setPage(1);
    navigate(buildUrl(1, pageSize, search, d as number | ''), { replace: true });
  }

  // ---- Downloads (reflect the currently applied search/department filter) ----
  const REPORT_NAME = 'UOI Notes List';
  interface NoteRow {
    sl: number;
    title: string;
    department: string;
    date: string;
    location: string;
    occasion: string;
  }
  const noteColumns: ReportColumn<NoteRow>[] = [
    { key: 'sl', label: 'SL#', align: 'center' },
    { key: 'title', label: 'Title' },
    { key: 'department', label: 'Department' },
    { key: 'date', label: 'Date', align: 'center' },
    { key: 'location', label: 'Location' },
    { key: 'occasion', label: 'Occasion' },
  ];

  const filterSummaryLines = (recordCount: number): string[] => {
    const lines: string[] = [];
    if (search) lines.push(`Search: "${search}"`);
    if (filterDeptId !== '') {
      const dept = departments.find((d) => d.id === filterDeptId);
      lines.push(`Department: ${dept?.name ?? filterDeptId}`);
    }
    if (lines.length === 0) lines.push('Scope: All UOI notes');
    lines.push(`Records: ${recordCount}`);
    return lines;
  };

  async function fetchFilteredRows(): Promise<NoteRow[]> {
    const res = await listUoiNotes({
      all: true,
      ...(filterDeptId !== '' ? { departmentId: filterDeptId as number } : {}),
      ...(search ? { search } : {}),
    });
    return res.notes.map((n, idx) => ({
      sl: idx + 1,
      title: n.title || '—',
      department: n.departmentName || '—',
      date: n.date && n.date.trim() ? n.date : '—',
      location: n.location && n.location.trim() ? n.location : '—',
      occasion: n.occasion && n.occasion.trim() ? n.occasion : '—',
    }));
  }

  async function handleExcel() {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const rows = await fetchFilteredRows();
      const b = new ExcelBuilder(REPORT_NAME);
      b.setFilterSummary(filterSummaryLines(rows.length));
      b.addSheet({ name: 'UOI Notes', columns: noteColumns, rows });
      await b.download();
    } catch {
      setDownloadError('Failed to generate the download. Please try again.');
      setTimeout(() => setDownloadError(''), 5000);
    } finally {
      setIsDownloading(false);
    }
  }

  async function handlePdf() {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const rows = await fetchFilteredRows();
      const b = new PdfBuilder(REPORT_NAME);
      b.setOrientation('landscape');
      b.setFilterSummary(filterSummaryLines(rows.length));
      b.addSection({ columns: noteColumns, rows });
      await b.download();
    } catch {
      setDownloadError('Failed to generate the download. Please try again.');
      setTimeout(() => setDownloadError(''), 5000);
    } finally {
      setIsDownloading(false);
    }
  }

  function validate(): boolean {
    const e: Partial<Record<keyof NoteForm, string>> = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.date) e.date = 'Date is required';
    if (form.departmentId === '') e.departmentId = 'Department is required';
    if (!form.description.trim()) e.description = 'Description is required';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      title: form.title.trim(),
      date: toAppDate(form.date),
      departmentId: form.departmentId as number,
      ...(form.occasion.trim() ? { occasion: form.occasion.trim() } : {}),
      ...(form.location.trim() ? { location: form.location.trim() } : {}),
      description: form.description.trim(),
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: payload });
      return;
    }

    // Create: persist the note, then upload any files chosen before the note
    // existed. The note is saved even if an attachment upload later fails, so we
    // surface a partial-success warning rather than rolling back.
    setSubmitError('');
    setAttachmentBusy(true);
    try {
      const res = await createMutation.mutateAsync({ data: payload });
      const newId = res.note.id;
      const failed: string[] = [];
      for (const file of pendingFiles) {
        try {
          await uploadUoiNoteAttachment(newId, file);
        } catch {
          failed.push(file.name);
        }
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      setPendingFiles([]);
      setFormErrors({});
      setSubmitError('');
      if (failed.length > 0) {
        setSuccessMsg(`UOI Note added. Some files failed to upload: ${failed.join(', ')}`);
      } else {
        setSuccessMsg('UOI Note added successfully.');
      }
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setSubmitError(getFriendlyErrorMessage(err, 'Failed to save note.'));
    } finally {
      setAttachmentBusy(false);
    }
  }

  function handlePendingFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSubmitError('');
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';
    const accepted: File[] = [];
    for (const file of chosen) {
      const err = validateUoiNoteFile(file);
      if (err) {
        setSubmitError(`${file.name}: ${err}`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length > 0) {
      setPendingFiles(prev => [...prev, ...accepted]);
    }
  }

  function removePendingFile(idx: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function openEdit(note: (typeof notes)[number]) {
    setEditingId(note.id);
    setForm({
      title: note.title,
      date: fromAppDate(note.date),
      departmentId: note.departmentId,
      occasion: note.occasion ?? '',
      location: note.location ?? '',
      description: note.description,
    });
    setFormErrors({});
    setSubmitError('');
    setShowModal(true);
  }

  function handleReset() {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setSubmitError('');
    setPendingFiles([]);
  }

  function handleCloseModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setSubmitError('');
    setPendingFiles([]);
  }

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <div className="page-header">
            <h4>{canManageNotes ? 'Manage HCM UOI notes' : 'HCM UOI notes'}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {canDownload && (
                <ReportDownloadButtons
                  onExcel={() => { void handleExcel(); }}
                  onPdf={() => { void handlePdf(); }}
                  disabled={isDownloading || isLoading || total === 0}
                />
              )}
              {canManageNotes && (
                <button
                  style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setShowModal(true)}
                >
                  <i className="bi bi-plus-circle"></i> Add HCM UOI Notes
                </button>
              )}
            </div>
          </div>

          {successMsg && (
            <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 2000, background: '#166534', color: '#fff', padding: '12px 20px', borderRadius: 8, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}>
              <i className="bi bi-check-circle-fill"></i> {successMsg}
            </div>
          )}

          {downloadError && (
            <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 2000, background: '#991b1b', color: '#fff', padding: '12px 20px', borderRadius: 8, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}>
              <i className="bi bi-exclamation-triangle-fill"></i> {downloadError}
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-body">
              <div className="form-grid" style={{ marginBottom: 0 }}>
                <div className="form-group">
                  <label>Search by Title</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Search title…"
                      value={searchInput}
                      onChange={e => setSearchInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSearchApply(); }}
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={handleSearchApply}
                      style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 5, padding: '0 14px', cursor: 'pointer', fontSize: 13 }}
                    >
                      Search
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Filter by Department</label>
                  <select value={filterDeptId} onChange={e => handleDeptFilter(e.target.value)}>
                    <option value="">All Departments</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl#</th>
                      <th>Title</th>
                      <th>Department</th>
                      <th>Date</th>
                      <th>Location</th>
                      <th>Occasion</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 24 }}>Loading…</td>
                      </tr>
                    ) : notes.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 24 }}>No data available</td>
                      </tr>
                    ) : (
                      notes.map((note, idx) => (
                        <tr key={note.id}>
                          <td>{(page - 1) * pageSize + idx + 1}</td>
                          <td>{note.title}</td>
                          <td>{note.departmentName}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{note.date}</td>
                          <td>{note.location ?? '—'}</td>
                          <td>{note.occasion ?? '—'}</td>
                          <td>
                            {(() => {
                              const isOwner = user != null && note.createdBy === user.id;
                              const canEdit = isOwner;
                              const canDelete = isAdmin || isOwner;
                              if (!canEdit && !canDelete) {
                                return <span style={{ color: '#999', fontSize: 12 }}>—</span>;
                              }
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  {canEdit && (
                                    <button
                                      onClick={() => openEdit(note)}
                                      title="Edit"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a3a5c', fontSize: 16 }}
                                    >
                                      <i className="bi bi-pencil-square"></i>
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      onClick={() => {
                                        void confirm({
                                          title: 'Delete this UOI Note?',
                                          message: `"${note.title}" will be permanently deleted. This action is irreversible.`,
                                          confirmLabel: 'Yes, Delete',
                                          variant: 'danger',
                                          onConfirm: async () => {
                                            await deleteMutation.mutateAsync({ id: note.id });
                                          },
                                        });
                                      }}
                                      title="Delete"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}
                                    >
                                      <i className="bi bi-trash"></i>
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 13, color: '#555' }}>
                <span>
                  {isLoading ? '' : `Showing ${total === 0 ? 0 : (page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} records`}
                </span>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => goToPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: page === 1 ? '#f3f4f6' : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
                    >
                      Prev
                    </button>
                    <span>Page {page} of {totalPages}</span>
                    <button
                      onClick={() => goToPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: page === totalPages ? '#f3f4f6' : '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) handleCloseModal(); }}
        >
          <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0' }}>
              <h5 style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>{editingId !== null ? 'Edit HCM UOI Notes' : 'Add HCM UOI Notes'}</h5>
              <button onClick={handleCloseModal} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {submitError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>
                    {submitError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                      Title <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', border: `1px solid ${formErrors.title ? '#fca5a5' : '#d1d5db'}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                    />
                    {formErrors.title && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 3 }}>{formErrors.title}</div>}
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                      Date <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${formErrors.date ? '#fca5a5' : '#d1d5db'}`, borderRadius: 6, overflow: 'hidden' }}>
                      <input
                        type="date"
                        value={form.date}
                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                        style={{ flex: 1, padding: '8px 12px', border: 'none', outline: 'none', fontSize: 14 }}
                      />
                      <span style={{ padding: '0 10px', color: '#6b7280', fontSize: 16 }}>
                        <i className="bi bi-calendar3"></i>
                      </span>
                    </div>
                    {formErrors.date && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 3 }}>{formErrors.date}</div>}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                    Tag Department <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={form.departmentId}
                      onChange={e => setForm(f => ({ ...f, departmentId: e.target.value === '' ? '' : Number(e.target.value) }))}
                      style={{ width: '100%', padding: '8px 12px', border: `1px solid ${formErrors.departmentId ? '#fca5a5' : '#d1d5db'}`, borderRadius: 6, fontSize: 14, appearance: 'none', background: '#fff', boxSizing: 'border-box' }}
                    >
                      <option value="">-- Select --</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }}>▾</span>
                  </div>
                  {formErrors.departmentId && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 3 }}>{formErrors.departmentId}</div>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Occasion</label>
                    <CreatableSelect
                      options={occasionOptions}
                      value={form.occasion}
                      onChange={(val) => setForm(f => ({ ...f, occasion: val as string }))}
                      onAddOption={addOccasionOption}
                      placeholder={canManageMasters ? 'Select or add occasion...' : 'Select or type occasion...'}
                      canCreate={true}
                    />
                    {!canManageMasters && (
                      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                        Typed values are stored on this note only. Only admins can add to the Occasions master list.
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Location</label>
                    <input
                      type="text"
                      placeholder="Enter location"
                      value={form.location}
                      onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                    Description <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <textarea
                    placeholder="Enter Description"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={5}
                    style={{ width: '100%', padding: '8px 12px', border: `1px solid ${formErrors.description ? '#fca5a5' : '#d1d5db'}`, borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  {formErrors.description && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 3 }}>{formErrors.description}</div>}
                </div>

                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 18 }}>
                  {editingId !== null ? (
                    <UoiNoteAttachmentsPanel
                      noteId={editingId}
                      canUpload={true}
                      canDeleteRow={(att) => isAdmin || (user != null && att.uploadedBy === user.id)}
                    />
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#333', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i className="bi bi-paperclip"></i> Attachments {pendingFiles.length > 0 && `(${pendingFiles.length})`}
                        </div>
                        <div>
                          <input
                            type="file"
                            accept={UOI_ALLOWED_EXTENSIONS}
                            multiple
                            onChange={handlePendingFileChange}
                            id="uoi-pending-upload"
                            style={{ display: 'none' }}
                          />
                          <label
                            htmlFor="uoi-pending-upload"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#1a3a5c', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                          >
                            <i className="bi bi-plus-lg"></i> Add File
                          </label>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
                        PDF or JPG only, up to 10MB each. Files upload when you submit the note.
                      </div>
                      {pendingFiles.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#999', fontStyle: 'italic' }}>No files selected.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {pendingFiles.map((file, idx) => (
                            <div key={`${file.name}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                              <i className={`bi ${file.type.includes('pdf') ? 'bi-file-earmark-pdf-fill' : 'bi-file-earmark-image-fill'}`} style={{ fontSize: 24, color: file.type.includes('pdf') ? '#dc2626' : '#16a34a' }}></i>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#333', wordBreak: 'break-word' }}>{file.name}</div>
                                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{(file.size / 1024).toFixed(1)} KB</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removePendingFile(idx)}
                                title="Remove file"
                                style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 17, padding: 4 }}
                              >
                                <i className="bi bi-x-lg"></i>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, background: '#fafafa', borderRadius: '0 0 10px 10px' }}>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending || attachmentBusy}
                  style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 28px', fontSize: 14, fontWeight: 600, cursor: (createMutation.isPending || updateMutation.isPending || attachmentBusy) ? 'not-allowed' : 'pointer', opacity: (createMutation.isPending || updateMutation.isPending || attachmentBusy) ? 0.7 : 1 }}
                >
                  {(createMutation.isPending || updateMutation.isPending || attachmentBusy) ? 'Saving…' : editingId !== null ? 'Update' : 'Submit'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{ background: '#fff', color: '#e05e8a', border: '1px solid #e05e8a', borderRadius: 6, padding: '9px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
