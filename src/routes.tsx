import { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import HomePage from './pages/index';
import LoginPage from './pages/login';
import DashboardPage from './pages/dashboard';
import JobsPage from './pages/jobs';
import FleetPage from './pages/fleet';
import DazzaAIPage from './pages/dazza-ai';
import DownloadsPage from './pages/downloads';
import TeamPage from './pages/team';
import SettingsPage from './pages/settings';
import FormsPage from './pages/forms';
import FilesPage from './pages/files';
import EstimatingPage from './pages/estimating';
import ProdNotFoundPage from './pages/_404';

const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : ProdNotFoundPage;

export const routes: RouteObject[] = [
  { path: '/',           element: <HomePage /> },
  { path: '/login',      element: <LoginPage /> },
  { path: '/dashboard',  element: <DashboardPage /> },
  { path: '/jobs',       element: <JobsPage /> },
  { path: '/fleet',      element: <FleetPage /> },
  { path: '/forms',      element: <FormsPage /> },
  { path: '/files',      element: <FilesPage /> },
  { path: '/estimating', element: <EstimatingPage /> },
  { path: '/downloads',  element: <DownloadsPage /> },
  { path: '/downloads',  element: <DownloadsPage /> },
  { path: '/dazza-ai',   element: <DazzaAIPage /> },
  { path: '/team',       element: <TeamPage /> },
  { path: '/settings',   element: <SettingsPage /> },
  { path: '*',           element: <NotFoundPage /> },
];

export type Path =
  | '/'
  | '/login'
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
