import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import AnnouncementsPage from "@/pages/AnnouncementsPage";
import AddAnnouncementPage from "@/pages/AddAnnouncementPage";
import AnnouncementDetailPage from "@/pages/AnnouncementDetailPage";
import UsersPage from "@/pages/UsersPage";
import UserTaggingPage from "@/pages/UserTaggingPage";
import { LocationWiseReport, LocationDetailReport, DepartmentWiseReport, DepartmentDetailReport, AnnouncementProgressReport, OccasionWiseReport, AgingAnalysisReport } from "@/pages/AnnouncementReports";
import MyActionsPage from "@/pages/MyActionsPage";
import ActivityLogPage from "@/pages/ActivityLogPage";
import ChangePasswordPage from "@/pages/ChangePasswordPage";
import ProfilePage from "@/pages/ProfilePage";
import ManualExportPage from "@/pages/ManualExportPage";
import FlushUsersPage from "@/pages/FlushUsersPage";
import UOINotesPage from "@/pages/UOINotesPage";
import UOINotesReport from "@/pages/UOINotesReport";
import MastersPage from "@/pages/MastersPage";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppStateProvider } from "@/context/AppStateContext";
import { ConfirmDialogProvider, useConfirmDialog } from "@/components/ConfirmDialog";
import { NavHistoryProvider } from "@/context/NavHistory";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#1a3a5c', fontSize: 28, fontWeight: 600 }}>
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}

function ProtectedRoute({ component: Component, permission, role }: { component: React.ComponentType; permission?: string; role?: string }) {
  const { isAuthenticated, can, user } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" replace />;
  if (role && user?.role !== role) return <Redirect to={user?.role === 'admin' ? '/users' : '/'} replace />;
  if (permission && !can(permission)) {
    return <Redirect to={user?.role === 'admin' ? '/users' : '/'} replace />;
  }
  return <Component />;
}

function RootRoute() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" replace />;
  if (user?.role === 'admin') return <Redirect to="/users" replace />;
  return <Dashboard />;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Redirect to="/" replace />;
  return <Component />;
}

function ChangePasswordRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" replace />;
  return <ChangePasswordPage />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login"><PublicRoute component={LoginPage} /></Route>
      <Route path="/" component={RootRoute} />
      <Route path="/announcements"><ProtectedRoute component={AnnouncementsPage} permission="view_announcements_menu" /></Route>
      <Route path="/announcements/add"><ProtectedRoute component={AddAnnouncementPage} permission="create_announcement" /></Route>
      <Route path="/announcements/:id/edit"><ProtectedRoute component={AddAnnouncementPage} /></Route>
      <Route path="/announcements/:id"><ProtectedRoute component={AnnouncementDetailPage} permission="view_announcements_menu" /></Route>
      <Route path="/users"><ProtectedRoute component={UsersPage} permission="view_users_menu" /></Route>
      <Route path="/user-tagging"><ProtectedRoute component={UserTaggingPage} permission="manage_all_users" /></Route>
      <Route path="/reports/location-wise"><ProtectedRoute component={LocationWiseReport} permission="view_reports" /></Route>
      <Route path="/reports/location-wise/:district/:block"><ProtectedRoute component={LocationDetailReport} permission="view_reports" /></Route>
      <Route path="/reports/location-wise/:district"><ProtectedRoute component={LocationDetailReport} permission="view_reports" /></Route>
      <Route path="/reports/department-wise"><ProtectedRoute component={DepartmentWiseReport} permission="view_reports" /></Route>
      <Route path="/reports/department-wise/:dept"><ProtectedRoute component={DepartmentDetailReport} permission="view_reports" /></Route>
      <Route path="/reports/announcement-progress"><ProtectedRoute component={AnnouncementProgressReport} permission="view_reports" /></Route>
      <Route path="/reports/occasion-wise"><ProtectedRoute component={OccasionWiseReport} permission="view_reports" /></Route>
      <Route path="/reports/aging-analysis"><ProtectedRoute component={AgingAnalysisReport} permission="view_reports" /></Route>
      <Route path="/reports/uoi-notes"><ProtectedRoute component={UOINotesReport} permission="view_uoi_reports" /></Route>
      <Route path="/flushusers"><ProtectedRoute component={FlushUsersPage} role="admin" /></Route>
      <Route path="/my-actions"><ProtectedRoute component={MyActionsPage} /></Route>
      <Route path="/activity-log"><ProtectedRoute component={ActivityLogPage} permission="view_audit_log" /></Route>
      <Route path="/uoi-notes"><ProtectedRoute component={UOINotesPage} permission="view_uoi_notes" /></Route>
      <Route path="/masters"><Redirect to="/masters/districts" replace /></Route>
      <Route path="/masters/:entity"><ProtectedRoute component={MastersPage} permission="manage_master_data" /></Route>
      <Route path="/change-password" component={ChangePasswordRoute} />
      <Route path="/profile"><ProtectedRoute component={ProfilePage} /></Route>
      <Route path="/manual/export"><ProtectedRoute component={ManualExportPage} /></Route>
      <Route><Redirect to="/" replace /></Route>
    </Switch>
  );
}

