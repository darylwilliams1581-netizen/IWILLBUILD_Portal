import { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import { ProtectedRoute } from '@/lib/auth/auth-client';
import HomePage from './pages/index';
import LoginPage from './pages/login';
import SignupPage from './pages/signup';
import DashboardPage from './pages/dashboard';
import JobsPage from './pages/jobs';
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
import OwnerConsolePage from './pages/owner-console';
import BillingPage from './pages/billing';
import ProdNotFoundPage from './pages/_404';

const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : ProdNotFoundPage;

function protect(element: React.ReactElement) {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

export const routes: RouteObject[] = [
  { path: '/',            element: <HomePage /> },
  { path: '/login',       element: <LoginPage /> },
  { path: '/signup',      element: <SignupPage /> },
  { path: '/dashboard',   element: protect(<DashboardPage />) },
  { path: '/jobs',        element: protect(<JobsPage />) },
  { path: '/jobs/:id',    element: protect(<JobDetailPage />) },
  { path: '/fleet',       element: protect(<FleetPage />) },
  { path: '/fleet/:id',   element: protect(<FleetDetailPage />) },
  { path: '/forms',       element: protect(<FormsPage />) },
  { path: '/files',       element: protect(<FilesPage />) },
  { path: '/estimating',  element: protect(<EstimatingPage />) },
  { path: '/estimates/:id', element: protect(<EstimateEditorPage />) },
  { path: '/downloads',   element: protect(<DownloadsPage />) },
  { path: '/dazza-ai',    element: protect(<DazzaAIPage />) },
  { path: '/annette',     element: protect(<AnnettePage />) },
  { path: '/team',        element: protect(<TeamPage />) },
  { path: '/settings',    element: protect(<SettingsPage />) },
  { path: '/owner-console', element: protect(<OwnerConsolePage />) },
  { path: '/billing',       element: protect(<BillingPage />) },
  { path: '*',            element: <NotFoundPage /> },
];

export type Path =
  | '/'
  | '/login'
  | '/signup'
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
