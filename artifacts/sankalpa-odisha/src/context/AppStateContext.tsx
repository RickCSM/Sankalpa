/**
 * AppStateContext (server-backed):
 *
 * Reads come from React Query hooks against the API server (announcements,
 * sub-components, comments, notifications, directory, categories, tags).
 * Writes call the corresponding workflow endpoints which transactionally
 * enforce RBAC, optimistic locking (version), round-robin CMO Reviewer
 * assignment, and notification fan-out server-side. The browser never picks
 * recipients, never assigns reviewers, and never decides workflow next-state.
 *
 * The public surface (`useAppState()`) is preserved so the existing pages and
 * components (AnnouncementDetailPage, AddAnnouncementPage, Header, …) continue
 * to work unchanged.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  useListDirectory,
  useListCategories,
  useListTags,
  useListAnnouncements,
  useListSubComponents,
  useListComments,
  useListNotifications,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useReassignUserActivities,
  getUserWorkload as fetchUserWorkloadApi,
  useCreateCategory,
  useCreateTag,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useSubmitAnnouncement,
  useReviewAnnouncement,
  useAcceptAnnouncement,
  useReconsiderAnnouncement,
  useFinalAcceptAnnouncement,
  useStartAnnouncementProgress,
  useRequestAnnouncementCompletion,
  useReviewAnnouncementCompletion,
  useReviewCmoCompletion,
  useCreateSubComponent,
  usePatchSubComponent,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDropAnnouncement,
  useHoldAnnouncement,
  useResumeAnnouncement,
  getListUsersQueryKey,
  getListDirectoryQueryKey,
  getListCategoriesQueryKey,
  getListTagsQueryKey,
  getListAnnouncementsQueryKey,
  getGetAnnouncementQueryKey,
  getListSubComponentsQueryKey,
  getListCommentsQueryKey,
  getListNotificationsQueryKey,
  type DirectoryUser,
  type Announcement as ApiAnnouncement,
  type SubComponent as ApiSubComponent,
  type AnnouncementComment as ApiComment,
  type Notification as ApiNotification,
  type UserWorkloadResponse,
  listAnnouncements,
  listSubComponents,
} from '@workspace/api-client-react';
import { fetchAllPages } from '@/lib/fetchAllPages';
import {
  type Announcement, type AnnouncementComment, type SubComponent, type Notification, type MockUser, type WorkflowStatus
} from '@/data/mockData';
import { useAuth } from './AuthContext';

function directoryToMock(u: DirectoryUser): MockUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role as MockUser['role'],
    department: u.department ?? undefined,
    email: '',
    mobile: undefined,
    status: u.status,
  };
}

function toLocalTimestamp(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(ist.getUTCDate())}-${p(ist.getUTCMonth() + 1)}-${ist.getUTCFullYear()} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
}

function apiAnnouncementToLocal(a: ApiAnnouncement, directory: Map<number, MockUser>): Announcement {
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
    createdAt: toLocalTimestamp(a.createdAt),
    // The local type doesn't declare `version` but the consumers ignore extras.
    // We attach it so workflow mutation wrappers can read it.
    ...(typeof a.version === 'number' ? { version: a.version } : {}),
  } as Announcement & { version?: number };
}

function apiSubComponentToLocal(s: ApiSubComponent): SubComponent {
  return {
    id: s.id,
    announcementId: s.announcementId,
    title: s.title,
    description: s.description ?? '',
    assignedTo: s.assignedTo ?? 0,
    assignedToName: s.assignedToName ?? '',
    status: s.status as SubComponent['status'],
  };
}

function apiCommentToLocal(c: ApiComment): AnnouncementComment {
  return {
    id: c.id,
    announcementId: c.announcementId,
    userId: c.userId,
    userName: c.userName ?? '',
    role: (c.role ?? 'admin') as AnnouncementComment['role'],
    action: c.action,
    comment: c.comment,
    timestamp: toLocalTimestamp(c.createdAt),
  };
}

function apiNotificationToLocal(n: ApiNotification): Notification {
  return {
    id: n.id,
    userId: n.userId,
    message: n.message,
    type: n.type as Notification['type'],
    read: n.read,
    timestamp: toLocalTimestamp(n.createdAt),
    link: n.link ?? undefined,
  };
}

interface AppStateContextType {
  announcements: Announcement[];
  comments: AnnouncementComment[];
  subComponents: SubComponent[];
  notifications: Notification[];
  users: MockUser[];
  categoryOptions: string[];
  tagOptions: string[];
  addCategoryOption: (option: string) => void;
  addTagOption: (option: string) => void;
  addAnnouncement: (data: Omit<Announcement, 'id' | 'uniqueId' | 'workflowStatus' | 'createdBy' | 'house' | 'constituencyNumber'>) => Promise<number | null>;
  updateAnnouncement: (id: number, data: Partial<Omit<Announcement, 'id' | 'uniqueId' | 'workflowStatus' | 'createdBy'>>) => Promise<boolean>;
  reviewAnnouncement: (id: number, action: 'approve' | 'revert', comment: string) => void;
  acceptAnnouncement: (id: number) => void;
  reconsiderAnnouncement: (id: number, comment: string) => Promise<void>;
  finalAcceptAnnouncement: (id: number) => void;
  setAnnouncementStatus: (id: number, status: WorkflowStatus) => void;
  dropAnnouncement: (id: number, remarks: string) => Promise<void>;
  holdAnnouncement: (id: number, remarks: string) => Promise<void>;
  resumeAnnouncement: (id: number, version: number) => Promise<void>;
  updateSubComponentAssignment: (id: number, assignedTo: number, assignedToName: string) => void;
  requestCompletion: (id: number) => void;
  reviewCompletion: (id: number, action: 'approve' | 'revert', comment: string) => void;
  reviewCMOCompletion: (id: number, action: 'approve' | 'revert', comment: string) => void;
  addSubComponent: (data: Omit<SubComponent, 'id'>) => void;
  updateSubComponentStatus: (id: number, status: SubComponent['status']) => void;
  addUser: (data: Omit<MockUser, 'id'>) => Promise<void>;
  updateUser: (id: number, data: Partial<Omit<MockUser, 'id'>>) => Promise<void>;
  deleteUser: (id: number) => Promise<void>;
  getUserWorkload: (id: number) => Promise<UserWorkloadResponse>;
  reassignActivities: (id: number, assignments: { subComponentId: number; newAssignedTo: number }[]) => Promise<void>;
  addNotification: (userId: number, message: string, type: Notification['type'], link?: string) => void;
  markNotificationRead: (id: number) => void;
  markAllNotificationsRead: () => void;
  getUnreadCount: (userId: number) => number;
  deptStats: Record<string, { total: number; completed: number; inReview: number; inProgress: number; notStarted: number }>;
  deptStatsLoading: boolean;
}

const AppStateContext = createContext<AppStateContextType | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = !!user;

  // Directory + reference data (always enabled when a user is logged in).
  const directoryQuery = useListDirectory({ query: { queryKey: getListDirectoryQueryKey(), enabled } });
  const categoriesQuery = useListCategories({ query: { queryKey: getListCategoriesQueryKey(), enabled } });
  const tagsQuery = useListTags({ query: { queryKey: getListTagsQueryKey(), enabled } });

  // ---------------------------------------------------------------------
  // AGGREGATE CACHE.
  //
  // These global queries back DASHBOARD WIDGETS AND REPORT TILES ONLY
  // (status counts, department progress, activity feeds). They are NOT used
  // by the long-list views, which each call the underlying useListXxx hooks
  // directly with their own page/pageSize/filter state:
  //
  //   - AnnouncementsPage           → useListAnnouncements (per-page)
  //   - MyActionsPage               → useListAnnouncements (per-tab/page)
  //   - Header notification bell    → useListNotifications (per-page)
  //   - ActivityLogPage             → useListAuditLog       (per-page)
  //
  // Announcements and sub-components page through the FULL visible dataset
  // (see the fetch-all queries below) so KPIs/Department Progress are
  // accurate and uncapped. Comments and notifications are not aggregated
  // into counts, so they stay on a single bounded page.
  // ---------------------------------------------------------------------
  const AGGREGATE_PAGE_SIZE = 200;
  const GLOBAL_PAGE_PARAMS = { page: 1, pageSize: AGGREGATE_PAGE_SIZE } as const;
  // Dashboard KPIs and Department Progress aggregate over the entire visible
  // dataset, so these two global queries page through every result rather than
  // capping at a single page. Keyed under `/api/announcements` and
  // `/api/sub-components` so the broad list invalidations below still refresh
  // them after any mutation.
  const announcementsQuery = useQuery({
    queryKey: ['/api/announcements', 'global-all'],
    queryFn: async () => {
      const { items, total } = await fetchAllPages(async (page, pageSize) => {
        const res = await listAnnouncements({ page, pageSize });
        return { items: res.announcements, total: res.total };
      });
      return { announcements: items, total };
    },
    enabled,
    staleTime: 30_000,
  });
  const subComponentsQuery = useQuery({
    queryKey: ['/api/sub-components', 'global-all'],
    queryFn: async () => {
      const { items, total } = await fetchAllPages(async (page, pageSize) => {
        const res = await listSubComponents({ page, pageSize });
        return { items: res.subComponents, total: res.total };
      });
      return { subComponents: items, total };
    },
    enabled,
    staleTime: 30_000,
  });
  const commentsQuery = useListComments(
    { page: GLOBAL_PAGE_PARAMS.page, pageSize: GLOBAL_PAGE_PARAMS.pageSize },
    { query: { queryKey: getListCommentsQueryKey({ page: GLOBAL_PAGE_PARAMS.page, pageSize: GLOBAL_PAGE_PARAMS.pageSize }), enabled } },
  );
  const notificationsQuery = useListNotifications(
    { page: GLOBAL_PAGE_PARAMS.page, pageSize: GLOBAL_PAGE_PARAMS.pageSize },
    { query: { queryKey: getListNotificationsQueryKey({ page: GLOBAL_PAGE_PARAMS.page, pageSize: GLOBAL_PAGE_PARAMS.pageSize }), enabled, refetchInterval: 30_000 } },
  );

  // Department Progress / Key Highlights counts come from the uncapped
  // aggregate endpoint. draftMode 'own' matches the dashboard's
  // filterVisibleAnnouncements (a creator still counts their own drafts) and
  // reconciles the old by-department endpoint, which counted ALL drafts.
  const deptStatsQuery = useQuery({
    queryKey: ['announcements-aggregate', { groupBy: 'department', draftMode: 'own' }],
    queryFn: async () => {
      const res = await fetch('/api/announcements/aggregate?groupBy=department&draftMode=own', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch department stats');
      return res.json() as Promise<{ buckets: Array<{ key: string; total: number; completed: number; inReview: number; inProgress: number; notStarted: number }> }>;
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const deptStats = useMemo(() => {
    const out: Record<string, { total: number; completed: number; inReview: number; inProgress: number; notStarted: number }> = {};
    for (const b of deptStatsQuery.data?.buckets ?? []) {
      out[b.key] = { total: b.total, completed: b.completed, inReview: b.inReview, inProgress: b.inProgress, notStarted: b.notStarted };
    }
    return out;
  }, [deptStatsQuery.data]);
  const deptStatsLoading = deptStatsQuery.isPending;

  const initialDataPending =
    enabled && (
      directoryQuery.isPending ||
      categoriesQuery.isPending ||
      tagsQuery.isPending ||
      announcementsQuery.isPending ||
      subComponentsQuery.isPending ||
      commentsQuery.isPending ||
      notificationsQuery.isPending
    );

  const users: MockUser[] = useMemo(
    () => (directoryQuery.data?.users ?? []).map(directoryToMock),
    [directoryQuery.data],
  );
  const usersById = useMemo(() => {
    const m = new Map<number, MockUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);
  // Master soft-disable: only active rows surface in dropdowns. Consumers
  // editing a record whose stored value points at a now-disabled master
  // entry are expected to add a per-form fallback that re-injects the
  // current value so it remains visible/selectable for that record.
  const categoryOptions: string[] = useMemo(
    () => (categoriesQuery.data?.categories ?? []).filter((c) => c.isActive).map((c) => c.name),
    [categoriesQuery.data],
  );
  const tagOptions: string[] = useMemo(
    () => (tagsQuery.data?.tags ?? []).filter((t) => t.isActive).map((t) => t.name),
    [tagsQuery.data],
  );
  const announcements: Announcement[] = useMemo(
    () => (announcementsQuery.data?.announcements ?? []).map((a) => apiAnnouncementToLocal(a, usersById)),
    [announcementsQuery.data, usersById],
  );
  const announcementVersionById = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of announcementsQuery.data?.announcements ?? []) m.set(a.id, a.version);
    return m;
  }, [announcementsQuery.data]);
  const subComponents: SubComponent[] = useMemo(
    () => (subComponentsQuery.data?.subComponents ?? []).map(apiSubComponentToLocal),
    [subComponentsQuery.data],
  );
  const comments: AnnouncementComment[] = useMemo(
    () => (commentsQuery.data?.comments ?? []).map(apiCommentToLocal),
    [commentsQuery.data],
  );
  const notifications: Notification[] = useMemo(
    () => (notificationsQuery.data?.notifications ?? []).map(apiNotificationToLocal),
    [notificationsQuery.data],
  );

  // Mutations
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();
  const reassignActivitiesMutation = useReassignUserActivities();
  const createCategoryMutation = useCreateCategory();
  const createTagMutation = useCreateTag();
  const createAnnouncementMutation = useCreateAnnouncement();
  const updateAnnouncementMutation = useUpdateAnnouncement();
  const submitMutation = useSubmitAnnouncement();
  const reviewMutation = useReviewAnnouncement();
  const acceptMutation = useAcceptAnnouncement();
  const reconsiderMutation = useReconsiderAnnouncement();
  const finalAcceptMutation = useFinalAcceptAnnouncement();
  const startProgressMutation = useStartAnnouncementProgress();
  const requestCompletionMutation = useRequestAnnouncementCompletion();
  const reviewCompletionMutation = useReviewAnnouncementCompletion();
  const reviewCmoCompletionMutation = useReviewCmoCompletion();
  const createSubComponentMutation = useCreateSubComponent();
  const patchSubComponentMutation = usePatchSubComponent();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();
  const dropMutation = useDropAnnouncement();
  const holdMutation = useHoldAnnouncement();
  const resumeMutation = useResumeAnnouncement();

  const invalidateUsers = () => {
    void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListDirectoryQueryKey() });
  };
  const invalidateCategories = () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
  const invalidateTags = () => queryClient.invalidateQueries({ queryKey: getListTagsQueryKey() });

  const invalidateWorkflow = (id?: number) => {
    void queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListSubComponentsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    if (id != null) void queryClient.invalidateQueries({ queryKey: getGetAnnouncementQueryKey(id) });
  };

  const versionFor = (id: number): number | undefined => announcementVersionById.get(id);

  // ---- Reference data ---------------------------------------------------
  const addCategoryOption = (option: string) => {
    const trimmed = option.trim();
    if (!trimmed || categoryOptions.includes(trimmed)) return;
    createCategoryMutation.mutate(
      { data: { name: trimmed } },
      { onSuccess: () => { void invalidateCategories(); } },
    );
  };

  const addTagOption = (option: string) => {
    const trimmed = option.trim();
    if (!trimmed || tagOptions.includes(trimmed)) return;
    createTagMutation.mutate(
      { data: { name: trimmed } },
      { onSuccess: () => { void invalidateTags(); } },
    );
  };

  // ---- Announcements ----------------------------------------------------
  const addAnnouncement = async (
    data: Omit<Announcement, 'id' | 'uniqueId' | 'workflowStatus' | 'createdBy' | 'house' | 'constituencyNumber'>,
  ): Promise<number | null> => {
    if (!user) return null;
    const result = await createAnnouncementMutation.mutateAsync({
      data: {
        title: data.title,
        date: data.date,
        description: data.description,
        department: data.department,
        occasion: data.occasion,
        location: data.location,
        district: data.district ?? null,
        block: data.block ?? null,
        category: data.category ?? null,
        otherCategory: data.otherCategory ?? null,
        tags: data.tags ?? [],
      },
    });
    invalidateWorkflow();
    return result?.announcement?.id ?? null;
  };

  const updateAnnouncement = async (
    id: number,
    data: Partial<Omit<Announcement, 'id' | 'uniqueId' | 'workflowStatus' | 'createdBy'>>,
  ): Promise<boolean> => {
    if (!user) return false;
    const version = versionFor(id);
    if (version == null) return false;
    try {
      await updateAnnouncementMutation.mutateAsync({
        id,
        data: {
          version,
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.date !== undefined ? { date: data.date } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.department !== undefined ? { department: data.department } : {}),
          ...(data.occasion !== undefined ? { occasion: data.occasion } : {}),
          ...(data.location !== undefined ? { location: data.location } : {}),
          ...(data.district !== undefined ? { district: data.district ?? null } : {}),
          ...(data.block !== undefined ? { block: data.block ?? null } : {}),
          ...(data.category !== undefined ? { category: data.category ?? null } : {}),
          ...(data.otherCategory !== undefined ? { otherCategory: data.otherCategory ?? null } : {}),
          ...(data.tags !== undefined ? { tags: data.tags } : {}),
        },
      });
      // The server transitions reverted_by_cmo → pending_cmo_review or
      // reverted_by_dept_reviewer → pending_completion_review automatically
      // inside the same transaction; nothing else for the client to do
      // besides invalidate.
      invalidateWorkflow(id);
      return true;
    } catch (err: unknown) {
      // Re-throw so callers can surface the real server message (e.g. a 400
      // validation failure). ApiError extends Error and already has the server
      // message set; re-parsing the response body is unnecessary and would
      // fail because the body has already been consumed by customFetch.
      if (err instanceof Error) throw err;
      return false;
    }
  };

  const reviewAnnouncement = (id: number, action: 'approve' | 'revert', comment: string) => {
    const version = versionFor(id);
    if (version == null) return;
    reviewMutation.mutate(
      { id, data: { version, action, comment } },
      { onSuccess: () => invalidateWorkflow(id) },
    );
  };

  const acceptAnnouncement = (id: number) => {
    const version = versionFor(id);
    if (version == null) return;
    acceptMutation.mutate(
      { id, data: { version } },
      { onSuccess: () => invalidateWorkflow(id) },
    );
  };

  const reconsiderAnnouncement = async (id: number, comment: string): Promise<void> => {
    const version = versionFor(id);
    if (version == null) return;
    await reconsiderMutation.mutateAsync({ id, data: { version, comment } });
    invalidateWorkflow(id);
  };

  const finalAcceptAnnouncement = (id: number) => {
    const version = versionFor(id);
    if (version == null) return;
    finalAcceptMutation.mutate(
      { id, data: { version } },
      { onSuccess: () => invalidateWorkflow(id) },
    );
  };

  const dropAnnouncement = async (id: number, remarks: string): Promise<void> => {
    const version = versionFor(id);
    if (version == null) return;
    await dropMutation.mutateAsync({ id, data: { version, remarks } });
    invalidateWorkflow(id);
  };

  const holdAnnouncement = async (id: number, remarks: string): Promise<void> => {
    const version = versionFor(id);
    if (version == null) return;
    await holdMutation.mutateAsync({ id, data: { version, remarks } });
    invalidateWorkflow(id);
  };

  const resumeAnnouncement = async (id: number, version: number): Promise<void> => {
    // Version is passed explicitly from the detail page's per-id query (the
    // authoritative current version) rather than the aggregate list cache, so
    // Resume always issues the request and surfaces 409/refresh errors.
    await resumeMutation.mutateAsync({ id, data: { version } });
    invalidateWorkflow(id);
  };

  // The legacy in-memory API exposed `setAnnouncementStatus(id, status)` but
  // every caller (and the UX) only ever uses it to flip an accepted item to
  // `in_progress`. Keep that single transition; ignore the rest.
  const setAnnouncementStatus = (id: number, status: WorkflowStatus) => {
    if (status !== 'in_progress') return;
    const version = versionFor(id);
    if (version == null) return;
    startProgressMutation.mutate(
      { id, data: { version } },
      { onSuccess: () => invalidateWorkflow(id) },
    );
  };

  const requestCompletion = (id: number) => {
    const version = versionFor(id);
    if (version == null) return;
    requestCompletionMutation.mutate(
      { id, data: { version } },
      { onSuccess: () => invalidateWorkflow(id) },
    );
  };

  const reviewCompletion = (id: number, action: 'approve' | 'revert', comment: string) => {
    const version = versionFor(id);
    if (version == null) return;
    reviewCompletionMutation.mutate(
      { id, data: { version, action, comment } },
      { onSuccess: () => invalidateWorkflow(id) },
    );
  };

  const reviewCMOCompletion = (id: number, action: 'approve' | 'revert', comment: string) => {
    const version = versionFor(id);
    if (version == null) return;
    reviewCmoCompletionMutation.mutate(
      { id, data: { version, action, comment } },
      { onSuccess: () => invalidateWorkflow(id) },
    );
  };

  // ---- Sub-components ---------------------------------------------------
  const addSubComponent = (data: Omit<SubComponent, 'id'>) => {
    createSubComponentMutation.mutate(
      {
        data: {
          announcementId: data.announcementId,
          title: data.title,
          description: data.description,
          assignedTo: data.assignedTo ? data.assignedTo : null,
          status: data.status,
        },
      },
      { onSuccess: () => invalidateWorkflow(data.announcementId) },
    );
  };

  const updateSubComponentAssignment = (id: number, assignedTo: number, _assignedToName: string) => {
    const sc = subComponents.find(s => s.id === id);
    patchSubComponentMutation.mutate(
      { id, data: { assignedTo } },
      { onSuccess: () => invalidateWorkflow(sc?.announcementId) },
    );
  };

  const updateSubComponentStatus = (id: number, status: SubComponent['status']) => {
    const sc = subComponents.find(s => s.id === id);
    patchSubComponentMutation.mutate(
      { id, data: { status } },
      { onSuccess: () => invalidateWorkflow(sc?.announcementId) },
    );
  };

  // ---- Users ------------------------------------------------------------
  const addUser = async (data: Omit<MockUser, 'id'>) => {
    if (!data.password) throw new Error('Password is required when adding a user');
    await createUserMutation.mutateAsync({
      data: {
        username: data.username,
        password: data.password,
        name: data.name,
        role: data.role,
        department: data.department ?? null,
        email: data.email,
        mobile: data.mobile ?? null,
        status: data.status,
      },
    });
    invalidateUsers();
  };

  const updateUser = async (id: number, data: Partial<Omit<MockUser, 'id'>>) => {
    await updateUserMutation.mutateAsync({
      id,
      data: {
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.department !== undefined ? { department: data.department ?? null } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.mobile !== undefined ? { mobile: data.mobile ?? null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });
    invalidateUsers();
  };

  const deleteUser = async (id: number) => {
    await deleteUserMutation.mutateAsync({ id });
    invalidateUsers();
  };

  const getUserWorkload = (id: number) => fetchUserWorkloadApi(id);

  const reassignActivities = async (
    id: number,
    assignments: { subComponentId: number; newAssignedTo: number }[],
  ) => {
    await reassignActivitiesMutation.mutateAsync({ id, data: { assignments } });
    // Reassignment touches sub-components, comments and notifications, so
    // refresh the workflow caches as well as the user list.
    invalidateUsers();
    invalidateWorkflow();
  };

  // ---- Notifications ----------------------------------------------------
  // Fan-out happens on the server. The legacy `addNotification` was only
  // called from inside this module; expose it as a no-op for API parity.
  const addNotification = (_userId: number, _message: string, _type: Notification['type'], _link?: string) => {
    /* server-side fan-out — no-op on client */
  };

  const markNotificationRead = (id: number) => {
    markReadMutation.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) },
    );
  };

  const markAllNotificationsRead = () => {
    markAllReadMutation.mutate(
      undefined,
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) },
    );
  };

  const getUnreadCount = (userId: number) => {
    if (!user || user.id !== userId) return 0;
    return notifications.filter(n => !n.read).length;
  };

  return (
    <AppStateContext.Provider value={{
      announcements, comments, subComponents, notifications, users,
      categoryOptions, tagOptions, addCategoryOption, addTagOption,
      addAnnouncement, updateAnnouncement, reviewAnnouncement, acceptAnnouncement, reconsiderAnnouncement, finalAcceptAnnouncement, setAnnouncementStatus,
      dropAnnouncement, holdAnnouncement, resumeAnnouncement,
      updateSubComponentAssignment,
      requestCompletion, reviewCompletion, reviewCMOCompletion,
      addSubComponent, updateSubComponentStatus, addUser, updateUser, deleteUser,
      getUserWorkload, reassignActivities,
      addNotification, markNotificationRead, markAllNotificationsRead, getUnreadCount,
      deptStats,
      deptStatsLoading,
    }}>
      {initialDataPending ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#1a3a5c', fontSize: 28, fontWeight: 600 }}>
          Loading…
        </div>
      ) : (
        children
      )}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used within AppStateProvider');
  return context;
}
