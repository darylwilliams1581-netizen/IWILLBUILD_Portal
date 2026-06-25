import { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import HomePage from './pages/index';
import LoginPage from './pages/login';
import DashboardPage from './pages/dashboard';
import JobsPage from './pages/jobs';
import FleetPage from './pages/fleet';
import DazzaAIPage from './pages/dazza-ai';
import ProdNotFoundPage from './pages/_404';

const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : ProdNotFoundPage;

export const routes: RouteObject[] = [
  { path: '/',          element: <HomePage /> },
  { path: '/login',     element: <LoginPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/jobs',      element: <JobsPage /> },
  { path: '/fleet',     element: <FleetPage /> },
  { path: '/dazza-ai',  element: <DazzaAIPage /> },
  { path: '*',          element: <NotFoundPage /> },
];

export type Path = '/' | '/login' | '/dashboard' | '/jobs' | '/fleet' | '/dazza-ai';
export type Params = Record<string, string | undefined>;
