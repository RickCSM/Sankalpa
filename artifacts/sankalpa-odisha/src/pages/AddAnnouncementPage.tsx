import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useRoute } from 'wouter';
import Layout from '@/components/Layout';
import { prominentLocations, lookupProminentLocation } from '@/data/mockData';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import CreatableSelect from '@/components/CreatableSelect';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAnnouncement,
  getGetAnnouncementQueryKey,
  listAnnouncements,
  useListDistricts,
  getListDistrictsQueryKey,
  useListBlocks,
  getListBlocksQueryKey,
  useListOccasions,
  getListOccasionsQueryKey,
  useCreateOccasion,
  useCreateDistrict,
  useCreateBlock,
  useListDepartments,
  getListDepartmentsQueryKey,
  useCreateDepartment,
} from '@workspace/api-client-react';

interface EditAnnouncement {
  id: number;
  title: string;
  date: string;
  description: string;
  department: string;
  occasion: string;
  location: string;
  district: string;
  block: string;
  category: string;
  otherCategory: string;
  tags: string[];
  workflowStatus: string;
  createdBy: number;
  acceptedByDeptNodalId?: number;
  reconsiderationRequested?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);
const ALLOWED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg';

// Fixed sub-options shown when "Other" is selected as the Announcement Category.
// These are NOT master-data categories: the chosen (or custom-typed) value is
// stored in the announcement's `otherCategory` field, with `category = "Other"`.
const OTHER_CATEGORY_SUBOPTIONS = [
  'Roads',
  'Bridges',
  'Buildings',
  'Irrigation',
  'Culture',
  'Tourism',
];

