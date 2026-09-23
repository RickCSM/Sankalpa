import { useState } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { roleLabels, type UserRole } from '@/data/mockData';
import { useSortableTable } from '@/hooks/useSortableTable';
import SortableHeader from '@/components/SortableHeader';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';

import { useListUsers, useListDepartments, useResetUserPassword } from '@workspace/api-client-react';
import type { PendingActivity, EligibleAssignee } from '@workspace/api-client-react';
import ResetPasswordModal from '@/components/ResetPasswordModal';
import ReassignActivitiesModal from '@/components/ReassignActivitiesModal';

function ResetPasswordModalWrapper({ target, onClose }: { target: { id: number; username: string; name: string }; onClose: () => void }) {
  const mutation = useResetUserPassword();
  return (
    <ResetPasswordModal
      targetId={target.id}
      targetUsername={target.username}
      targetName={target.name}
      onClose={onClose}
      resetFn={(args) => mutation.mutateAsync(args)}
    />
  );
}

const allRoles: UserRole[] = ['admin', 'chief_minister', 'cmo_nodal', 'cmo_reviewer', 'ocac_viewer', 'dept_head', 'dept_nodal', 'dept_reviewer', 'dept_user', 'dept_viewer'];
const deptNodalAllowedRoles: UserRole[] = ['dept_reviewer', 'dept_user', 'dept_viewer'];

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffMs = Date.now() - t;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function UsersPage() {
  const { user } = useAuth();
  const { addUser, updateUser, deleteUser, getUserWorkload, reassignActivities } = useAppState();
  const confirm = useConfirmDialog();
  const isAdmin = user?.role === 'admin';
  const isDeptNodalScope = user?.role === 'dept_nodal';
  const usersQuery = useListUsers();
  const departmentsQuery = useListDepartments();
  // /api/users is server-scoped (admin sees all; dept_nodal sees only
  // dept_reviewer + dept_user in their own department), so the list returned
  // here is already the authorized set.
  const visibleUsers = (usersQuery.data?.users ?? []).map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role as UserRole,
    department: u.department ?? undefined,
    email: u.email,
    mobile: u.mobile ?? undefined,
    status: u.status,
    lastPasswordChange: u.lastPasswordChange ?? null,
  }));
  const departmentList = (departmentsQuery.data?.departments ?? []).map((d) => d.name);
  const availableRoles = isDeptNodalScope ? deptNodalAllowedRoles : allRoles;
  const [showAddForm, setShowAddForm] = useState(false);

  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: number; username: string; name: string } | null>(null);
  const [reassignState, setReassignState] = useState<{
    user: { id: number; name: string };
    action: 'deactivate' | 'delete';
    pendingActivities: PendingActivity[];
    eligibleAssignees: EligibleAssignee[];
  } | null>(null);
  const [actionError, setActionError] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    role: '' as UserRole | '',
    department: '',
    email: '',
    mobile: '',
  });
  const [mobileError, setMobileError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { sortedData: sortedUsers, sortConfig: userSortConfig, requestSort: requestUserSort } = useSortableTable(visibleUsers);

  const validateMobile = (val: string) => {
    if (val && !/^\d{10}$/.test(val)) return 'Mobile number must be exactly 10 digits';
    return '';
  };

  const validateEmail = (val: string) => {
    if (!val.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.trim())) return 'Enter a valid email address (e.g. name@domain.com)';
    return '';
  };

  const resetForm = () => {
    setFormData({ username: '', password: '', name: '', role: '', department: '', email: '', mobile: '' });
    setMobileError('');
    setEmailError('');
    setSubmitError('');
    setShowAddForm(false);
    setEditingUserId(null);
  };

  const extractError = (err: unknown): string =>
    getFriendlyErrorMessage(err, 'Could not save the user. Please try again.');

  const handleAdd = async () => {
    const mobileErr = validateMobile(formData.mobile);
    if (mobileErr) { setMobileError(mobileErr); return; }
    const emailErr = validateEmail(formData.email);
    if (emailErr) { setEmailError(emailErr); return; }
    if (!formData.username || !formData.password || !formData.name || !formData.role) return;
    if (isDeptNodalScope && !deptNodalAllowedRoles.includes(formData.role as UserRole)) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await addUser({
        username: formData.username,
        password: formData.password,
        name: formData.name,
        role: formData.role as UserRole,
        department: isDeptNodalScope ? (user?.department || '') : (formData.department || user?.department || ''),
        email: formData.email,
        mobile: formData.mobile || undefined,
        status: 'Active',
      });
      resetForm();
    } catch (err) {
      setSubmitError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (u: typeof visibleUsers[number]) => {
    setEditingUserId(u.id);
    setMobileError('');
    setSubmitError('');
    setFormData({
      username: u.username,
      password: '',
      name: u.name,
      role: u.role,
      department: u.department || '',
      email: u.email,
      mobile: u.mobile || '',
    });
    setShowAddForm(true);
  };

  const handleUpdate = async () => {
    const mobileErr = validateMobile(formData.mobile);
    if (mobileErr) { setMobileError(mobileErr); return; }
    const emailErr = validateEmail(formData.email);
    if (emailErr) { setEmailError(emailErr); return; }
    if (!editingUserId || !formData.name || !formData.role) return;
    if (isDeptNodalScope && !deptNodalAllowedRoles.includes(formData.role as UserRole)) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await updateUser(editingUserId, {
        username: formData.username,
        name: formData.name,
        role: formData.role as UserRole,
        department: isDeptNodalScope ? (user?.department || '') : (formData.department || user?.department || ''),
        email: formData.email,
        mobile: formData.mobile || undefined,
      });
      resetForm();
    } catch (err) {
      setSubmitError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const canMutate = (target: { id: number; role: UserRole; department?: string }) => {
    if (!user) return false;
    if (target.id === user.id) return false;
    if (isDeptNodalScope) {
      if (target.department !== user.department) return false;
      if (!deptNodalAllowedRoles.includes(target.role)) return false;
    }
    return true;
  };

  const confirmDelete = (target: { id: number; name: string }) => {
    void confirm({
      title: 'Delete this user?',
      message: `User "${target.name}" will be permanently removed. This action is irreversible.`,
      confirmLabel: 'Yes, Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteUser(target.id);
        } catch (err) {
          setActionError(extractError(err));
        }
      },
    });
  };

  const confirmDeactivate = (target: { id: number; name: string }) => {
    void confirm({
      title: 'Deactivate this user?',
      message: `User "${target.name}" will be marked as Inactive.`,
      confirmLabel: 'Yes, Deactivate',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await updateUser(target.id, { status: 'Inactive' });
        } catch (err) {
          setActionError(extractError(err));
        }
      },
    });
  };

  // Before deactivating or deleting, check whether the user still owns pending
  // activities. If so, open the reassignment dialog; otherwise proceed directly.
  const startRemoval = async (target: { id: number; name: string }, action: 'deactivate' | 'delete') => {
    setActionError('');
    let workload;
    try {
      workload = await getUserWorkload(target.id);
    } catch (err) {
      setActionError(extractError(err));
      return;
    }
    if (workload.pendingActivities.length > 0) {
      setReassignState({
        user: target,
        action,
        pendingActivities: workload.pendingActivities,
        eligibleAssignees: workload.eligibleAssignees,
      });
      return;
    }
    if (action === 'delete') confirmDelete(target);
    else confirmDeactivate(target);
  };

  const handleDelete = (id: number) => {
    const target = visibleUsers.find(u => u.id === id);
    if (!target || !canMutate(target)) return;
    void startRemoval({ id: target.id, name: target.name }, 'delete');
  };

  const handleDeactivate = (id: number) => {
    const target = visibleUsers.find(u => u.id === id);
    if (!target || !canMutate(target)) return;
    if (target.status !== 'Active') {
      // Reactivation never needs reassignment.
      void confirm({
        title: 'Reactivate this user?',
        message: `User "${target.name}" will be marked as Active.`,
        confirmLabel: 'Yes, Reactivate',
        variant: 'primary',
        onConfirm: async () => {
          try {
            await updateUser(id, { status: 'Active' });
          } catch (err) {
            setActionError(extractError(err));
          }
        },
      });
      return;
    }
    void startRemoval({ id: target.id, name: target.name }, 'deactivate');
  };

  // Reassign all pending activities, then carry out the original removal. A
  // reassignment failure bubbles up to the modal; a removal failure (e.g. the
  // user authored announcements) is surfaced as a page-level message since the
  // activities are by then already safely reassigned.
  const handleReassignConfirm = async (assignments: { subComponentId: number; newAssignedTo: number }[]) => {
    if (!reassignState) return;
    const { user: target, action } = reassignState;
    await reassignActivities(target.id, assignments);
    try {
      if (action === 'delete') await deleteUser(target.id);
      else await updateUser(target.id, { status: 'Inactive' });
    } catch (err) {
      setReassignState(null);
      setActionError(extractError(err));
      return;
    }
    setReassignState(null);
  };

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <div className="page-header">
            <h4>Manage Users{isDeptNodalScope && user?.department ? ` — ${user.department}` : ''}</h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-add" onClick={() => {
                resetForm();
                if (isDeptNodalScope && user?.department) {
                  setFormData(p => ({ ...p, department: user.department || '' }));
                }
                setShowAddForm(true);
              }}>
                <i className="bi bi-plus-lg"></i> Add User
              </button>
            </div>
          </div>

          {actionError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>{actionError}</span>
              <button onClick={() => setActionError('')} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#dc2626', lineHeight: 1 }}>×</button>
            </div>
          )}

          {showAddForm && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a3a5c' }}>
                  {editingUserId ? 'Edit User' : 'Add New User'}
                </h5>
                {submitError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, color: '#dc2626', fontSize: 13 }}>
                    {submitError}
                  </div>
                )}
                <div className="form-grid">
                  <div className="form-group">
                    <label>Full Name <span className="required">*</span></label>
                    <input type="text" placeholder="Enter full name" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Email <span className="required">*</span></label>
                    <input
                      type="email"
                      placeholder="Enter email (e.g. name@domain.com)"
                      value={formData.email}
                      style={emailError ? { borderColor: '#dc2626', boxShadow: '0 0 0 2px rgba(220,38,38,0.12)' } : undefined}
                      onChange={e => {
                        const val = e.target.value;
                        setFormData(p => ({ ...p, email: val }));
                        setEmailError(val ? validateEmail(val) : '');
                      }}
                    />
                    {emailError && <span className="field-error">{emailError}</span>}
                  </div>
                  <div className="form-group">
                    <label>Username <span className="required">*</span></label>
                    <input type="text" placeholder="Enter username" value={formData.username} onChange={e => setFormData(p => ({ ...p, username: e.target.value }))} />
                  </div>
                  {!editingUserId && (
                    <div className="form-group">
                      <label>Password <span className="required">*</span></label>
                      <input type="password" placeholder="Enter password" value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} />
                    </div>
                  )}
                  {editingUserId && (
                    <div className="form-group" style={{ alignSelf: 'end' }}>
                      <label style={{ visibility: 'hidden' }}>Password</label>
                      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                        Passwords cannot be edited here. Use <strong>Reset password</strong> on the user row to issue a new one.
                      </div>
                    </div>
                  )}
                  <div className="form-group">
                    <label>Role <span className="required">*</span></label>
                    <select value={formData.role} onChange={e => setFormData(p => ({ ...p, role: e.target.value as UserRole }))}>
                      <option value="">Select Role</option>
                      {availableRoles.map(r => (
                        <option key={r} value={r}>{roleLabels[r]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Department</label>
                    {isDeptNodalScope ? (
                      <input type="text" value={user?.department || ''} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
                    ) : (
                      <select value={formData.department} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))}>
                        <option value="">Select Department</option>
                        {departmentList.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Mobile Number</label>
                    <input
                      type="tel"
                      placeholder="Enter 10-digit mobile number"
                      value={formData.mobile}
                      maxLength={10}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setFormData(p => ({ ...p, mobile: val }));
                        setMobileError(val ? (val.length < 10 ? 'Mobile number must be exactly 10 digits' : '') : '');
                      }}
                    />
                    {mobileError && <span className="field-error">{mobileError}</span>}
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn-submit" disabled={submitting} onClick={editingUserId ? handleUpdate : handleAdd}>
                    <i className="bi bi-check-lg" style={{ marginRight: 6 }}></i>
                    {submitting ? 'Saving…' : (editingUserId ? 'Update User' : 'Add User')}
                  </button>
                  <button className="btn-cancel" onClick={resetForm} disabled={submitting}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-body">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      <SortableHeader label="Name" sortKey="name" sortConfig={userSortConfig} onSort={requestUserSort} />
                      <SortableHeader label="Email" sortKey="email" sortConfig={userSortConfig} onSort={requestUserSort} />
                      <SortableHeader label="Mobile" sortKey="mobile" sortConfig={userSortConfig} onSort={requestUserSort} />
                      <SortableHeader label="Role" sortKey="role" sortConfig={userSortConfig} onSort={requestUserSort} />
                      <SortableHeader label="Department" sortKey="department" sortConfig={userSortConfig} onSort={requestUserSort} />
                      <SortableHeader label="Status" sortKey="status" sortConfig={userSortConfig} onSort={requestUserSort} />
                      <th>Last Password Change</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map((u, idx) => (
                      <tr key={u.id}>
                        <td>{idx + 1}</td>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>{u.mobile || '-'}</td>
                        <td><span className="status-badge in-progress">{roleLabels[u.role]}</span></td>
                        <td>{u.department || '-'}</td>
                        <td>
                          <span className={`status-badge ${u.status === 'Active' ? 'completed' : 'not-started'}`}>
                            {u.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>
                          {u.lastPasswordChange ? (
                            <span
                              title={`${formatAbsolute(u.lastPasswordChange.at)} by ${u.lastPasswordChange.actorName ?? 'unknown'} (${u.lastPasswordChange.action === 'auth.admin_reset_password' ? 'reset by admin/nodal' : 'self-change'})`}
                            >
                              {formatRelativeTime(u.lastPasswordChange.at)}
                              <br />
                              <span style={{ color: '#6b7280', fontSize: 11 }}>
                                by {u.lastPasswordChange.actorId === u.id ? 'self' : (u.lastPasswordChange.actorName ?? 'unknown')}
                              </span>
                            </span>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>Never</span>
                          )}
                        </td>
                        <td>
                          {canMutate(u) ? (
                            <>
                              <button
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a3a5c' }}
                                onClick={() => handleEdit(u)}
                                title="Edit"
                              >
                                <i className="bi bi-pencil"></i>
                              </button>
                              {/* canMutate already enforces self-exclusion and (for dept_nodal)
                                  the same-department + dept_reviewer/dept_user gating that the
                                  server applies. */}
                              <button
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0ea5e9', marginLeft: 8 }}
                                onClick={() => setResetTarget({ id: u.id, username: u.username, name: u.name })}
                                title="Reset password"
                              >
                                <i className="bi bi-key"></i>
                              </button>
                              {isAdmin ? (
                                <button
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc3545', marginLeft: 8 }}
                                  onClick={() => handleDelete(u.id)}
                                  title="Delete"
                                >
                                  <i className="bi bi-trash"></i>
                                </button>
                              ) : (
                                <button
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: u.status === 'Active' ? '#dc3545' : '#16a34a', marginLeft: 8 }}
                                  onClick={() => handleDeactivate(u.id)}
                                  title={u.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                                >
                                  <i className={u.status === 'Active' ? 'bi bi-person-x' : 'bi bi-person-check'}></i>
                                </button>
                              )}
                            </>
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      {resetTarget && (
        <ResetPasswordModalWrapper
          target={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
      {reassignState && (
        <ReassignActivitiesModal
          targetName={reassignState.user.name}
          action={reassignState.action}
          pendingActivities={reassignState.pendingActivities}
          eligibleAssignees={reassignState.eligibleAssignees}
          onConfirm={handleReassignConfirm}
          onCancel={() => setReassignState(null)}
        />
      )}
    </Layout>
  );
}
