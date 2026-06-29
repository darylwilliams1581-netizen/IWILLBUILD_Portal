import { RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ProtectedRoute } from '@/lib/auth/auth-client';
import RouteErrorFallback from '@/components/RouteErrorFallback';

// ── Eagerly loaded: public pages (tiny, needed immediately) ──────────────────
import HomePage from './pages/index';
import LoginPage from './pages/login';
import SignupPage from './pages/signup';
import CheckEmailPage from './pages/check-email';
import VerifyEmailPage from './pages/verify-email';
import VerifyRequiredPage from './pages/verify-required';
import ForgotPasswordPage from './pages/forgot-password';
import ResetPasswordPage from './pages/reset-password';
import ProdNotFoundPage from './pages/_404';

// ── Lazily loaded: all portal pages (split into separate chunks) ──────────────
const DashboardPage      = lazy(() => import('./pages/dashboard'));
const JobsPage           = lazy(() => import('./pages/jobs'));
const SchedulerPage      = lazy(() => import('./pages/scheduler'));
const JobDetailPage      = lazy(() => import('./pages/job-detail'));
const FleetPage          = lazy(() => import('./pages/fleet'));
const FleetDetailPage    = lazy(() => import('./pages/fleet-detail'));
const DazzaAIPage        = lazy(() => import('./pages/dazza-ai'));
const AnnettePage        = lazy(() => import('./pages/annette'));
const DownloadsPage      = lazy(() => import('./pages/downloads'));
const TeamPage           = lazy(() => import('./pages/team'));
const SettingsPage       = lazy(() => import('./pages/settings'));
const FormsPage          = lazy(() => import('./pages/forms'));
const FilesPage          = lazy(() => import('./pages/files'));
const EstimatingPage     = lazy(() => import('./pages/estimating'));
const EstimateEditorPage = lazy(() => import('./pages/estimate-editor'));
const SafetyPage         = lazy(() => import('./pages/safety'));
const OwnerConsolePage   = lazy(() => import('./pages/owner-console'));
const BillingPage        = lazy(() => import('./pages/billing'));

const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : ProdNotFoundPage;

// ── Helpers ───────────────────────────────────────────────────────────────────
// Inline error element — renders inside the layout so header/sidebar stay mounted
const routeError = <RouteErrorFallback />;

/** Minimal loading shell shown while a lazy portal page loads */
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function protect(element: React.ReactElement) {
  return <ProtectedRoute><Suspense fallback={<PageLoader />}>{element}</Suspense></ProtectedRoute>;
}

export const routes: RouteObject[] = [
  { path: '/',              element: <HomePage /> },
  { path: '/login',         element: <LoginPage /> },
  { path: '/signup',        element: <SignupPage /> },
  { path: '/check-email',   element: <CheckEmailPage /> },
  { path: '/verify-email',  element: <VerifyEmailPage /> },
  { path: '/verify-required', element: protect(<VerifyRequiredPage />) },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password',  element: <ResetPasswordPage /> },
  { path: '/dashboard',     element: protect(<DashboardPage />),       errorElement: routeError },
  { path: '/jobs',          element: protect(<JobsPage />),            errorElement: routeError },
  { path: '/jobs/:id',      element: protect(<JobDetailPage />),       errorElement: routeError },
  { path: '/scheduler',     element: protect(<SchedulerPage />),       errorElement: routeError },
  { path: '/fleet',         element: protect(<FleetPage />),           errorElement: routeError },
  { path: '/fleet/:id',     element: protect(<FleetDetailPage />),     errorElement: routeError },
  { path: '/forms',         element: protect(<FormsPage />),           errorElement: routeError },
  { path: '/files',         element: protect(<FilesPage />),           errorElement: routeError },
  { path: '/estimating',    element: protect(<EstimatingPage />),      errorElement: routeError },
  { path: '/estimates/:id', element: protect(<EstimateEditorPage />),  errorElement: routeError },
  { path: '/safety',        element: protect(<SafetyPage />),          errorElement: routeError },
  { path: '/downloads',     element: protect(<DownloadsPage />),       errorElement: routeError },
  { path: '/dazza-ai',      element: protect(<DazzaAIPage />),         errorElement: routeError },
  { path: '/annette',       element: protect(<AnnettePage />),         errorElement: routeError },
  { path: '/team',          element: protect(<TeamPage />),            errorElement: routeError },
  { path: '/settings',      element: protect(<SettingsPage />),        errorElement: routeError },
  { path: '/owner-console', element: protect(<OwnerConsolePage />),    errorElement: routeError },
  { path: '/billing',       element: protect(<BillingPage />),         errorElement: routeError },
  { path: '*',              element: <NotFoundPage /> },
];

export type Path =
  | '/'
  | '/login'
  | '/signup'
  | '/check-email'
  | '/verify-email'
  | '/verify-required'
  | '/forgot-password'
  | '/reset-password'
  | '/dashboard'
  | '/jobs'
  | '/fleet'
  | '/forms'
  | '/files'
  | '/estimating'
  | '/downloads'
  | '/dazza-ai'
  | '/team'
  | '/settings';

export type Params = Record<string, string | undefined>;
