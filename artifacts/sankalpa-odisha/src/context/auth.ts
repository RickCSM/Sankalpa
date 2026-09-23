import { createContext, useContext } from 'react';
import type { UserRole } from '@/data/mockData';

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  department?: string;
  email: string;
  mustChangePassword?: boolean;
  profileImagePath?: string | null;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  can: (action: string) => boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const PERMISSIONS: Record<string, UserRole[]> = {
  'view_all_departments': ['admin', 'chief_minister', 'cmo_nodal', 'cmo_reviewer', 'ocac_viewer'],
  'create_announcement': ['cmo_nodal'],
  'review_announcement_cmo': ['admin', 'cmo_reviewer'],
  'manage_all_users': ['admin'],
  'view_audit_log': ['admin'],
  'manage_master_data': ['admin'],
  'accept_announcement': ['admin', 'dept_nodal'],
  'reconsider_announcement': ['admin', 'dept_nodal'],
  'final_accept_announcement': ['admin', 'dept_reviewer'],
  'add_sub_component': ['admin', 'dept_nodal'],
  'set_completion': ['admin', 'dept_nodal'],
  'review_completion': ['admin', 'dept_reviewer'],
  'view_users_menu': ['admin', 'dept_nodal'],
  'create_dept_user': ['admin', 'dept_nodal'],
  'view_reports': ['admin', 'chief_minister', 'cmo_nodal', 'cmo_reviewer', 'ocac_viewer'],
  'view_announcements_menu': ['admin', 'chief_minister', 'cmo_nodal', 'cmo_reviewer', 'ocac_viewer', 'dept_head', 'dept_nodal', 'dept_reviewer', 'dept_user', 'dept_viewer'],
  'view_dashboard': ['chief_minister', 'cmo_nodal', 'cmo_reviewer', 'ocac_viewer', 'dept_head', 'dept_nodal', 'dept_reviewer', 'dept_user', 'dept_viewer'],
  'view_uoi_notes': ['admin', 'chief_minister', 'cmo_nodal', 'cmo_reviewer', 'ocac_viewer'],
  'manage_uoi_notes': ['admin', 'chief_minister', 'cmo_nodal', 'cmo_reviewer', 'ocac_viewer'],
  'view_uoi_reports': ['admin', 'chief_minister', 'cmo_nodal', 'cmo_reviewer', 'ocac_viewer'],
  'download_uoi_reports': ['admin', 'chief_minister', 'cmo_nodal', 'cmo_reviewer', 'ocac_viewer'],
};

export function fromSession(u: { id: number; username: string; name: string; role: UserRole; department?: string | null; email: string; profileImagePath?: string | null }): AuthUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    department: u.department ?? undefined,
    email: u.email,
    profileImagePath: u.profileImagePath ?? null,
  };
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