interface QueuedFile {
  file: File;
  id: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function QueuedFileModal({ file, onClose }: { file: File; onClose: () => void }) {
  const [blobUrl] = useState(() => URL.createObjectURL(file));
  const isImage = file.type.startsWith('image/');

  useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: '#1a3a5c',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {file.name}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {formatFileSize(file.size)} · Queued (not yet uploaded)
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: 'transparent', border: '1px solid #d1d5db',
              borderRadius: 6, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 18, color: '#374151',
            }}
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div style={{
          flex: 1, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f8fafc', padding: isImage ? 20 : 0,
        }}>
          {isImage ? (
            <img
              src={blobUrl}
              alt={file.name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }}
            />
          ) : (
            <embed
              src={blobUrl}
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

export default function AddAnnouncementPage() {
  const [, navigate] = useLocation();
  const { user, can } = useAuth();
  const { addAnnouncement, updateAnnouncement } = useAppState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editMatch, editParams] = useRoute('/announcements/:id/edit');
  const editId = editMatch && editParams?.id ? parseInt(editParams.id) : null;
  // Fetch the announcement under edit by ID directly — no global cache
  // dependency, so items beyond the first 200 remain editable.
  const editQuery = useGetAnnouncement(editId ?? 0, {
    query: { queryKey: getGetAnnouncementQueryKey(editId ?? 0), enabled: !!editId },
  });
  const editAnnouncement = useMemo<EditAnnouncement | null>(() => {
    const a = editQuery.data?.announcement;
    if (!a) return null;
    return {
      id: a.id,
      title: a.title,
      date: a.date,
      description: a.description,
      department: a.department ?? '',
      occasion: a.occasion ?? '',
      location: a.location ?? '',
      district: a.district ?? '',
      block: a.block ?? '',
      category: a.category ?? '',
      otherCategory: a.otherCategory ?? '',
      tags: a.tags ?? [],
      workflowStatus: a.workflowStatus,
      createdBy: a.createdBy,
      acceptedByDeptNodalId: a.acceptedByDeptNodalId ?? undefined,
      reconsiderationRequested: a.reconsiderationRequested ?? false,
    };
  }, [editQuery.data]);
  const isEditMode = !!editAnnouncement;

  const [formData, setFormData] = useState({
    title: '',
    date: '',
    description: '',
    department: '',
    occasion: '',
    location: '',
    district: '',
    block: '',
    category: '',
    otherCategory: '',
    tags: [] as string[],
  });
  const { categoryOptions: activeCategoryOptions, tagOptions: activeTagOptions, addCategoryOption, addTagOption } = useAppState();
  const canManageMasterData = can('manage_master_data');
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [previewFile, setPreviewFile] = useState<QueuedFile | null>(null);
  const [titleError, setTitleError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [occasionError, setOccasionError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [fileError, setFileError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<{ id: number; uniqueId: string; title: string; date: string }[]>([]);

  useEffect(() => {
    if (editAnnouncement) {
      const canEditThis =
        (['draft', 'reverted_by_cmo', 'pending_cmo_reconsideration', 'pending_cmo_review'].includes(editAnnouncement.workflowStatus) &&
          (editAnnouncement.createdBy === user?.id || user?.role === 'admin')) ||
        (editAnnouncement.workflowStatus === 'reverted_by_dept_reviewer' && user?.role === 'dept_nodal' && !!user?.department && editAnnouncement.department === user.department);
      if (!canEditThis) {
        navigate(`/announcements/${editAnnouncement.id}`);
        return;
      }
      setFormData({
        title: editAnnouncement.title || '',
        date: editAnnouncement.date || '',
        description: editAnnouncement.description || '',
        department: editAnnouncement.department || '',
        occasion: editAnnouncement.occasion || '',
        location: editAnnouncement.location || '',
        district: editAnnouncement.district || '',
        block: editAnnouncement.block || '',
        category: editAnnouncement.category || '',
        otherCategory: editAnnouncement.otherCategory || '',
        tags: editAnnouncement.tags || [],
      });
    } else if (editId) {
      navigate('/announcements');
    }
  }, [editAnnouncement, editId, user, navigate]);

  useEffect(() => {
    if (!isEditMode && !can('create_announcement')) {
      navigate('/announcements');
    }
  }, [can, navigate, isEditMode]);

  const handleChange = (field: string, value: string) => {
    if (field === 'district') {
      setFormData(prev => ({ ...prev, district: value, block: '' }));
      return;
    }
    if (field === 'location') {
      const match = lookupProminentLocation(value);
      setFormData(prev => {
        const next = { ...prev, location: value };
        if (match) {
          if (!prev.district) next.district = match.district;
          if (match.block && (!prev.block || (prev.district && prev.district !== match.district))) {
            next.district = match.district;
            next.block = match.block;
          }
        }
        return next;
      });
      return;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const districtsQuery = useListDistricts({ query: { queryKey: getListDistrictsQueryKey() } });
  const activeDistricts = useMemo(
    () => (districtsQuery.data?.districts ?? []).filter((d) => d.isActive),
    [districtsQuery.data],
  );
  const allDistricts = districtsQuery.data?.districts ?? [];
  const districtIdByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of allDistricts) m.set(d.name, d.id);
    return m;
  }, [allDistricts]);
  const selectedDistrictId = formData.district ? districtIdByName.get(formData.district) ?? null : null;
  const blocksParams = selectedDistrictId ? { districtId: selectedDistrictId } : undefined;
  const blocksQuery = useListBlocks(blocksParams, {
    query: {
      queryKey: getListBlocksQueryKey(blocksParams),
      enabled: selectedDistrictId !== null,
    },
  });
  const availableBlocks = useMemo(() => {
    const all = blocksQuery.data?.blocks ?? [];
    const active = all.filter((b) => b.isActive).map((b) => b.name);
    if (formData.block && !active.includes(formData.block)) active.push(formData.block);
    return active;
  }, [blocksQuery.data, formData.block]);

  const occasionsQuery = useListOccasions({ query: { queryKey: getListOccasionsQueryKey() } });
  const occasionOptions = useMemo(() => {
    const active = (occasionsQuery.data?.occasions ?? [])
      .filter((o) => o.isActive)
      .map((o) => o.name);
    if (formData.occasion && !active.includes(formData.occasion)) active.push(formData.occasion);
    return active;
  }, [occasionsQuery.data, formData.occasion]);
  const createOccasionMutation = useCreateOccasion();
  const createDistrictMutation = useCreateDistrict();
  const createBlockMutation = useCreateBlock();
  const createDepartmentMutation = useCreateDepartment();

  // Departments are master-driven; keep current form value visible even if disabled.
  const departmentsQuery = useListDepartments({ query: { queryKey: getListDepartmentsQueryKey() } });
  const allDepartments = departmentsQuery.data?.departments ?? [];
  const activeDepartments = useMemo(() => allDepartments.filter((d) => d.isActive), [allDepartments]);
  const departmentOptionsWithFallback = useMemo(() => {
    const names = activeDepartments.map((d) => d.name);
    if (formData.department && !names.includes(formData.department)) names.push(formData.department);
    return names;
  }, [activeDepartments, formData.department]);
  const addDepartmentToMaster = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !canManageMasterData) return;
    createDepartmentMutation.mutate(
      { data: { name: trimmed } },
      { onSuccess: () => { void occasionsQueryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() }); } },
    );
  };

  // Category/tag options come from AppStateContext (already filtered to active).
  // Re-inject the current form value if it points at a now-disabled master entry.
  const categoryOptionsWithFallback = useMemo(() => {
    const opts = [...activeCategoryOptions];
    if (formData.category && !opts.includes(formData.category)) opts.push(formData.category);
    return opts;
  }, [activeCategoryOptions, formData.category]);
  // Sub-options shown when "Other" is the selected category. Re-inject any
  // custom-typed value so editing an existing "Other" announcement keeps its
  // stored value visible/selectable even if it isn't one of the six fixed ones.
  const otherCategoryOptionsWithFallback = useMemo(() => {
    const opts = [...OTHER_CATEGORY_SUBOPTIONS];
    if (formData.otherCategory && !opts.includes(formData.otherCategory)) {
      opts.push(formData.otherCategory);
    }
    return opts;
  }, [formData.otherCategory]);
  const tagOptionsWithFallback = useMemo(() => {
    const opts = [...activeTagOptions];
    for (const t of formData.tags) if (t && !opts.includes(t)) opts.push(t);
    return opts;
  }, [activeTagOptions, formData.tags]);
  const addDistrictToMaster = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !canManageMasterData) return;
    createDistrictMutation.mutate(
      { data: { name: trimmed } },
      { onSuccess: () => { void occasionsQueryClient.invalidateQueries({ queryKey: getListDistrictsQueryKey() }); } },
    );
  };
  const addBlockToMaster = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !canManageMasterData || !selectedDistrictId) return;
    createBlockMutation.mutate(
      { data: { name: trimmed, districtId: selectedDistrictId } },
      { onSuccess: () => { void occasionsQueryClient.invalidateQueries({ queryKey: getListBlocksQueryKey(blocksParams) }); } },
    );
  };
  const occasionsQueryClient = useQueryClient();
  const addOccasionOption = (option: string) => {
    const trimmed = option.trim();
    if (!trimmed) return;
    // Only admins can persist to the master list. Non-admins still see the
    // value applied to their form (CreatableSelect calls handleSelect after
    // onAddOption), but we don't attempt the POST that they aren't allowed
    // to make.
    if (!canManageMasterData) return;
    createOccasionMutation.mutate(
      { data: { name: trimmed } },
      { onSuccess: () => { void occasionsQueryClient.invalidateQueries({ queryKey: getListOccasionsQueryKey() }); } },
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    const accepted: QueuedFile[] = [];
    for (const f of selected) {
      if (!ALLOWED_TYPES.has(f.type)) {
        setFileError(`"${f.name}": Only PDF, JPEG, or PNG files are allowed.`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        setFileError(`"${f.name}": exceeds 10MB limit.`);
        continue;
      }
      accepted.push({ file: f, id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}` });
    }
    if (accepted.length > 0) setQueued(prev => [...prev, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeQueued = (id: string) => setQueued(prev => prev.filter(q => q.id !== id));

  const handleReset = () => {
    if (isEditMode && editAnnouncement) {
      setFormData({
        title: editAnnouncement.title || '',
        date: editAnnouncement.date || '',
        description: editAnnouncement.description || '',
        department: editAnnouncement.department || '',
        occasion: editAnnouncement.occasion || '',
        location: editAnnouncement.location || '',
        district: editAnnouncement.district || '',
        block: editAnnouncement.block || '',
        category: editAnnouncement.category || '',
        otherCategory: editAnnouncement.otherCategory || '',
        tags: editAnnouncement.tags || [],
      });
      setQueued([]);
    } else {
      setFormData({ title: '', date: '', description: '', department: '', occasion: '', location: '', district: '', block: '', category: '', otherCategory: '', tags: [] });
      setQueued([]);
    }
    setFileError('');
  };

  const buildPayload = () => ({
    title: formData.title,
    date: formData.date,
    description: formData.description,
    department: formData.department,
    occasion: formData.occasion,
    location: formData.location,
    district: formData.district,
    block: formData.block,
    category: formData.category,
    // Only send the free-text value when "Other" is selected. When switching to
    // a real category, omit it — the server clears the stored value off the
    // category change, so an undefined here is intentional.
    otherCategory: formData.category === 'Other' ? formData.otherCategory.trim() : undefined,
    tags: formData.tags,
  });

  // Duplicate detection now hits the server (search filter) so we are not
  // bounded by a global capped client cache.
  const findDuplicates = async (): Promise<{ id: number; uniqueId: string; title: string; date: string }[]> => {
    const titleKey = formData.title.trim().toLowerCase();
    const occasionKey = formData.occasion.trim().toLowerCase();
    if (!titleKey) return [];
    const rejectedStates = new Set(['draft', 'reverted_by_cmo', 'pending_cmo_reconsideration']);
    try {
      const res = await listAnnouncements({ search: formData.title.trim(), pageSize: 200 });
      return (res.announcements ?? [])
        .filter(a => (!isEditMode || a.id !== editId))
        .filter(a => !rejectedStates.has(a.workflowStatus))
        .filter(a =>
          a.title.trim().toLowerCase() === titleKey &&
          (a.occasion || '').trim().toLowerCase() === occasionKey
        )
        .map(a => ({ id: a.id, uniqueId: a.uniqueId, title: a.title, date: a.date }));
    } catch {
      return [];
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.department) return;
    if (!/[a-zA-Z0-9]/.test(formData.title.trim())) {
      setTitleError('Title must contain at least one letter or digit.');
      return;
    }
    setTitleError('');
    if (!formData.location.trim()) {
      setLocationError('Location is required.');
      return;
    }
    setLocationError('');
    if (!formData.occasion.trim()) {
      setOccasionError('Occasion is required.');
      return;
    }
    setOccasionError('');
    if (formData.category === 'Other' && !formData.otherCategory.trim()) {
      setCategoryError('Please specify the category.');
      return;
    }
    setCategoryError('');
    const dups = await findDuplicates();
    setDuplicateMatches(dups);
    setShowConfirm(true);
  };

  // Sequentially upload + register every queued file against the new
  // announcement id. Each upload uses the token-bound flow so the server
  // can verify {actor, announcementId, objectPath} before recording the row.
  const uploadQueuedFor = async (announcementId: number) => {
    for (let i = 0; i < queued.length; i++) {
      const q = queued[i]!;
      setProgressMsg(`Uploading ${i + 1}/${queued.length}: ${q.file.name}`);
      const tokenRes = await fetch('/api/storage/uploads/request-url', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: q.file.name,
          size: q.file.size,
          contentType: q.file.type || 'application/octet-stream',
          announcementId,
        }),
      });
      if (!tokenRes.ok) throw new Error(`Upload URL failed for ${q.file.name}`);
      const td = (await tokenRes.json()) as { uploadURL: string; objectPath: string; uploadToken: string };
      const putRes = await fetch(td.uploadURL, {
        method: 'PUT',
        body: q.file,
        headers: { 'Content-Type': q.file.type || 'application/octet-stream' },
      });
      if (!putRes.ok) throw new Error(`PUT failed for ${q.file.name}`);
      const regRes = await fetch(`/api/announcements/${announcementId}/attachments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectPath: td.objectPath,
          fileName: q.file.name,
          fileSize: q.file.size,
          contentType: q.file.type || 'application/octet-stream',
          uploadToken: td.uploadToken,
        }),
      });
      if (!regRes.ok) throw new Error(`Register failed for ${q.file.name}`);
    }
  };

  const performSubmit = async () => {
    setSubmitting(true);
    setFileError('');
    try {
      const payload = buildPayload();
      let targetId: number | null;
      if (isEditMode && editId) {
        setProgressMsg('Saving changes…');
        const ok = await updateAnnouncement(editId, payload);
        if (!ok) {
          // Update failed (e.g. optimistic-concurrency version mismatch).
          // Do NOT proceed to upload attachments — they would attach to a
          // submission that never actually changed.
          throw new Error('Failed to save changes. The announcement may have been updated by someone else; please refresh and try again.');
        }
        targetId = editId;
      } else {
        setProgressMsg('Creating announcement…');
        targetId = await addAnnouncement(payload);
      }
      if (targetId && queued.length > 0) {
        await uploadQueuedFor(targetId);
      }
      setShowConfirm(false);
      navigate(isEditMode && editId ? `/announcements/${editId}` : '/announcements');
    } catch (err) {
      const msg = getFriendlyErrorMessage(err, 'Submission failed. Please try again.');
      if (/letter or digit/i.test(msg)) {
        // Server rejected the title — surface the exact server message on the
        // title field so the user can fix it inline.
        setShowConfirm(false);
        setTitleError(msg);
      } else if (/version mismatch|updated by someone/i.test(msg)) {
        setFileError('The announcement was updated by someone else — please refresh and try again.');
      } else {
        setFileError(msg);
      }
    } finally {
      setSubmitting(false);
      setProgressMsg(null);
    }
  };

  return (
    <>
    {previewFile && <QueuedFileModal file={previewFile.file} onClose={() => setPreviewFile(null)} />}
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <div className="page-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => isEditMode && editId ? navigate(`/announcements/${editId}`) : navigate('/announcements')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a3a5c', fontSize: 20, display: 'flex', alignItems: 'center' }}
              >
                <i className="bi bi-arrow-left-circle-fill"></i>
              </button>
              <h4 style={{ margin: 0 }}>{isEditMode ? 'Edit Announcement' : 'Add HCM Announcement'}</h4>
            </div>
          </div>

          {editAnnouncement?.workflowStatus === 'pending_cmo_review' && (
            <div style={{
              background: '#eff6ff', border: '1px solid #93c5fd',
              borderRadius: 8, padding: '12px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <i className="bi bi-info-circle-fill" style={{ color: '#2563eb', fontSize: 16, marginTop: 1, flexShrink: 0 }}></i>
              <div style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
                <strong>Currently in CMO Review.</strong> Saving your changes will immediately resubmit this announcement for CMO review. The assigned reviewer will be notified of the updated version.
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="form-group form-group-full">
                    <label>Title <span className="required">*</span></label>
                    <input
                      type="text"
                      placeholder="Enter title"
                      value={formData.title}
                      onChange={e => { handleChange('title', e.target.value); if (titleError) setTitleError(''); }}
                      required
                    />
                    {titleError && (
                      <div style={{ color: '#dc3545', fontSize: 12, marginTop: 4 }}>{titleError}</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>HCM Announcement Date <span className="required">*</span></label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={e => handleChange('date', e.target.value)}
                      min="1900-01-01"
                      max={new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </div>

                  <div className="form-group form-group-full">
                    <label>Department <span className="required">*</span></label>
                    <select
                      value={formData.department}
                      onChange={e => handleChange('department', e.target.value)}
                      required
                    >
                      <option value="">Select Department</option>
                      {departmentOptionsWithFallback.map(dept => (
                        <option key={dept} value={dept}>
                          {dept}{formData.department === dept && !activeDepartments.some(d => d.name === dept) ? ' (not in master)' : ''}
                        </option>
                      ))}
                    </select>
                    {canManageMasterData && formData.department && !allDepartments.some(d => d.name === formData.department) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-link"
                        style={{ padding: 0, marginTop: 4 }}
                        onClick={() => addDepartmentToMaster(formData.department)}
                        disabled={createDepartmentMutation.isPending}
                      >
                        <i className="bi bi-plus-circle" style={{ marginRight: 4 }}></i>
                        Add "{formData.department}" to department master
                      </button>
                    )}
                  </div>

                  <div className="form-group form-group-full">
                    <label>Description <span className="required">*</span></label>
                    <textarea
                      placeholder="Enter Description"
                      rows={4}
                      value={formData.description}
                      onChange={e => handleChange('description', e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Location <span className="required">*</span></label>
                    <input
                      type="text"
                      placeholder="Enter location (e.g. Bhubaneswar, Cuttack)"
                      value={formData.location}
                      onChange={e => { handleChange('location', e.target.value); if (locationError) setLocationError(''); }}
                      list="prominent-locations"
                      required
                    />
                    <datalist id="prominent-locations">
                      {Object.keys(prominentLocations).map(c => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    {locationError && (
                      <div style={{ color: '#dc3545', fontSize: 12, marginTop: 4 }}>{locationError}</div>
                    )}
                    {!locationError && lookupProminentLocation(formData.location) && (
                      <div style={{ fontSize: 11, color: '#0a8a4a', marginTop: 4 }}>
                        <i className="bi bi-check-circle"></i> District auto-filled from known city
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Occasion <span className="required">*</span></label>
                    <CreatableSelect
                      options={occasionOptions}
                      value={formData.occasion}
                      onChange={(val) => { handleChange('occasion', val as string); if (occasionError) setOccasionError(''); }}
                      onAddOption={addOccasionOption}
                      placeholder={canManageMasterData ? "Select or add occasion..." : "Select or type occasion..."}
                      canCreate={true}
                    />
                    {canManageMasterData && formData.occasion && !(occasionsQuery.data?.occasions ?? []).some((o) => o.name === formData.occasion) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-link"
                        style={{ padding: 0, marginTop: 4 }}
                        onClick={() => addOccasionOption(formData.occasion)}
                        disabled={createOccasionMutation.isPending}
                      >
                        <i className="bi bi-plus-circle" style={{ marginRight: 4 }}></i>
                        Add "{formData.occasion}" to occasion master
                      </button>
                    )}
                    {!canManageMasterData && formData.occasion && !(occasionsQuery.data?.occasions ?? []).some((o) => o.isActive && o.name === formData.occasion) && (
                      <div style={{ fontSize: 11, color: '#b54708', marginTop: 4 }}>
                        <i className="bi bi-flag" style={{ marginRight: 4 }}></i>
                        "{formData.occasion}" is not in the Occasions master and will be flagged for admin review.
                      </div>
                    )}
                    {!canManageMasterData && (
                      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                        Typed values are stored on this announcement only. Only admins can add to the Occasions master list.
                      </div>
                    )}
                    {occasionError && (
                      <div style={{ color: '#dc3545', fontSize: 12, marginTop: 4 }}>{occasionError}</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>District</label>
                    <select
                      value={formData.district}
                      onChange={e => handleChange('district', e.target.value)}
                    >
                      <option value="">Select District</option>
                      {activeDistricts.map(d => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                      {formData.district && !activeDistricts.some(d => d.name === formData.district) && (
                        <option value={formData.district}>{formData.district} (not in master)</option>
                      )}
                    </select>
                    {canManageMasterData && formData.district && !allDistricts.some(d => d.name === formData.district) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-link"
                        style={{ padding: 0, marginTop: 4 }}
                        onClick={() => addDistrictToMaster(formData.district)}
                        disabled={createDistrictMutation.isPending}
                      >
                        <i className="bi bi-plus-circle" style={{ marginRight: 4 }}></i>
                        Add "{formData.district}" to district master
                      </button>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Block</label>
                    <select
                      value={formData.block}
                      onChange={e => handleChange('block', e.target.value)}
                      disabled={!formData.district}
                      style={!formData.district ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                    >
                      <option value="">{formData.district ? 'Select Block' : '-- Select District first --'}</option>
                      {availableBlocks.map(b => (
                        <option key={b} value={b}>
                          {b}{formData.block === b && !(blocksQuery.data?.blocks ?? []).some(bb => bb.name === b && bb.isActive) ? ' (not in master)' : ''}
                        </option>
                      ))}
                    </select>
                    {canManageMasterData && formData.block && selectedDistrictId && !(blocksQuery.data?.blocks ?? []).some(b => b.name === formData.block) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-link"
                        style={{ padding: 0, marginTop: 4 }}
                        onClick={() => addBlockToMaster(formData.block)}
                        disabled={createBlockMutation.isPending}
                      >
                        <i className="bi bi-plus-circle" style={{ marginRight: 4 }}></i>
                        Add "{formData.block}" to block master
                      </button>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Announcement Category</label>
                    <CreatableSelect
                      options={categoryOptionsWithFallback}
                      value={formData.category}
                      onChange={(val) => {
                        const next = val as string;
                        setFormData(prev => ({
                          ...prev,
                          category: next,
                          // Clear the free-text value when switching away from
                          // "Other" so a stale value isn't submitted.
                          otherCategory: next === 'Other' ? prev.otherCategory : '',
                        }));
                        if (next !== 'Other') setCategoryError('');
                      }}
                      onAddOption={addCategoryOption}
                      placeholder={canManageMasterData ? "Select or add category..." : "Select category..."}
                      canCreate={canManageMasterData}
                    />
                    {formData.category === 'Other' && (
                      <div style={{ marginTop: 8 }}>
                        <label htmlFor="otherCategory">Specify Category</label>
                        <CreatableSelect
                          options={otherCategoryOptionsWithFallback}
                          value={formData.otherCategory}
                          onChange={(val) => {
                            const next = val as string;
                            setFormData(prev => ({ ...prev, otherCategory: next }));
                            if (next.trim()) setCategoryError('');
                          }}
                          onAddOption={() => { /* Custom value lives on the announcement, not master data. */ }}
                          placeholder="Select or type a category..."
                          canCreate
                        />
                        {categoryError && (
                          <div style={{ color: '#dc3545', fontSize: 12, marginTop: 4 }}>{categoryError}</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Relevant Tags</label>
                    <CreatableSelect
                      options={tagOptionsWithFallback}
                      value={formData.tags}
                      onChange={(val) => setFormData(prev => ({ ...prev, tags: val as string[] }))}
                      onAddOption={addTagOption}
                      placeholder={canManageMasterData ? "Select or add tags..." : "Select tags..."}
                      canCreate={canManageMasterData}
                      multi
                    />
                  </div>

                  <div className="form-group form-group-full">
                    <label>Attachments {queued.length > 0 && <span style={{ color: '#888', fontWeight: 400 }}>({queued.length} queued)</span>}</label>
                    {isEditMode && (
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                        <i className="bi bi-info-circle" style={{ marginRight: 4 }}></i>
                        Existing attachments are managed from the announcement detail page after saving.
                      </div>
                    )}
                    <div className="file-upload-area">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ALLOWED_EXTENSIONS}
                        onChange={handleFileChange}
                        id="file-upload"
                        multiple
                        style={{ display: 'none' }}
                      />
                      {queued.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {queued.map(q => (
                            <div className="file-preview" key={q.id}>
                              <div className="file-info">
                                <i className={`bi ${q.file.type.includes('pdf') ? 'bi-file-earmark-pdf' : 'bi-file-earmark-image'}`} style={{ fontSize: 24, color: '#1a3a5c' }}></i>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{q.file.name}</div>
                                  <div style={{ fontSize: 11, color: '#888' }}>{formatFileSize(q.file.size)}</div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => setPreviewFile(q)}
                                  title="Preview file"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '5px 12px', background: '#1a3a5c', color: '#fff',
                                    border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <i className="bi bi-eye"></i> View
                                </button>
                                <button type="button" className="file-remove" onClick={() => removeQueued(q.id)} title="Remove file" disabled={submitting}>
                                  <i className="bi bi-x-lg"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                          <label htmlFor="file-upload" className="file-upload-label" style={{ marginTop: 4 }}>
                            <i className="bi bi-plus-lg" style={{ fontSize: 18, color: '#1a3a5c' }}></i>
                            <span style={{ fontSize: 12, color: '#1a3a5c' }}>Add more files</span>
                          </label>
                        </div>
                      ) : (
                        <label htmlFor="file-upload" className="file-upload-label">
                          <i className="bi bi-cloud-arrow-up" style={{ fontSize: 28, color: '#888' }}></i>
                          <span style={{ fontSize: 13, color: '#555' }}>Click to queue one or more files</span>
                          <span style={{ fontSize: 11, color: '#999' }}>PDF, PNG, or JPEG — Max 10MB each</span>
                        </label>
                      )}
                    </div>
                    {fileError && (
                      <div style={{ color: '#dc3545', fontSize: 12, marginTop: 6 }}>{fileError}</div>
                    )}
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn-submit" disabled={submitting}>
                    <i className="bi bi-check-lg" style={{ marginRight: 6 }}></i>{isEditMode ? 'Save & Resubmit' : 'Submit'}
                  </button>
                  <button type="button" className="btn-reset" onClick={handleReset} disabled={submitting}>
                    <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 6 }}></i>Reset
                  </button>
                  <button type="button" className="btn-cancel" onClick={() => isEditMode && editId ? navigate(`/announcements/${editId}`) : navigate('/announcements')} disabled={submitting}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !submitting && setShowConfirm(false)}>
          <div style={{ background: '#fff', borderRadius: 6, maxWidth: 560, width: '90%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e9ef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h5 style={{ margin: 0, color: '#1a3a5c' }}>
                <i className="bi bi-question-circle" style={{ marginRight: 8 }}></i>
                Confirm {isEditMode ? 'Resubmission' : 'Submission'}
              </h5>
              <button onClick={() => !submitting && setShowConfirm(false)} disabled={submitting} style={{ background: 'none', border: 'none', fontSize: 18, cursor: submitting ? 'not-allowed' : 'pointer', color: '#888' }}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ marginTop: 0 }}>
                {isEditMode
                  ? 'Save changes and resubmit this announcement?'
                  : 'Submit this announcement for CMO review?'}
                {queued.length > 0 && (
                  <span style={{ display: 'block', marginTop: 6, fontSize: 13, color: '#1a3a5c' }}>
                    {queued.length} file{queued.length === 1 ? '' : 's'} will be uploaded after the announcement is created.
                  </span>
                )}
              </p>
              {duplicateMatches.length > 0 && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#8a6d00', marginBottom: 6 }}>
                    <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }}></i>
                    Possible duplicates detected:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#5c4900' }}>
                    {duplicateMatches.map(d => (
                      <li key={d.id}>{d.uniqueId} — {d.title} ({d.date})</li>
                    ))}
                  </ul>
                </div>
              )}
              {progressMsg && (
                <div style={{ marginTop: 10, fontSize: 13, color: '#1a3a5c' }}>
                  <i className="bi bi-arrow-repeat" style={{ marginRight: 6 }}></i>{progressMsg}
                </div>
              )}
              {fileError && (
                <div style={{ marginTop: 10, fontSize: 13, color: '#dc3545' }}>{fileError}</div>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e9ef', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-cancel" onClick={() => setShowConfirm(false)} disabled={submitting}>Cancel</button>
              <button type="button" className="btn-submit" onClick={performSubmit} disabled={submitting}>
                {submitting ? 'Working…' : isEditMode ? 'Confirm & Resubmit' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
    </>
  );
}
