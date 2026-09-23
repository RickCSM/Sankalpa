import { useState, useMemo, Fragment } from 'react';
import { useLocation, useRoute } from 'wouter';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import {
  useGetAnnouncement,
  useListComments,
  useListSubComponents,
  useListSubComponentRemarks,
  useCreateSubComponentRemark,
  deleteAnnouncement,
  getGetAnnouncementQueryKey,
  getListCommentsQueryKey,
  getListSubComponentsQueryKey,
  getListSubComponentRemarksQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Announcement, AnnouncementComment, SubComponent, WorkflowStatus } from '@/data/mockData';
import { workflowStatusLabels, workflowStatusColors, roleLabels, formatDate, formatDateTime, houseLabels, getConstituencyName, displaySubComponentStatus } from '@/data/mockData';
import { useSortableTable } from '@/hooks/useSortableTable';
import SortableHeader from '@/components/SortableHeader';
import AttachmentsPanel from '@/components/AttachmentsPanel';
import { useConfirmDialog } from '@/components/ConfirmDialog';

function toLocalTimestamp(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(ist.getUTCDate())}-${p(ist.getUTCMonth() + 1)}-${ist.getUTCFullYear()} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
}

export default function AnnouncementDetailPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute('/announcements/:id');
  const { user, can } = useAuth();
  const confirm = useConfirmDialog();
  // Mutation wrappers + users directory still come from AppState; lists are
  // now fetched per-id directly from the server (no global cache truncation).
  const { users, reviewAnnouncement, acceptAnnouncement, reconsiderAnnouncement, finalAcceptAnnouncement, requestCompletion, reviewCompletion, reviewCMOCompletion, addSubComponent, updateSubComponentStatus, updateSubComponentAssignment, setAnnouncementStatus, dropAnnouncement, holdAnnouncement, resumeAnnouncement } = useAppState();
  const [reassignTick, setReassignTick] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [showRevertForm, setShowRevertForm] = useState(false);
  const [reconsiderComment, setReconsiderComment] = useState('');
  const [reconsiderError, setReconsiderError] = useState('');
  const [reconsiderSubmitting, setReconsiderSubmitting] = useState(false);
  const [showCompletionRevertForm, setShowCompletionRevertForm] = useState(false);
  const [completionComment, setCompletionComment] = useState('');
  const [showCMOCompletionRevertForm, setShowCMOCompletionRevertForm] = useState(false);
  const [cmoCompletionComment, setCMOCompletionComment] = useState('');
  const [showAddSub, setShowAddSub] = useState(false);
  const [subForm, setSubForm] = useState({ title: '', description: '', assignedTo: 0 });
  const [subTitleError, setSubTitleError] = useState('');
  const [assignedToError, setAssignedToError] = useState('');
  const [dropHoldRemarks, setDropHoldRemarks] = useState('');
  const [dropHoldRemarksError, setDropHoldRemarksError] = useState('');
  const [dropHoldSubmitting, setDropHoldSubmitting] = useState(false);
  const [resumeSubmitting, setResumeSubmitting] = useState(false);
  const [expandedRemarks, setExpandedRemarks] = useState<Set<number>>(new Set());

  const announcementId = match && params?.id ? parseInt(params.id) : -1;

  const announcementQuery = useGetAnnouncement(announcementId, {
    query: {
      queryKey: getGetAnnouncementQueryKey(announcementId),
      enabled: announcementId > 0,
    },
  });
  const commentsQuery = useListComments(
    { announcementId, page: 1, pageSize: 200 },
    { query: { queryKey: getListCommentsQueryKey({ announcementId, page: 1, pageSize: 200 }), enabled: announcementId > 0 } },
  );
  const subsQuery = useListSubComponents(
    { announcementId, page: 1, pageSize: 200 },
    { query: { queryKey: getListSubComponentsQueryKey({ announcementId, page: 1, pageSize: 200 }), enabled: announcementId > 0 } },
  );

  const announcement: Announcement | null = useMemo(() => {
    const a = announcementQuery.data?.announcement;
    if (!a) return null;
    return {
      id: a.id,
      uniqueId: a.uniqueId,
      house: a.house ?? null,
      constituencyNumber: a.constituencyNumber ?? null,
      title: a.title,
      date: a.date,
      description: a.description,
      department: a.department ?? '',
      occasion: a.occasion ?? '',
      location: a.location ?? '',
      district: a.district ?? undefined,
      block: a.block ?? undefined,
      category: a.category ?? undefined,
      otherCategory: a.otherCategory ?? undefined,
      tags: a.tags ?? [],
      workflowStatus: a.workflowStatus as WorkflowStatus,
      createdBy: a.createdBy,
      assignedDeptUserId: a.assignedDeptUserId ?? undefined,
      assignedCmoReviewerId: a.assignedCmoReviewerId ?? undefined,
      acceptedByDeptNodalId: a.acceptedByDeptNodalId ?? undefined,
      reconsiderationRequested: a.reconsiderationRequested ?? false,
      statusBeforeHold: a.statusBeforeHold ?? null,
      version: a.version,
      createdAt: toLocalTimestamp(a.createdAt),
    } as Announcement;
  }, [announcementQuery.data]);

  const announcementComments: AnnouncementComment[] = useMemo(() => {
    return (commentsQuery.data?.comments ?? [])
      .map(c => ({
        id: c.id,
        announcementId: c.announcementId,
        userId: c.userId,
        userName: c.userName ?? '',
        role: (c.role ?? 'admin') as AnnouncementComment['role'],
        action: c.action,
        comment: c.comment,
        timestamp: toLocalTimestamp(c.createdAt),
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [commentsQuery.data]);

  const announcementSubs: SubComponent[] = useMemo(() => {
    return (subsQuery.data?.subComponents ?? []).map(s => ({
      id: s.id,
      announcementId: s.announcementId,
      title: s.title,
      description: s.description ?? '',
      assignedTo: s.assignedTo ?? 0,
      assignedToName: s.assignedToName ?? '',
      status: s.status as SubComponent['status'],
    }));
  }, [subsQuery.data]);

  const { sortedData: sortedSubs, sortConfig: subSortConfig, requestSort: requestSubSort } = useSortableTable(announcementSubs);
  const deptUsers = announcement ? users.filter(u => u.department === announcement.department) : [];

  if (!match || !params?.id) {
    return <Layout><div className="page-container"><p>Announcement not found.</p></div></Layout>;
  }
  if (announcementQuery.isLoading) {
    return <Layout><div className="page-container"><p>Loading…</p></div></Layout>;
  }
  if (!announcement) {
    return <Layout><div className="page-container"><p>Announcement not found.</p></div></Layout>;
  }

  if (announcement.workflowStatus === 'draft' && announcement.createdBy !== user?.id) {
    return <Layout><div className="page-container"><p>Announcement not found.</p></div></Layout>;
  }

  const isDeptRole = user && ['dept_head', 'dept_nodal', 'dept_reviewer', 'dept_user'].includes(user.role);
  const userInDept = !!user?.department && announcement.department === user.department;
  if (isDeptRole && !userInDept) {
    return <Layout><div className="page-container"><p>You do not have access to this announcement.</p></div></Layout>;
  }

  // Round-robin assignee enforcement: cmo_reviewer can only act on items assigned to them. Admin retains override.
  const isAssignedReviewer = !!user && (user.role === 'admin' || announcement.assignedCmoReviewerId === user.id);
  const canCMOReview = can('review_announcement_cmo') && announcement.workflowStatus === 'pending_cmo_review' && isAssignedReviewer;
  const canAccept = can('accept_announcement') && announcement.workflowStatus === 'published' && userInDept;
  // Reconsideration is only available BEFORE the department accepts. Once the Dept
  // Nodal accepts (status moves to `pending_dept_acceptance`), the announcement is
  // committed and can no longer be sent back for reconsideration.
  const canReconsider = can('reconsider_announcement') && announcement.workflowStatus === 'published' && (user?.role === 'admin' || userInDept);
  const canFinalAccept = can('final_accept_announcement') && announcement.workflowStatus === 'pending_dept_acceptance' && userInDept;
  const canStartProgress = can('accept_announcement') && announcement.workflowStatus === 'accepted' && userInDept;
  // Closure gating: only the accepting Dept Nodal (or admin) may request closure,
  // and every sub-component must be Completed first.
  const isAcceptingNodal = !!user && (user.role === 'admin' || user.id === announcement.acceptedByDeptNodalId);
  const incompleteSubs = announcementSubs.filter(s => s.status !== 'Completed');
  // An announcement with zero sub-components is never "all complete" — closure
  // requires at least one sub-component, all of them Completed. (Mirrors the
  // backend request-completion guard.)
  const allSubsComplete = announcementSubs.length > 0 && incompleteSubs.length === 0;
  const closureGateBlockedReason = !allSubsComplete
    ? announcementSubs.length === 0
      ? 'Add at least one sub-component and complete it before requesting closure'
      : `${incompleteSubs.length} of ${announcementSubs.length} sub-component${announcementSubs.length === 1 ? '' : 's'} still open`
    : !isAcceptingNodal
      ? 'Only the Department Nodal Officer who accepted this announcement can request closure'
      : '';
  // The closure card is visible to any Dept Nodal in the department once we are at
  // the in_progress (or reverted) stage; the action itself is gated separately.
  const closureCardVisible =
    can('set_completion') &&
    ['in_progress', 'reverted_by_dept_reviewer'].includes(announcement.workflowStatus) &&
    userInDept;
  const canRequestCompletion = closureCardVisible && isAcceptingNodal && allSubsComplete;
  const canReviewCompletion = can('review_completion') && announcement.workflowStatus === 'pending_completion_review' && userInDept;
  const canCMOCompletionReview = can('review_announcement_cmo') && announcement.workflowStatus === 'pending_cmo_completion_review' && isAssignedReviewer;
  const canAddSubComponent = can('add_sub_component') && ['accepted', 'in_progress', 'reverted_by_dept_reviewer'].includes(announcement.workflowStatus) && userInDept;
  // When the department user would otherwise be allowed to add sub-components
  // but the announcement is still awaiting Dept Reviewer final acceptance, we
  // surface an explanatory note in place of the Add button so users understand
  // why the action is unavailable.
  const showPreAcceptanceSubNote =
    can('add_sub_component') && userInDept &&
    ['published', 'pending_dept_acceptance'].includes(announcement.workflowStatus);
  const isActiveAnnouncement = ['pending_dept_acceptance', 'accepted', 'in_progress', 'reverted_by_dept_reviewer'].includes(announcement.workflowStatus);
  // After a completion-revert, only the originally-accepting Dept Nodal (or admin)
  // may edit and resubmit — same ownership rule as the closure gate.
  // Also: creator (or admin) can recall a pending_cmo_review announcement for editing.
  const canEdit =
    (['draft', 'reverted_by_cmo', 'pending_cmo_reconsideration', 'pending_cmo_review'].includes(announcement.workflowStatus) &&
      (announcement.createdBy === user?.id || user?.role === 'admin')) ||
    (announcement.workflowStatus === 'reverted_by_dept_reviewer' && userInDept &&
      ((user?.role === 'dept_nodal' && announcement.acceptedByDeptNodalId === user?.id) || user?.role === 'admin'));

  const PRE_PUBLICATION_STATUSES: WorkflowStatus[] = ['draft', 'pending_cmo_review', 'reverted_by_cmo', 'pending_cmo_reconsideration'];
  // Mirrors POST_PUBLICATION_STATUSES in artifacts/api-server/src/lib/workflow.ts.
  // Terminal states (completed / dropped / on_hold) are deliberately excluded.
  const POST_PUBLICATION_STATUSES: WorkflowStatus[] = ['published', 'pending_dept_acceptance', 'accepted', 'in_progress', 'pending_completion_review', 'reverted_by_dept_reviewer', 'pending_cmo_completion_review'];
  const canDelete =
    PRE_PUBLICATION_STATUSES.includes(announcement.workflowStatus) &&
    (announcement.createdBy === user?.id || user?.role === 'admin') &&
    user?.role !== 'dept_viewer';
  // Originating CMO Nodal (creator) can retag sub-components after dept_nodal accepts and before final acceptance.
  const canRetagSubs = !!user && user.id === announcement.createdBy && announcement.workflowStatus === 'pending_dept_acceptance';
  // A sub-component status may only be edited by its tagged owner (admin override retained).
  // Execution is locked until the Dept Nodal triggers Start Progress (`in_progress`).
  // Work also resumes after a completion revert (`reverted_by_dept_reviewer`).
  const SUB_EXECUTION_STATUSES: WorkflowStatus[] = ['in_progress', 'reverted_by_dept_reviewer'];
  const canEditSubStatus = (sc: { assignedTo?: number }) => {
    if (!user || !isActiveAnnouncement) return false;
    if (user.role === 'admin') return true;
    if (!SUB_EXECUTION_STATUSES.includes(announcement.workflowStatus)) return false;
    return sc.assignedTo === user.id;
  };
  // Interim Updates: the tagged assignee (or admin) may post only after the
  // Dept Nodal starts progress.  `accepted` is excluded — that is the Nodal's
  // setup window.  Viewer roles never qualify.
  const remarkParentOk = SUB_EXECUTION_STATUSES.includes(announcement.workflowStatus);
  const canPostRemark = (sc: { assignedTo?: number; status: SubComponent['status'] }) => {
    if (!user || !remarkParentOk) return false;
    if (sc.status === 'Completed') return false;
    if (user.role === 'dept_viewer') return false;
    if (user.role === 'admin') return true;
    return sc.assignedTo === user.id;
  };
  const toggleRemarks = (id: number) => {
    setExpandedRemarks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleApprove = () => {
    void confirm({
      title: 'Approve & Publish this announcement?',
      message: 'Once published, it will be visible to all assigned departments and cannot be unpublished from this screen.',
      confirmLabel: 'Yes, Approve & Publish',
      variant: 'primary',
      onConfirm: async () => {
        await reviewAnnouncement(announcementId, 'approve', reviewComment || 'Approved and published.');
        setReviewComment('');
      },
    });
  };

  const handleRevert = () => {
    if (!reviewComment.trim()) return;
    const comment = reviewComment;
    void confirm({
      title: 'Revert to creator?',
      message: 'The announcement will be sent back to its creator with the remarks below.',
      details: comment,
      confirmLabel: 'Yes, Revert',
      variant: 'danger',
      onConfirm: async () => {
        await reviewAnnouncement(announcementId, 'revert', comment);
        setReviewComment('');
        setShowRevertForm(false);
      },
    });
  };

  const handleAccept = () => {
    void confirm({
      title: 'Accept this announcement?',
      message: 'It will be forwarded to the Department Reviewer for final acceptance.',
      confirmLabel: 'Yes, Accept',
      variant: 'primary',
      onConfirm: async () => { await acceptAnnouncement(announcementId); },
    });
  };

  const handleReconsider = () => {
    const trimmed = reconsiderComment.trim();
    if (!trimmed) {
      setReconsiderError('Remarks are required when requesting reconsideration.');
      return;
    }
    setReconsiderError('');
    void confirm({
      title: 'Send back for reconsideration?',
      message: 'The announcement will be returned to the CMO with the remarks below.',
      details: trimmed,
      confirmLabel: 'Yes, Send Back',
      variant: 'danger',
      onConfirm: async () => {
        setReconsiderSubmitting(true);
        try {
          await reconsiderAnnouncement(announcementId, trimmed);
          setReconsiderComment('');
        } finally {
          setReconsiderSubmitting(false);
        }
      },
    });
  };

  const handleFinalAccept = () => {
    void confirm({
      title: 'Grant final acceptance?',
      message: 'The announcement will move to In Progress. Sub-components can be added after this.',
      confirmLabel: 'Yes, Grant Final Acceptance',
      variant: 'primary',
      onConfirm: async () => { await finalAcceptAnnouncement(announcementId); },
    });
  };

  const handleStartProgress = () => {
    void confirm({
      title: 'Start progress on this announcement?',
      message: 'Status will change to In Progress so work on sub-components can begin.',
      confirmLabel: 'Yes, Start Progress',
      variant: 'primary',
      onConfirm: async () => { await setAnnouncementStatus(announcementId, 'in_progress'); },
    });
  };

  const handleRequestCompletion = () => {
    void confirm({
      title: 'Request completion review?',
      message: 'The announcement will be submitted to the Department Reviewer for closure review.',
      confirmLabel: 'Yes, Request Completion',
      variant: 'primary',
      onConfirm: async () => { await requestCompletion(announcementId); },
    });
  };

  const handleApproveCompletion = () => {
    void confirm({
      title: 'Approve completion?',
      message: 'This forwards the announcement to the CMO Reviewer for final sign-off.',
      confirmLabel: 'Yes, Approve Completion',
      variant: 'primary',
      onConfirm: async () => {
        await reviewCompletion(announcementId, 'approve', completionComment || 'Completion approved.');
        setCompletionComment('');
      },
    });
  };

  const handleRevertCompletion = () => {
    if (!completionComment.trim()) return;
    const comment = completionComment;
    void confirm({
      title: 'Revert this completion request?',
      message: 'The announcement will be returned to the accepting Dept Nodal with the remarks below.',
      details: comment,
      confirmLabel: 'Yes, Revert Completion',
      variant: 'danger',
      onConfirm: async () => {
        await reviewCompletion(announcementId, 'revert', comment);
        setCompletionComment('');
        setShowCompletionRevertForm(false);
      },
    });
  };

  const handleApproveCMOCompletion = () => {
    void confirm({
      title: 'Final approve completion?',
      message: 'The announcement will be marked Completed. This is the final sign-off.',
      confirmLabel: 'Yes, Final Approve',
      variant: 'primary',
      onConfirm: async () => {
        await reviewCMOCompletion(announcementId, 'approve', cmoCompletionComment || 'CMO completion approved.');
        setCMOCompletionComment('');
      },
    });
  };

  const handleRevertCMOCompletion = () => {
    if (!cmoCompletionComment.trim()) return;
    const comment = cmoCompletionComment;
    void confirm({
      title: 'Revert this completion?',
      message: 'The announcement will be returned to the accepting Dept Nodal with the remarks below.',
      details: comment,
      confirmLabel: 'Yes, Revert Completion',
      variant: 'danger',
      onConfirm: async () => {
        await reviewCMOCompletion(announcementId, 'revert', comment);
        setCMOCompletionComment('');
        setShowCMOCompletionRevertForm(false);
      },
    });
  };

  const TERMINAL_STATUSES: WorkflowStatus[] = ['completed', 'dropped', 'on_hold'];
  // Drop / Put On Hold authority — must mirror assertCanDropOrHold in
  // artifacts/api-server/src/routes/announcements.ts exactly.
  //   - admin         → always (non-terminal)
  //   - cmo_reviewer  → only post-publication
  //   - all others    → never (cmo_nodal included)
  const canDropOrHold =
    !!user && !!announcement && !TERMINAL_STATUSES.includes(announcement.workflowStatus) && (
      user.role === 'admin' ||
      (
        user.role === 'cmo_reviewer' &&
        POST_PUBLICATION_STATUSES.includes(announcement.workflowStatus)
      )
    );

  // Resume authority — must mirror the server resume guard (which authorizes
  // against the pre-hold status via assertCanDropOrHold):
  //   - admin         → always
  //   - cmo_reviewer  → only if the pre-hold status was post-publication
  //   - all others    → never
  // Only an on_hold item can be resumed.
  const canResume =
    !!user && !!announcement && announcement.workflowStatus === 'on_hold' && (
      user.role === 'admin' ||
      (
        user.role === 'cmo_reviewer' &&
        !!announcement.statusBeforeHold &&
        POST_PUBLICATION_STATUSES.includes(announcement.statusBeforeHold)
      )
    );

  const handleResumeRequest = () => {
    if (!announcement || announcement.version == null) return;
    const version = announcement.version;
    void confirm({
      title: 'Resume announcement?',
      message: 'This will reactivate the announcement and restore it to the stage it was at before being put on hold, so work can proceed.',
      confirmLabel: 'Yes, Resume',
      variant: 'primary',
      onConfirm: async () => {
        setResumeSubmitting(true);
        try {
          await resumeAnnouncement(announcementId, version);
        } finally {
          setResumeSubmitting(false);
        }
      },
    });
  };

  const handleDropHoldRequest = (target: 'dropped' | 'on_hold') => {
    if (!dropHoldRemarks.trim()) {
      setDropHoldRemarksError('Remarks are required before confirming.');
      return;
    }
    setDropHoldRemarksError('');
    const remarks = dropHoldRemarks.trim();
    const label = target === 'dropped' ? 'Dropped' : 'On Hold';
    void confirm({
      title: `Mark as ${label}?`,
      message: `This action is irreversible from this screen. The announcement will be marked ${label} with the remarks below.`,
      details: remarks,
      confirmLabel: `Yes, Mark as ${label}`,
      variant: 'danger',
      onConfirm: async () => {
        setDropHoldSubmitting(true);
        try {
          if (target === 'dropped') {
            await dropAnnouncement(announcementId, remarks);
          } else {
            await holdAnnouncement(announcementId, remarks);
          }
          setDropHoldRemarks('');
        } finally {
          setDropHoldSubmitting(false);
        }
      },
    });
  };

  const handleDeleteRequest = () => {
    if (!announcement) return;
    void confirm({
      title: 'Delete announcement?',
      message: `This will permanently delete "${announcement.uniqueId} — ${announcement.title}" and all its attachments. This action is irreversible.`,
      confirmLabel: 'Yes, Delete',
      variant: 'danger',
      onConfirm: async () => {
        await deleteAnnouncement(announcementId);
        navigate('/announcements');
      },
    });
  };

  const handleAddSubComponent = () => {
    if (subForm.assignedTo === 0) {
      setAssignedToError('Please assign a user.');
      return;
    }
    setAssignedToError('');
    if (!/[a-zA-Z0-9]/.test(subForm.title.trim())) {
      setSubTitleError('Title must contain at least one letter or digit.');
      return;
    }
    setSubTitleError('');
    const assignedUser = users.find(u => u.id === subForm.assignedTo);
    addSubComponent({
      announcementId,
      title: subForm.title,
      description: subForm.description,
      assignedTo: subForm.assignedTo || undefined,
      assignedToName: assignedUser?.name,
      status: 'Pending',
    });
    setSubForm({ title: '', description: '', assignedTo: 0 });
    setShowAddSub(false);
  };

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <div className="page-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => navigate('/announcements')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a3a5c', fontSize: 20, display: 'flex', alignItems: 'center' }}>
                <i className="bi bi-arrow-left-circle-fill"></i>
              </button>
              <h4 style={{ margin: 0 }}>Announcement</h4>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {canDelete && (
                <button
                  onClick={handleDeleteRequest}
                  style={{
                    fontSize: 13, padding: '6px 14px',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: '#fff', border: '1px solid #dc3545',
                    color: '#dc3545', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  <i className="bi bi-trash3"></i> Delete
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => navigate(`/announcements/${announcement.id}/edit`)}
                  className="btn-submit"
                  style={{ fontSize: 13, padding: '6px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="bi bi-pencil-square"></i>
                  {announcement.workflowStatus === 'pending_cmo_review' ? 'Recall & Edit' : 'Edit & Resubmit'}
                </button>
              )}
              <span className={`status-badge ${workflowStatusColors[announcement.workflowStatus]}`} style={{ fontSize: 13, padding: '5px 14px' }}>
                {workflowStatusLabels[announcement.workflowStatus]}
              </span>
            </div>
          </div>

          <div className="card detail-card" style={{ marginBottom: 20 }}>
            <div className="detail-hero">
              <div style={{ display: 'inline-block', background: '#e87722', color: '#fff', padding: '4px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
                ID: {announcement.uniqueId}
              </div>
              <h2 className="detail-hero-title">{announcement.title}</h2>
              <p className="detail-hero-description">{announcement.description}</p>
            </div>
            <div className="card-body">
              <div className="detail-meta-grid">
                <div className="detail-meta-item">
                  <i className="bi bi-calendar3"></i>
                  <div>
                    <div className="detail-label">Announcement Date</div>
                    <div className="detail-value">{formatDate(announcement.date)}</div>
                  </div>
                </div>
                {announcement.createdAt && (
                  <div className="detail-meta-item">
                    <i className="bi bi-clock-history"></i>
                    <div>
                      <div className="detail-label">Created On</div>
                      <div className="detail-value">{announcement.createdAt}</div>
                    </div>
                  </div>
                )}
                <div className="detail-meta-item">
                  <i className="bi bi-building"></i>
                  <div>
                    <div className="detail-label">Department</div>
                    <div className="detail-value">{announcement.department}</div>
                  </div>
                </div>
                {announcement.assignedCmoReviewerId && (
                  <div className="detail-meta-item">
                    <i className="bi bi-person-badge"></i>
                    <div>
                      <div className="detail-label">Assigned CMO Reviewer</div>
                      <div className="detail-value">{users.find(u => u.id === announcement.assignedCmoReviewerId)?.name || '—'}</div>
                    </div>
                  </div>
                )}
                {announcement.house && announcement.constituencyNumber != null && (
                  <div className="detail-meta-item">
                    <i className="bi bi-bank"></i>
                    <div>
                      <div className="detail-label">Constituency ({houseLabels[announcement.house]})</div>
                      <div className="detail-value">{String(announcement.constituencyNumber).padStart(3, '0')} — {getConstituencyName(announcement.house, announcement.constituencyNumber)}</div>
                    </div>
                  </div>
                )}
                <div className="detail-meta-item">
                  <i className="bi bi-star"></i>
                  <div>
                    <div className="detail-label">Occasion</div>
                    <div className="detail-value">{announcement.occasion}</div>
                  </div>
                </div>
                <div className="detail-meta-item">
                  <i className="bi bi-geo-alt"></i>
                  <div>
                    <div className="detail-label">Location</div>
                    <div className="detail-value">{announcement.location}</div>
                  </div>
                </div>
                {announcement.district && (
                  <div className="detail-meta-item">
                    <i className="bi bi-pin-map"></i>
                    <div>
                      <div className="detail-label">District</div>
                      <div className="detail-value">{announcement.district}</div>
                    </div>
                  </div>
                )}
                {announcement.block && (
                  <div className="detail-meta-item">
                    <i className="bi bi-pin-map-fill"></i>
                    <div>
                      <div className="detail-label">Block</div>
                      <div className="detail-value">{announcement.block}</div>
                    </div>
                  </div>
                )}
              </div>
              {(announcement.category || (announcement.tags && announcement.tags.length > 0)) && (
                <div className="detail-tags-section">
                  {announcement.category && (
                    <div className="detail-tags-group">
                      <span className="detail-label">Category</span>
                      <span className="detail-category-badge">
                        {announcement.category === 'Other' && announcement.otherCategory
                          ? `Other – ${announcement.otherCategory}`
                          : announcement.category}
                      </span>
                    </div>
                  )}
                  {announcement.tags && announcement.tags.length > 0 && (
                    <div className="detail-tags-group">
                      <span className="detail-label">Tags</span>
                      <div className="detail-tags">
                        {announcement.tags.map(tag => (
                          <span key={tag} className="detail-tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <AttachmentsPanel
                announcementId={announcement.id}
                canUpload={!!user && announcement.workflowStatus !== 'completed' && (
                  // CMO Nodal: only on their own announcement and only pre-publication.
                  (user.role === 'cmo_nodal' &&
                    announcement.createdBy === user.id &&
                    PRE_PUBLICATION_STATUSES.includes(announcement.workflowStatus)) ||
                  // Dept Nodal: only the accepting nodal, while the announcement is active.
                  (user.role === 'dept_nodal' &&
                    isActiveAnnouncement &&
                    (userInDept || announcement.createdBy === user.id)) ||
                  // Admin: always (except completed, blocked above).
                  user.role === 'admin'
                )}
                canDeleteRow={(att) => {
                  if (!user) return false;
                  // The closed record is read-only for everyone, even admin.
                  if (announcement.workflowStatus === 'completed') return false;
                  // CMO Nodal loses delete rights once the announcement is published,
                  // regardless of whether they uploaded the file.
                  if (
                    user.role === 'cmo_nodal' &&
                    !PRE_PUBLICATION_STATUSES.includes(announcement.workflowStatus)
                  ) return false;
                  return user.role === 'admin' || att.uploadedBy === user.id;
                }}
              />
            </div>
          </div>

          {canCMOReview && (
            <div className="card action-card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a3a5c' }}>
                  <i className="bi bi-clipboard-check" style={{ marginRight: 8 }}></i>CMO Review
                </h5>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Comments</label>
                  <textarea rows={3} maxLength={500} placeholder="Add review comments..." value={reviewComment} onChange={e => setReviewComment(e.target.value)} />
                  <div style={{ textAlign: 'right', fontSize: 12, color: reviewComment.length >= 450 ? '#e53e3e' : '#999', marginTop: 4 }}>{reviewComment.length}/500</div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn-approve" onClick={handleApprove}>
                    <i className="bi bi-check-lg" style={{ marginRight: 6 }}></i>Approve & Publish
                  </button>
                  {!showRevertForm ? (
                    <button className="btn-revert" onClick={() => setShowRevertForm(true)}>
                      <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 6 }}></i>Revert
                    </button>
                  ) : (
                    <button className="btn-revert" onClick={handleRevert} disabled={!reviewComment.trim()}>
                      <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 6 }}></i>
                      {reviewComment.trim() ? 'Confirm Revert' : 'Confirm Revert (comment required)'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {canAccept && (
            <div className="card action-card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a3a5c' }}>Department Nodal — Initial Acceptance</h5>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>Accept this announcement to forward it to the Department Reviewer for final acceptance.</p>
                <button className="btn-approve" onClick={handleAccept}>
                  <i className="bi bi-check-lg" style={{ marginRight: 6 }}></i>Accept & Forward
                </button>
              </div>
            </div>
          )}

          {canReconsider && (
            <div className="card action-card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a3a5c' }}>
                  <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 8 }}></i>Send Back for Reconsideration
                </h5>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                  Return this announcement to the CMO Nodal Officer and the assigned CMO Reviewer with remarks. The CMO can then edit and re-publish it.
                </p>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>Remarks <span style={{ color: '#e53e3e' }}>*</span></label>
                  <textarea
                    rows={3}
                    maxLength={500}
                    placeholder="Explain why this needs to be reconsidered..."
                    value={reconsiderComment}
                    onChange={e => {
                      setReconsiderComment(e.target.value);
                      if (reconsiderError) setReconsiderError('');
                    }}
                  />
                  <div style={{ textAlign: 'right', fontSize: 12, color: reconsiderComment.length >= 450 ? '#e53e3e' : '#999', marginTop: 4 }}>{reconsiderComment.length}/500</div>
                </div>
                {reconsiderError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#b91c1c' }}>
                    {reconsiderError}
                  </div>
                )}
                <button
                  className="btn-revert"
                  onClick={handleReconsider}
                  disabled={!reconsiderComment.trim() || reconsiderSubmitting}
                  style={(!reconsiderComment.trim() || reconsiderSubmitting) ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                >
                  <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 6 }}></i>
                  {reconsiderSubmitting ? 'Sending…' : (reconsiderComment.trim() ? 'Confirm Reconsider' : 'Confirm Reconsider (remarks required)')}
                </button>
              </div>
            </div>
          )}

          {canFinalAccept && (
            <div className="card action-card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a3a5c' }}>Department Reviewer — Final Acceptance</h5>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>The Department Nodal has accepted. Provide final acceptance to begin work on sub-components.</p>
                <button className="btn-approve" onClick={handleFinalAccept}>
                  <i className="bi bi-check2-all" style={{ marginRight: 6 }}></i>Grant Final Acceptance
                </button>
              </div>
            </div>
          )}

          {closureCardVisible && (
            <div className="card action-card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a3a5c' }}>Request Completion</h5>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>Submit this announcement for completion review by the Department Reviewer.</p>
                {!canRequestCompletion && closureGateBlockedReason && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
                    <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }}></i>{closureGateBlockedReason}.
                  </div>
                )}
                <button
                  className="btn-approve"
                  onClick={handleRequestCompletion}
                  disabled={!canRequestCompletion}
                  title={!canRequestCompletion ? closureGateBlockedReason : undefined}
                  style={!canRequestCompletion ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                >
                  <i className="bi bi-check-circle" style={{ marginRight: 6 }}></i>Request Completion Review
                </button>
              </div>
            </div>
          )}

          {canReviewCompletion && (
            <div className="card action-card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a3a5c' }}>
                  <i className="bi bi-clipboard-check" style={{ marginRight: 8 }}></i>Completion Review
                </h5>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Comments</label>
                  <textarea rows={3} maxLength={500} placeholder="Add review comments..." value={completionComment} onChange={e => setCompletionComment(e.target.value)} />
                  <div style={{ textAlign: 'right', fontSize: 12, color: completionComment.length >= 450 ? '#e53e3e' : '#999', marginTop: 4 }}>{completionComment.length}/500</div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn-approve" onClick={handleApproveCompletion}>
                    <i className="bi bi-check-lg" style={{ marginRight: 6 }}></i>Approve Completion
                  </button>
                  {!showCompletionRevertForm ? (
                    <button className="btn-revert" onClick={() => setShowCompletionRevertForm(true)}>
                      <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 6 }}></i>Revert
                    </button>
                  ) : (
                    <button className="btn-revert" onClick={handleRevertCompletion} disabled={!completionComment.trim()}>
                      <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 6 }}></i>
                      {completionComment.trim() ? 'Confirm Revert' : 'Confirm Revert (comment required)'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {canCMOCompletionReview && (
            <div className="card action-card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a3a5c' }}>
                  <i className="bi bi-clipboard-check" style={{ marginRight: 8 }}></i>CMO Completion Review
                </h5>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>The Department Reviewer has approved this completion. As CMO Reviewer, provide final sign-off or revert.</p>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Comments</label>
                  <textarea rows={3} maxLength={500} placeholder="Add review comments..." value={cmoCompletionComment} onChange={e => setCMOCompletionComment(e.target.value)} />
                  <div style={{ textAlign: 'right', fontSize: 12, color: cmoCompletionComment.length >= 450 ? '#e53e3e' : '#999', marginTop: 4 }}>{cmoCompletionComment.length}/500</div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn-approve" onClick={handleApproveCMOCompletion}>
                    <i className="bi bi-check-lg" style={{ marginRight: 6 }}></i>Approve Completion
                  </button>
                  {!showCMOCompletionRevertForm ? (
                    <button className="btn-revert" onClick={() => setShowCMOCompletionRevertForm(true)}>
                      <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 6 }}></i>Revert
                    </button>
                  ) : (
                    <button className="btn-revert" onClick={handleRevertCMOCompletion} disabled={!cmoCompletionComment.trim()}>
                      <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 6 }}></i>
                      {cmoCompletionComment.trim() ? 'Confirm Revert' : 'Confirm Revert (comment required)'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {canResume && (
            <div className="card action-card" style={{ marginBottom: 20, borderLeft: '4px solid #16a34a' }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: '#15803d' }}>
                  <i className="bi bi-play-circle" style={{ marginRight: 8 }}></i>Resume Announcement
                </h5>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
                  This announcement is currently on hold. Resuming will reactivate it and restore it to the stage it was at before being held, so work can proceed.
                </p>
                <button
                  className="btn-primary"
                  style={{ background: '#16a34a', borderColor: '#16a34a' }}
                  onClick={handleResumeRequest}
                  disabled={resumeSubmitting}
                >
                  <i className="bi bi-play-circle" style={{ marginRight: 6 }}></i>{resumeSubmitting ? 'Resuming…' : 'Resume'}
                </button>
              </div>
            </div>
          )}

          {canDropOrHold && (
            <div className="card action-card" style={{ marginBottom: 20, borderLeft: '4px solid #dc2626' }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: '#991b1b' }}>
                  <i className="bi bi-exclamation-octagon" style={{ marginRight: 8 }}></i>Drop or Put On Hold
                </h5>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
                  These actions are irreversible from this screen. Provide mandatory remarks explaining the reason before proceeding.
                </p>

                {(
                  <>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label>
                        Remarks <span className="required">*</span>
                        <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>
                          Required — clearly state the reason for this action
                        </span>
                      </label>
                      <textarea
                        rows={3}
                        maxLength={500}
                        placeholder="e.g. Policy change — this announcement is no longer applicable…"
                        value={dropHoldRemarks}
                        onChange={e => { setDropHoldRemarks(e.target.value); if (dropHoldRemarksError) setDropHoldRemarksError(''); }}
                        style={{ borderColor: dropHoldRemarksError ? '#dc2626' : undefined }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        {dropHoldRemarksError
                          ? <span style={{ fontSize: 12, color: '#dc2626' }}><i className="bi bi-exclamation-circle" style={{ marginRight: 4 }}></i>{dropHoldRemarksError}</span>
                          : <span />
                        }
                        <span style={{ fontSize: 12, color: dropHoldRemarks.length >= 450 ? '#dc2626' : '#999' }}>{dropHoldRemarks.length}/500</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        className="btn-revert"
                        style={{ background: '#dc2626', borderColor: '#dc2626' }}
                        onClick={() => handleDropHoldRequest('dropped')}
                      >
                        <i className="bi bi-x-circle" style={{ marginRight: 6 }}></i>Drop Announcement
                      </button>
                      <button
                        className="btn-revert"
                        style={{ background: '#d97706', borderColor: '#d97706' }}
                        onClick={() => handleDropHoldRequest('on_hold')}
                      >
                        <i className="bi bi-pause-circle" style={{ marginRight: 6 }}></i>Put On Hold
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {(canAddSubComponent || canRetagSubs || showPreAcceptanceSubNote || announcementSubs.length > 0) && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h5 style={{ fontSize: 16, fontWeight: 700, color: '#1a3a5c', margin: 0 }}>{canAddSubComponent ? 'Sub-Components (Add if Required)' : 'Sub-Components'}</h5>
                  {canAddSubComponent && (
                    <button className="btn-add" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setShowAddSub(!showAddSub)}>
                      <i className="bi bi-plus-lg"></i> Add Sub-Component
                    </button>
                  )}
                </div>

                {showPreAcceptanceSubNote && !canAddSubComponent && (
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <i className="bi bi-info-circle" style={{ marginTop: 2 }}></i>
                    <span>Sub-components can be added after the Department Reviewer grants final acceptance of this Sankalpa.</span>
                  </div>
                )}

                {showAddSub && (
                  <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Title <span className="required">*</span></label>
                        <input
                          type="text"
                          placeholder="Sub-component title"
                          value={subForm.title}
                          onChange={e => { setSubForm(p => ({ ...p, title: e.target.value })); if (subTitleError) setSubTitleError(''); }}
                        />
                        {subTitleError && (
                          <div style={{ color: '#dc3545', fontSize: 12, marginTop: 4 }}>{subTitleError}</div>
                        )}
                      </div>
                      <div className="form-group">
                        <label>Assign To <span className="required">*</span></label>
                        <select value={subForm.assignedTo} onChange={e => { setSubForm(p => ({ ...p, assignedTo: parseInt(e.target.value) })); if (assignedToError) setAssignedToError(''); }}>
                          <option value={0}>-- Select User --</option>
                          {deptUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({roleLabels[u.role]})</option>
                          ))}
                        </select>
                        {assignedToError && (
                          <div style={{ color: '#dc3545', fontSize: 12, marginTop: 4 }}>{assignedToError}</div>
                        )}
                      </div>
                      <div className="form-group form-group-full">
                        <label>Description</label>
                        <textarea rows={2} placeholder="Description" value={subForm.description} onChange={e => setSubForm(p => ({ ...p, description: e.target.value }))} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      <button className="btn-submit" style={{ fontSize: 13, padding: '6px 18px' }} onClick={handleAddSubComponent}>Add</button>
                      <button className="btn-cancel" style={{ fontSize: 13, padding: '6px 18px' }} onClick={() => { setShowAddSub(false); setSubForm({ title: '', description: '', assignedTo: 0 }); setSubTitleError(''); setAssignedToError(''); }}>Cancel</button>
                    </div>
                  </div>
                )}

                {announcementSubs.length === 0 ? (
                  <p style={{ color: '#999', fontSize: 13 }}>No sub-components yet.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <SortableHeader label="Title" sortKey="title" sortConfig={subSortConfig} onSort={requestSubSort} />
                        <SortableHeader label="Description" sortKey="description" sortConfig={subSortConfig} onSort={requestSubSort} />
                        <SortableHeader label="Assigned To" sortKey="assignedToName" sortConfig={subSortConfig} onSort={requestSubSort} />
                        <SortableHeader label="Status" sortKey="status" sortConfig={subSortConfig} onSort={requestSubSort} />
                        <th>Updates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSubs.map((sc, idx) => (
                        <Fragment key={sc.id}>
                        <tr>
                          <td>{idx + 1}</td>
                          <td>{sc.title}</td>
                          <td>{sc.description}</td>
                          <td>
                            {canRetagSubs ? (
                              <select
                                key={`reassign-${sc.id}-${reassignTick}`}
                                value={sc.assignedTo || 0}
                                onChange={e => {
                                  const newId = parseInt(e.target.value, 10);
                                  const u = users.find(u => u.id === newId);
                                  if (!u || u.id === sc.assignedTo) return;
                                  void confirm({
                                    title: 'Reassign sub-component?',
                                    message: `"${sc.title}" will be reassigned from ${sc.assignedToName || '—'} to the user below.`,
                                    details: `${u.name} (${roleLabels[u.role]})`,
                                    confirmLabel: 'Yes, Reassign',
                                    variant: 'primary',
                                    onConfirm: async () => { await updateSubComponentAssignment(sc.id, u.id, u.name); },
                                  }).then(ok => { if (!ok) setReassignTick(t => t + 1); });
                                }}
                                style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid #d6dee7', maxWidth: 180 }}
                              >
                                <option value={0} disabled>-- Select User --</option>
                                {[...deptUsers, ...(user && user.id === announcement.createdBy ? [user] : [])]
                                  .filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i)
                                  .map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({roleLabels[u.role]})</option>
                                  ))}
                              </select>
                            ) : (
                              sc.assignedToName || '-'
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {(() => {
                                const subDisplay = displaySubComponentStatus(sc.status, announcement.workflowStatus);
                                return (
                                  <span className={`status-badge ${subDisplay === 'Completed' ? 'completed' : subDisplay === 'In Progress' ? 'in-progress' : 'not-started'}`}>
                                    {subDisplay}
                                  </span>
                                );
                              })()}
                              {canEditSubStatus(sc) && sc.status === 'Pending' && (
                                <button
                                  onClick={() => {
                                    void confirm({
                                      title: 'Start this sub-component?',
                                      message: `"${sc.title}" will move to In Progress.`,
                                      confirmLabel: 'Yes, Start',
                                      variant: 'primary',
                                      onConfirm: async () => { await updateSubComponentStatus(sc.id, 'In Progress'); },
                                    });
                                  }}
                                  style={{ padding: '3px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 600, background: '#2563eb', color: '#fff', whiteSpace: 'nowrap' }}
                                >
                                  Start
                                </button>
                              )}
                              {canEditSubStatus(sc) && sc.status === 'In Progress' && (
                                <button
                                  onClick={() => {
                                    void confirm({
                                      title: 'Mark this sub-component complete?',
                                      message: `"${sc.title}" will be marked as Completed.`,
                                      confirmLabel: 'Yes, Complete',
                                      variant: 'primary',
                                      onConfirm: async () => { await updateSubComponentStatus(sc.id, 'Completed'); },
                                    });
                                  }}
                                  style={{ padding: '3px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 600, background: '#16a34a', color: '#fff', whiteSpace: 'nowrap' }}
                                >
                                  Complete
                                </button>
                              )}
                              {!canEditSubStatus(sc) && isActiveAnnouncement && sc.status !== 'Completed' && sc.assignedToName && user && sc.assignedTo !== user.id && user.role !== 'admin' && (
                                <span style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }} title={`Only ${sc.assignedToName} can update this sub-component`}>
                                  Only {sc.assignedToName} can update
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <button
                              onClick={() => toggleRemarks(sc.id)}
                              style={{ padding: '3px 10px', fontSize: 11, borderRadius: 4, border: '1px solid #d6dee7', background: '#fff', cursor: 'pointer', color: '#1a3a5c', fontWeight: 600 }}
                            >
                              <i className={`bi bi-chevron-${expandedRemarks.has(sc.id) ? 'up' : 'down'}`} style={{ marginRight: 4 }}></i>
                              Updates
                            </button>
                          </td>
                        </tr>
                        {expandedRemarks.has(sc.id) && (
                          <tr>
                            <td colSpan={6} style={{ background: '#f8fafc', padding: 12 }}>
                              <SubComponentRemarks
                                subComponentId={sc.id}
                                announcementId={announcementId}
                                canPost={canPostRemark(sc)}
                              />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {canStartProgress && (
            <div className="card action-card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a3a5c' }}>Start Progress</h5>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>Mark this announcement as "In Progress" to start working on sub-components.</p>
                <button className="btn-approve" onClick={handleStartProgress}>
                  <i className="bi bi-play-fill" style={{ marginRight: 6 }}></i>Start Progress
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-body">
              <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a3a5c' }}>
                <i className="bi bi-clock-history" style={{ marginRight: 8 }}></i>Review History
              </h5>
              {announcementComments.length === 0 ? (
                <p style={{ color: '#999', fontSize: 13 }}>No activity yet.</p>
              ) : (
                <div className="activity-trail">
                  {announcementComments.map(c => (
                    <div key={c.id} className="activity-item">
                      <div className="activity-dot"></div>
                      <div className="activity-content">
                        <div className="activity-header">
                          <strong>{c.userName}</strong>
                          <span className="activity-role">{roleLabels[c.role]}</span>
                          <span className="activity-action">{c.action}</span>
                        </div>
                        <p className="activity-comment">{c.comment}</p>
                        <span className="activity-time">
                          <i className="bi bi-clock" style={{ marginRight: 4 }}></i>{c.timestamp}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </Layout>
  );
}

function SubComponentRemarks({
  subComponentId,
  announcementId,
  canPost,
}: {
  subComponentId: number;
  announcementId: number;
  canPost: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const listQ = useListSubComponentRemarks(subComponentId);
  const createM = useCreateSubComponentRemark({
    mutation: {
      onSuccess: () => {
        setDraft('');
        setError('');
        qc.invalidateQueries({ queryKey: getListSubComponentRemarksQueryKey(subComponentId) });
        qc.invalidateQueries({ queryKey: getListCommentsQueryKey({ announcementId }) });
      },
      onError: (e: unknown) => {
        setError(getFriendlyErrorMessage(e, 'Failed to post update.'));
      },
    },
  });

  const remarks = listQ.data?.remarks ?? [];

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) { setError('Remark cannot be empty.'); return; }
    if (trimmed.length > 2000) { setError('Remark must be 2000 characters or fewer.'); return; }
    createM.mutate({ id: subComponentId, data: { remark: trimmed } });
  };

  return (
    <div>
      <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#1a3a5c', fontWeight: 700 }}>
        Interim Updates ({remarks.length})
      </h4>
      {listQ.isLoading ? (
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading…</p>
      ) : remarks.length === 0 ? (
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px', fontStyle: 'italic' }}>No interim updates yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {remarks.map(r => (
            <li key={r.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '6px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginBottom: 2 }}>
                <span>
                  <strong>{r.userName ?? `User #${r.userId}`}</strong>
                  {r.role ? <span style={{ marginLeft: 6, color: '#64748b' }}>({roleLabels[r.role as keyof typeof roleLabels] ?? r.role})</span> : null}
                </span>
                <span>{formatDateTime(r.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, color: '#1f2937', whiteSpace: 'pre-wrap' }}>{r.remark}</div>
            </li>
          ))}
        </ul>
      )}
      {canPost && (
        <div>
          <textarea
            value={draft}
            onChange={e => { setDraft(e.target.value); if (error) setError(''); }}
            maxLength={2000}
            rows={3}
            placeholder="Post an interim update…"
            style={{ width: '100%', padding: 8, border: '1px solid #d6dee7', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
            disabled={createM.isPending}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: error ? '#b91c1c' : '#6b7280' }}>
              {error || `${draft.length}/2000`}
            </span>
            <button
              onClick={submit}
              disabled={createM.isPending || !draft.trim()}
              style={{ padding: '4px 12px', fontSize: 12, borderRadius: 4, border: 'none', background: '#1a3a5c', color: '#fff', cursor: createM.isPending ? 'wait' : 'pointer', fontWeight: 600, opacity: createM.isPending || !draft.trim() ? 0.6 : 1 }}
            >
              {createM.isPending ? 'Posting…' : 'Post Update'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
