import { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import { ProtectedRoute } from '@/lib/auth/auth-client';
import RouteErrorFallback from '@/components/RouteErrorFallback';
import HomePage from './pages/index';
import LoginPage from './pages/login';
import SignupPage from './pages/signup';
import CheckEmailPage from './pages/check-email';
import VerifyEmailPage from './pages/verify-email';
import VerifyRequiredPage from './pages/verify-required';
import ForgotPasswordPage from './pages/forgot-password';
import ResetPasswordPage from './pages/reset-password';
import DashboardPage from './pages/dashboard';
import JobsPage from './pages/jobs';
import SchedulerPage from './pages/scheduler';
import JobDetailPage from './pages/job-detail';
import FleetPage from './pages/fleet';
import FleetDetailPage from './pages/fleet-detail';
import DazzaAIPage from './pages/dazza-ai';
import AnnettePage from './pages/annette';
import DownloadsPage from './pages/downloads';
import TeamPage from './pages/team';
import SettingsPage from './pages/settings';
import FormsPage from './pages/forms';
import FilesPage from './pages/files';
import EstimatingPage from './pages/estimating';
import EstimateEditorPage from './pages/estimate-editor';
import SafetyPage from './pages/safety';
import OwnerConsolePage from './pages/owner-console';
import BillingPage from './pages/billing';
import ProdNotFoundPage from './pages/_404';

const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : ProdNotFoundPage;

// Inline error element — renders inside the layout so header/sidebar stay mounted
const routeError = <RouteErrorFallback />;

function protect(element: React.ReactElement) {
  return <ProtectedRoute>{element}</ProtectedRoute>;
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
