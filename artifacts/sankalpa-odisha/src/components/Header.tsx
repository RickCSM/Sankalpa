import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import {
  useListNotifications,
  getListNotificationsQueryKey,
} from '@workspace/api-client-react';
import { roleLabels, formatDateTime } from '@/data/mockData';
import BrandImage from '@/components/BrandImage';
import { profilePhotoUrl } from '@/lib/profilePhoto';
import ProcedureGuideModal from '@/components/ProcedureGuideModal';

export default function Header() {
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const { user, logout, can } = useAuth();
  const { markNotificationRead, markAllNotificationsRead } = useAppState();
  // Fetch only the first page of notifications for the bell dropdown.
  const notifParams = { page: 1, pageSize: 10 } as const;
  const notifQuery = useListNotifications(notifParams, {
    query: { queryKey: getListNotificationsQueryKey(notifParams), enabled: !!user, refetchInterval: 30_000 },
  });
  const unreadParams = { page: 1, pageSize: 1, unreadOnly: true } as const;
  const unreadQuery = useListNotifications(unreadParams, {
    query: { queryKey: getListNotificationsQueryKey(unreadParams), enabled: !!user, refetchInterval: 30_000 },
  });
  const [avatarError, setAvatarError] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);
  const [usersDropdown, setUsersDropdown] = useState(false);
  const [reportDropdown, setReportDropdown] = useState(false);
  const [mastersDropdown, setMastersDropdown] = useState(false);
  const [notifDropdown, setNotifDropdown] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const usersRef = useRef<HTMLLIElement>(null);
  const reportRef = useRef<HTMLLIElement>(null);
  const mastersRef = useRef<HTMLLIElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = unreadQuery.data?.total ?? 0;
  const myNotifications = (notifQuery.data?.notifications ?? []).slice(0, 10);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserDropdown(false);
      if (usersRef.current && !usersRef.current.contains(e.target as Node)) setUsersDropdown(false);
      if (reportRef.current && !reportRef.current.contains(e.target as Node)) {
        setReportDropdown(false);
      }
      if (mastersRef.current && !mastersRef.current.contains(e.target as Node)) {
        setMastersDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isActive = (path: string) => location === path;

  const handleLogout = () => {
    logout();
  };

  const photoUrl = profilePhotoUrl(user?.profileImagePath);

  // Reset the broken-image flag whenever the photo (or user) changes, so a new
  // upload gets a fresh chance to load after a previous one failed.
  useEffect(() => {
    setAvatarError(false);
  }, [photoUrl]);

  const roleName = user ? roleLabels[user.role] : '';

  const displayName = user?.name?.trim() || 'User';
  const avatarInitials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
    <header className="fixed">
      <nav className="navbar">
        <div className="container-fluid">
          <a className="navbar-brand" href="#" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
            <BrandImage file="odisha-logo.png" alt="Logo" />
            <h5 style={{ display: 'flex', flexDirection: 'column', marginBottom: 0, lineHeight: 1.2, fontWeight: 700 }}>
              Sankalpa Odisha
              <span className="sub-text" style={{ fontWeight: 400 }}>Government of Odisha</span>
            </h5>
          </a>

          <ul className="navbar-nav">
            {can('view_dashboard') && (
              <li className="nav-item">
                <a className={`nav-link ${isActive('/') ? 'active' : ''}`} onClick={() => navigate('/')}>Dashboard</a>
              </li>
            )}
            {can('view_announcements_menu') && (
              <li className="nav-item">
                <a className={`nav-link ${isActive('/announcements') || location.startsWith('/announcements') ? 'active' : ''}`} onClick={() => navigate('/announcements')}>HCM Announcement</a>
              </li>
            )}
            {can('view_uoi_notes') && (
              <li className="nav-item">
                <a className={`nav-link ${isActive('/uoi-notes') ? 'active' : ''}`} onClick={() => navigate('/uoi-notes')}>UOI Notes</a>
              </li>
            )}
            {user?.role !== 'chief_minister' && user?.role !== 'ocac_viewer' && (
              <li className="nav-item">
                <a className={`nav-link ${isActive('/my-actions') ? 'active' : ''}`} onClick={() => navigate('/my-actions')}>
                  My Actions
                </a>
              </li>
            )}
            {can('view_users_menu') && (
              <li className="nav-item" ref={usersRef} style={{ position: 'relative' }}>
                <a className={`nav-link dropdown-toggle ${isActive('/users') || isActive('/user-tagging') || isActive('/activity-log') ? 'active' : ''}`}
                  onClick={() => setUsersDropdown(!usersDropdown)}>Users</a>
                <ul className={`dropdown-menu ${usersDropdown ? 'show' : ''}`}>
                  <li className="nav-item">
                    <a className="dropdown-item" onClick={() => { navigate('/users'); setUsersDropdown(false); }}>Manage Users</a>
                  </li>
                  {can('manage_all_users') && (
                    <li className="nav-item">
                      <a className="dropdown-item" onClick={() => { navigate('/user-tagging'); setUsersDropdown(false); }}>User Tagging</a>
                    </li>
                  )}
                  {can('view_audit_log') && (
                    <li className="nav-item">
                      <a className="dropdown-item" onClick={() => { navigate('/activity-log'); setUsersDropdown(false); }}>Activity Log</a>
                    </li>
                  )}
                </ul>
              </li>
            )}
            {can('manage_master_data') && (
              <li className="nav-item" ref={mastersRef} style={{ position: 'relative' }}>
                <a className={`nav-link dropdown-toggle ${location.startsWith('/masters') ? 'active' : ''}`}
                  onClick={() => setMastersDropdown(!mastersDropdown)}>Masters</a>
                <ul className={`dropdown-menu ${mastersDropdown ? 'show' : ''}`}>
                  <li><a className="dropdown-item" onClick={() => { navigate('/masters/districts'); setMastersDropdown(false); }}>Districts</a></li>
                  <li><a className="dropdown-item" onClick={() => { navigate('/masters/blocks'); setMastersDropdown(false); }}>Blocks</a></li>
                  <li><a className="dropdown-item" onClick={() => { navigate('/masters/occasions'); setMastersDropdown(false); }}>Occasions</a></li>
                  <li><a className="dropdown-item" onClick={() => { navigate('/masters/departments'); setMastersDropdown(false); }}>Departments</a></li>
                  <li><a className="dropdown-item" onClick={() => { navigate('/masters/categories'); setMastersDropdown(false); }}>Categories</a></li>
                  <li><a className="dropdown-item" onClick={() => { navigate('/masters/tags'); setMastersDropdown(false); }}>Tags</a></li>
                </ul>
              </li>
            )}
            {(can('view_reports') || can('view_uoi_reports')) && (
              <li className="nav-item" ref={reportRef} style={{ position: 'relative' }}>
                <a className="nav-link dropdown-toggle" onClick={() => setReportDropdown(!reportDropdown)}>Report</a>
                <ul className={`dropdown-menu ${reportDropdown ? 'show' : ''}`}>
                  {can('view_reports') && (
                    <>
                      <li><a className="dropdown-item" onClick={() => { navigate('/reports/location-wise'); setReportDropdown(false); }}>Location Wise Report</a></li>
                      <li><a className="dropdown-item" onClick={() => { navigate('/reports/department-wise'); setReportDropdown(false); }}>Department Wise Report</a></li>
                      <li><a className="dropdown-item" onClick={() => { navigate('/reports/announcement-progress'); setReportDropdown(false); }}>Announcement & Progress Report</a></li>
                      <li><a className="dropdown-item" onClick={() => { navigate('/reports/occasion-wise'); setReportDropdown(false); }}>Occasion Wise Report</a></li>
                      <li><a className="dropdown-item" onClick={() => { navigate('/reports/aging-analysis'); setReportDropdown(false); }}>Sankalpa Patra Ageing Analysis Report</a></li>
                    </>
                  )}
                  {can('view_uoi_reports') && (
                    <li><a className="dropdown-item" onClick={() => { navigate('/reports/uoi-notes'); setReportDropdown(false); }}>UOI Notes Report</a></li>
                  )}
                </ul>
              </li>
            )}
          </ul>

          <div className="notification-bell" ref={notifRef}>
            <button className="bell-btn" onClick={() => setNotifDropdown(!notifDropdown)}>
              <i className="bi bi-bell"></i>
              {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </button>
            {notifDropdown && (
              <div className="notif-dropdown">
                <div className="notif-header">
                  <strong>Notifications</strong>
                  {unreadCount > 0 && (
                    <button className="mark-all-read" onClick={() => markAllNotificationsRead()}>Mark all read</button>
                  )}
                </div>
                {myNotifications.length === 0 ? (
                  <div className="notif-empty">No notifications</div>
                ) : (
                  <div className="notif-list">
                    {myNotifications.map(n => (
                      <div
                        key={n.id}
                        className={`notif-item ${!n.read ? 'unread' : ''}`}
                        onClick={() => {
                          markNotificationRead(n.id);
                          if (n.link) navigate(n.link);
                          setNotifDropdown(false);
                        }}
                      >
                        <div className="notif-msg">{n.message}</div>
                        <div className="notif-time">{formatDateTime(n.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="user-dropdown" ref={userRef} onClick={() => setUserDropdown(!userDropdown)}>
            {photoUrl && !avatarError ? (
            <img
              className="avatar-photo"
              src={photoUrl}
              alt={displayName}
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className="avatar-initials" role="img" aria-label={displayName}>{avatarInitials}</div>
          )}
            <div className="user-info">
              <small>Welcome,</small>
              <strong>{displayName}</strong>
              <small>{roleName}{user?.department ? ` - ${user.department}` : ''}</small>
            </div>
            <span style={{ color: '#fff', fontSize: 10, marginLeft: 4 }}>&#9662;</span>
            <ul className={`dropdown-menu ${userDropdown ? 'show' : ''}`} style={{ right: 0, left: 'auto', top: '100%', marginTop: 8 }}>
              <li style={{ padding: '8px 16px', borderBottom: '1px solid #eee' }}>
                <div style={{ fontSize: 11, color: '#888' }}>Role</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{roleName}</div>
                {user?.department && (
                  <>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Department</div>
                    <div style={{ fontSize: 13 }}>{user.department}</div>
                  </>
                )}
              </li>
              <li><a className="dropdown-item" onClick={() => { navigate('/profile'); setUserDropdown(false); }}><i className="bi bi-person-circle me-2"></i> My Profile</a></li>
              <li><a className="dropdown-item" onClick={() => { navigate('/change-password'); setUserDropdown(false); }}><i className="bi bi-lock me-2"></i> Change Password</a></li>
              <li><a className="dropdown-item" onClick={() => { setShowGuide(true); setUserDropdown(false); }}><i className="bi bi-journal-text me-2"></i> User Manual</a></li>
              <li><a className="dropdown-item" onClick={handleLogout}><i className="bi bi-box-arrow-right me-2"></i> Logout</a></li>
            </ul>
          </div>
        </div>
      </nav>
    </header>
    <ProcedureGuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} />
    </>
  );
}