/**
 * Intercepts the browser's native Back/Forward navigation while signed in and
 * turns it into an explicit "log out?" prompt.
 *
 * A same-URL "sentinel" history entry is kept on top of the current page so a
 * Back press lands on an identical URL (no visual change), fires `popstate`, and
 * lets us re-arm and prompt. Confirming logs out; cancelling leaves the user
 * exactly where they were. In-app navigation uses wouter's pushState and never
 * fires popstate, so menu links, breadcrumbs, and on-page Back never prompt.
 *
 * IMPORTANT: browsers (Chrome/Edge/Firefox) implement a "history manipulation
 * intervention" that SKIPS history entries created without a user gesture when
 * the user presses Back. So the sentinel MUST be (re)created from a real
 * user-activation context, otherwise Back jumps straight past it and exits the
 * app without ever firing popstate. We therefore arm the sentinel on the first
 * user interaction after each page load (pointerdown/keydown) and re-arm it
 * inside the popstate handler (which itself runs under user activation).
 *
 * Defense in depth: if the document is ever unloaded into the back/forward cache
 * (a Back/Forward that bypassed the trap), we fire a best-effort logout beacon
 * so the server session is killed, and on bfcache restore (Forward) we
 * re-validate the session so a dead session bounces the user to login.
 */
function BackGuard() {
  const { isAuthenticated, logout, refreshSession } = useAuth();
  const confirm = useConfirmDialog();
  const [location] = useLocation();
  const openRef = useRef(false);
  const armedRef = useRef(false);

  const pushSentinel = () => {
    window.history.pushState(null, "", window.location.href);
  };

  // Best-effort immediate sentinel + reset the gesture-armed flag whenever the
  // page changes. The reliable, non-skippable sentinel is pushed on the next
  // user gesture (see the listener effect below).
  useEffect(() => {
    if (!isAuthenticated) {
      armedRef.current = false;
      return;
    }
    pushSentinel();
    armedRef.current = false;
  }, [location, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Arm a non-skippable sentinel on the first real user interaction after each
    // navigation. Created under user activation so the browser won't skip it.
    const onUserGesture = () => {
      if (armedRef.current) return;
      pushSentinel();
      armedRef.current = true;
    };

    const onPopState = () => {
      // Runs under user activation (the Back press), so this sentinel sticks.
      pushSentinel();
      armedRef.current = true;
      if (openRef.current) return;
      openRef.current = true;
      void confirm({
        title: "Log out of Sankalpa Odisha?",
        message:
          "The browser Back button logs you out for security. Continue to the login screen, or stay and use the on-page navigation buttons instead.",
        confirmLabel: "Log out",
        cancelLabel: "Stay logged in",
        variant: "danger",
      }).then((ok) => {
        openRef.current = false;
        if (ok) void logout();
      });
    };

    // If a Back/Forward bypassed the trap and the page is being frozen into the
    // bfcache, kill the server session. `persisted` is true only for cacheable
    // navigations (Back/Forward) — NOT for reloads — so refresh stays logged in.
    const onPageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      try {
        navigator.sendBeacon?.("/api/auth/logout");
      } catch {
        /* best effort */
      }
    };

    // Returning via Forward from the bfcache restores a possibly-stale page;
    // re-validate so a dead session redirects to login.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void refreshSession();
    };

    window.addEventListener("pointerdown", onUserGesture, true);
    window.addEventListener("keydown", onUserGesture, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pointerdown", onUserGesture, true);
      window.removeEventListener("keydown", onUserGesture, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [isAuthenticated, confirm, logout, refreshSession]);

  return null;
}

function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppStateProvider>
          <ConfirmDialogProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <NavHistoryProvider>
                <BackGuard />
                <Router />
              </NavHistoryProvider>
            </WouterRouter>
          </ConfirmDialogProvider>
        </AppStateProvider>
      </AuthGate>
    </AuthProvider>
  );
}

export default App;
