import { RouteObject, redirect } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ProtectedRoute } from '@/lib/auth/auth-client';
import RouteErrorFallback from '@/components/RouteErrorFallback';
import { usePermissions } from '@/lib/usePermissions';
import DesktopOnly from '@/components/DesktopOnly';

// ── Eagerly loaded: public pages (tiny, needed immediately) ──────────────────
import NativeStartupGate from '@/components/NativeStartupGate';
import ShellRouter from '@/components/ShellRouter';
import HomePage from './pages/index';
import LoginPage from './pages/login';
import SignupPage from './pages/signup';
import CheckEmailPage from './pages/check-email';
import VerifyEmailPage from './pages/verify-email';
import VerifyRequiredPage from './pages/verify-required';
import ForgotPasswordPage from './pages/forgot-password';
import ResetPasswordPage from './pages/reset-password';
import PrivacyPage from './pages/privacy';
import TermsPage from './pages/terms';
import ProdNotFoundPage from './pages/_404';
import SharePage from './pages/share';
import ExternalFormPage from './pages/external-form';
import LoginHelpPage from './pages/login-help';
const DownloadAppPage = lazy(() => import('./pages/download-app'));
const SubscribePage   = lazy(() => import('./pages/subscribe'));

import { Navigate } from 'react-router-dom';

// ── Lazily loaded: all portal pages (split into separate chunks) ──────────────
const DashboardPage      = lazy(() => import('./pages/dashboard'));
const JobsPage           = lazy(() => import('./pages/jobs'));
const SchedulerPage      = lazy(() => import('./pages/scheduler'));
const JobDetailPage      = lazy(() => import('./pages/job-detail'));
const JobPhotosPage      = lazy(() => import('./pages/job-photos-page'));
const JobPhotosCameraPage = lazy(() => import('./pages/job-photos-camera'));
const JobFormRunnerPage  = lazy(() => import('./pages/job-form-runner'));
const JobSignInPage      = lazy(() => import('./pages/job-signin'));
const FleetPage          = lazy(() => import('./pages/fleet'));
const FleetDetailPage    = lazy(() => import('./pages/fleet-detail'));
const DazzaAIPage        = lazy(() => import('./pages/dazza-ai'));
const StudioPage         = lazy(() => import('./pages/studio'));
const StudioBuilderPage  = lazy(() => import('./pages/studio-builder'));
const StudioDocumentsPage = lazy(() => import('./pages/studio-documents'));
const StudioFormsPage    = lazy(() => import('./pages/studio-forms'));
const StudioGlobalListsPage = lazy(() => import('./pages/studio-global-lists'));
const StudioLibraryPage  = lazy(() => import('./pages/studio-library'));
const SafetyPostersPage  = lazy(() => import('./pages/safety-posters'));
const JobFieldDocsPage   = lazy(() => import('./pages/job-field-docs'));
const JobSitePrestartPage = lazy(() => import('./pages/job-site-prestart'));
const JobRiskyPage        = lazy(() => import('./pages/job-risky'));
const IncidentsPage       = lazy(() => import('./pages/incidents'));
const IncidentDetailPage  = lazy(() => import('./pages/incident-detail'));
const RiskRegisterPage    = lazy(() => import('./pages/risk-register'));

const TeamPage           = lazy(() => import('./pages/team'));

const SettingsPage       = lazy(() => import('./pages/settings'));
const ProfilePage        = lazy(() => import('./pages/profile'));
// FormsPage, LibraryPage removed — now served as Studio tabs (/studio?tab=*)
const SafetyPage         = lazy(() => import('./pages/safety'));
const FilesPage          = lazy(() => import('./pages/files'));
const EstimatingPage     = lazy(() => import('./pages/estimating'));
const BuildersCalcPage   = lazy(() => import('./pages/builders-calc-page'));
const TakeoffPadPage     = lazy(() => import('./pages/takeoff-pad-page'));
const EstimateEditorPage = lazy(() => import('./pages/estimate-editor'));

const CustomersPage      = lazy(() => import('./pages/customers'));
const CustomerDetailPage = lazy(() => import('./pages/customer-detail'));
const InvoicesPage       = lazy(() => import('./pages/invoices'));
const InvoiceBuilderPage = lazy(() => import('./pages/invoice-builder'));
const OwnerConsolePage   = lazy(() => import('./pages/owner-console'));
const BillingPage        = lazy(() => import('./pages/billing'));
const ListsPage          = lazy(() => import('./pages/lists'));
const UserLogsPage       = lazy(() => import('./pages/user-logs'));
const QuickLinksPage     = lazy(() => import('./pages/quick-links'));
const JobCardsPage       = lazy(() => import('./pages/job-cards'));
const JobCardNewPage     = lazy(() => import('./pages/job-card-new'));
const JobCardDetailPage  = lazy(() => import('./pages/job-card-detail'));

const DocumentViewerPage = lazy(() => import('./pages/document-viewer'));
const SwmsSignoffPage    = lazy(() => import('./pages/swms-signoff'));
const FormFillPage       = lazy(() => import('./pages/form-fill'));
const PlanManagerPage        = lazy(() => import('./pages/plan-manager'));
const PlanManagerSharePage   = lazy(() => import('./pages/plan-manager-share'));
const PlanManagerDrawingPage = lazy(() => import('./pages/plan-manager-drawing'));
const AssetManagerPage       = lazy(() => import('./pages/asset-manager'));
const AssetManagerDetailPage = lazy(() => import('./pages/asset-manager-detail'));
const AssetReportSharePage   = lazy(() => import('./pages/asset-report-share'));
const PhotoSharePage         = lazy(() => import('./pages/photo-share'));
const LensPage               = lazy(() => import('./pages/lens'));
const JobNotesPage           = lazy(() => import('./pages/job-notes-page'));
const JobDelaysPage          = lazy(() => import('./pages/job-delays-page'));
const JobFormsPage           = lazy(() => import('./pages/job-forms-page'));
const JobQuotesPage          = lazy(() => import('./pages/job-quotes-page'));
const JobProgressPage        = lazy(() => import('./pages/job-progress-page'));
const JobSchedulePage        = lazy(() => import('./pages/job-schedule-page'));
const JobDrawingsPage        = lazy(() => import('./pages/job-drawings-page'));
const FleetDrivePage         = lazy(() => import('./pages/fleet-drive-page'));
const JobCostsPage           = lazy(() => import('./pages/job-costs-page'));
const SignInHistoryPage       = lazy(() => import('./pages/signin-history'));
const FormDetailPage          = lazy(() => import('./pages/form-detail'));
const DriverPage              = lazy(() => import('./pages/driver'));
const PrestartPage            = lazy(() => import('./pages/prestart'));
const HelpPage                = lazy(() => import('./pages/help'));
// HomeScreenPage is loaded inside ShellRouter (lazy, only when app shell is active)
// ── Customer portal (public, token-based) ────────────────────────────────────
const PortalLoginPage          = lazy(() => import('./pages/portal/login'));
const PortalDashboardPage      = lazy(() => import('./pages/portal/dashboard'));
const PortalJobDetailPage      = lazy(() => import('./pages/portal/job-detail'));
const PortalPaymentSuccessPage = lazy(() => import('./pages/portal/payment-success'));
// ── New-tab viewer pages ──────────────────────────────────────────────────────
const ViewFilePage       = lazy(() => import('./pages/view-file'));
const ViewEstimatePage   = lazy(() => import('./pages/view-estimate'));
const ViewInvoicePage    = lazy(() => import('./pages/view-invoice'));

const NotFoundPage = import.meta.env.DEV ? ProdNotFoundPage : ProdNotFoundPage;

// ── Helpers ───────────────────────────────────────────────────────────────────
// Inline error element — renders inside the layout so header/sidebar stay mounted
const routeError = <RouteErrorFallback />;

/** Minimal loading shell shown while a lazy portal page loads */
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function protect(element: React.ReactElement) {
  return <ProtectedRoute><Suspense fallback={<PageLoader />}>{element}</Suspense></ProtectedRoute>;
}

/** Platform developer route — redirects non-developers to /home */
function PlatformDevRoute({ children }: { children: React.ReactElement }) {
  const { isPlatformOwner, loading } = usePermissions();
  if (loading) return <PageLoader />;
  if (!isPlatformOwner) return <Navigate to="/home" replace />;
  return children;
}

function protectDev(element: React.ReactElement) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>
        <PlatformDevRoute>{element}</PlatformDevRoute>
      </Suspense>
    </ProtectedRoute>
  );
}

/**
 * protectDesktop — auth + desktop-only guard.
 *
 * Wraps a page in ProtectedRoute (auth) + DesktopOnly (blocks mobile/native).
 * Use for studio builder, admin console, and any other page that requires a
 * wide viewport and is not touch-optimised.
 *
 * @param element  The page element to guard.
 * @param pageName Human-readable page name shown in the "desktop only" message.
 */
function protectDesktop(element: React.ReactElement, pageName?: string) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>
        <DesktopOnly pageName={pageName}>{element}</DesktopOnly>
      </Suspense>
    </ProtectedRoute>
  );
}

/**
 * protectDevDesktop — auth + platform-owner + desktop-only guard.
 * Use for owner-console and other platform-developer pages.
 */
function protectDevDesktop(element: React.ReactElement, pageName?: string) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>
        <PlatformDevRoute>
          <DesktopOnly pageName={pageName}>{element}</DesktopOnly>
        </PlatformDevRoute>
      </Suspense>
    </ProtectedRoute>
  );
}

export const routes: RouteObject[] = [
  { path: '/',              element: <NativeStartupGate><HomePage /></NativeStartupGate> },
  { path: '/home',          element: protect(<ShellRouter />), errorElement: routeError },
  { path: '/login',         element: <LoginPage /> },
  { path: '/signup',        element: <SignupPage /> },
  { path: '/privacy',       element: <PrivacyPage /> },
  { path: '/terms',         element: <TermsPage /> },
  { path: '/check-email',   element: <CheckEmailPage /> },
  { path: '/verify-email',  element: <VerifyEmailPage /> },
  { path: '/verify-required', element: <VerifyRequiredPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password',  element: <ResetPasswordPage /> },
  { path: '/login-help',      element: <LoginHelpPage /> },
  { path: '/download-app',   element: <Suspense fallback={<PageLoader />}><DownloadAppPage /></Suspense> },
  { path: '/subscribe',      element: <Suspense fallback={<PageLoader />}><SubscribePage /></Suspense> },
  { path: '/driver',       element: <ProtectedRoute><Suspense fallback={<PageLoader />}><DriverPage /></Suspense></ProtectedRoute>,      errorElement: routeError },
  { path: '/prestart',     element: <ProtectedRoute><Suspense fallback={<PageLoader />}><PrestartPage /></Suspense></ProtectedRoute>,    errorElement: routeError },
  { path: '/site-escape', element: <Navigate to="/home" replace />, errorElement: routeError },
  // Public share pages — no login required
  { path: '/share/:token',          element: <SharePage /> },
  { path: '/external/form/:token',  element: <ExternalFormPage /> },
  { path: '/safety/sign/:token',    element: <Suspense fallback={<PageLoader />}><SwmsSignoffPage /></Suspense> },
  { path: '/forms/fill/:token',     element: <Suspense fallback={<PageLoader />}><FormFillPage /></Suspense> },
  // Customer portal — token-based, no staff login required
  { path: '/portal/login',           element: <Suspense fallback={<PageLoader />}><PortalLoginPage /></Suspense> },
  { path: '/portal/dashboard',       element: <Suspense fallback={<PageLoader />}><PortalDashboardPage /></Suspense> },
  { path: '/portal/jobs/:id',        element: <Suspense fallback={<PageLoader />}><PortalJobDetailPage /></Suspense> },
  { path: '/portal/payment-success', element: <Suspense fallback={<PageLoader />}><PortalPaymentSuccessPage /></Suspense> },
  { path: '/dashboard',     loader: () => redirect('/home') },
  // Alias routes — redirect to canonical paths via loader (SSR-safe, no <Navigate> on initial render)
  { path: '/projects',      loader: () => redirect('/jobs') },
  { path: '/stakeholders',  loader: () => redirect('/customers') },
  { path: '/subscription',  loader: () => redirect('/billing') },
  { path: '/tools',         loader: () => redirect('/estimating') },
  { path: '/jobs',          element: protect(<JobsPage />),            errorElement: routeError },
  { path: '/jobs/:id',      element: protect(<JobDetailPage />),       errorElement: routeError },
  { path: '/jobs/:id/photos', element: protect(<Suspense fallback={<PageLoader />}><JobPhotosPage /></Suspense>), errorElement: routeError },
  { path: '/jobs/:id/camera', element: protect(<Suspense fallback={<PageLoader />}><JobPhotosCameraPage /></Suspense>), errorElement: routeError },
  { path: '/job-cards/:id/camera', element: protect(<Suspense fallback={<PageLoader />}><JobPhotosCameraPage /></Suspense>), errorElement: routeError },
  { path: '/jobs/:id/notes',    element: protect(<Suspense fallback={<PageLoader />}><JobNotesPage /></Suspense>),     errorElement: routeError },
  { path: '/jobs/:id/delays',   element: protect(<Suspense fallback={<PageLoader />}><JobDelaysPage /></Suspense>),    errorElement: routeError },
  { path: '/jobs/:id/forms',    element: protect(<Suspense fallback={<PageLoader />}><JobFormsPage /></Suspense>),     errorElement: routeError },
  { path: '/jobs/:id/quotes',   element: protect(<Suspense fallback={<PageLoader />}><JobQuotesPage /></Suspense>),    errorElement: routeError },
  { path: '/jobs/:id/progress', element: protect(<Suspense fallback={<PageLoader />}><JobProgressPage /></Suspense>),  errorElement: routeError },
  { path: '/jobs/:id/schedule', element: protect(<Suspense fallback={<PageLoader />}><JobSchedulePage /></Suspense>),  errorElement: routeError },
  { path: '/jobs/:id/drawings', element: protect(<Suspense fallback={<PageLoader />}><JobDrawingsPage /></Suspense>),  errorElement: routeError },
  { path: '/jobs/:id/site-prestart', element: protect(<Suspense fallback={<PageLoader />}><JobSitePrestartPage /></Suspense>), errorElement: routeError },
  { path: '/jobs/:id/risky',         element: protect(<Suspense fallback={<PageLoader />}><JobRiskyPage /></Suspense>),        errorElement: routeError },
  { path: '/incidents',              element: protect(<Suspense fallback={<PageLoader />}><IncidentsPage /></Suspense>),        errorElement: routeError },
  { path: '/incidents/:id',          element: protect(<Suspense fallback={<PageLoader />}><IncidentDetailPage /></Suspense>),   errorElement: routeError },
  { path: '/risk-register',          element: protect(<Suspense fallback={<PageLoader />}><RiskRegisterPage /></Suspense>),     errorElement: routeError },
  { path: '/fleet/:id/drive',   element: protect(<Suspense fallback={<PageLoader />}><FleetDrivePage /></Suspense>),   errorElement: routeError },
  { path: '/jobs/:id/costs',   element: protect(<Suspense fallback={<PageLoader />}><JobCostsPage /></Suspense>),   errorElement: routeError },
  // QR scan landing — unauthenticated allowed (guest check-in form)
  { path: '/jobs/:id/signin', element: <Suspense fallback={<PageLoader />}><JobSignInPage /></Suspense>, errorElement: routeError },
  // Deep-link: open a specific form instance directly — full-page runner in new tab
  { path: '/jobs/:id/forms/:formInstanceId', element: protect(<JobFormRunnerPage />), errorElement: routeError },
  { path: '/scheduler',     element: protect(<SchedulerPage />),       errorElement: routeError },
  { path: '/fleet',         element: protect(<FleetPage />),           errorElement: routeError },
  { path: '/fleet/:id',     element: protect(<FleetDetailPage />),     errorElement: routeError },
  { path: '/forms',         loader: () => redirect('/studio/forms') },
  { path: '/files',         element: protect(<FilesPage />),           errorElement: routeError },
  { path: '/estimating',    element: protect(<EstimatingPage />),      errorElement: routeError },
  { path: '/builders-calc', element: protect(<BuildersCalcPage />),    errorElement: routeError },
  { path: '/takeoff-pad',   element: protect(<TakeoffPadPage />),      errorElement: routeError },
  { path: '/estimates/:id', element: protect(<EstimateEditorPage />),  errorElement: routeError },
  { path: '/safety',        element: protect(<SafetyPage />),            errorElement: routeError },
  { path: '/library',       loader: () => redirect('/studio/library') },
  { path: '/customers',     element: protect(<CustomersPage />),       errorElement: routeError },
  { path: '/customers/:id', element: protect(<CustomerDetailPage />),  errorElement: routeError },
  { path: '/invoices',      element: protect(<InvoicesPage />),        errorElement: routeError },
  { path: '/invoices/:id',  element: protect(<InvoiceBuilderPage />),  errorElement: routeError },
  { path: '/studio',               element: protectDesktop(<StudioPage />, 'Studio'),                                                                                                                    errorElement: routeError },
  { path: '/studio/builder/:id',   element: protectDesktop(<StudioBuilderPage />, 'Studio Builder'),                                                                                                     errorElement: routeError },
  { path: '/studio/documents',     element: protectDesktop(<Suspense fallback={<PageLoader />}><StudioDocumentsPage /></Suspense>, 'Studio Documents'),                                                  errorElement: routeError },
  { path: '/studio/forms',         element: protect(<Suspense fallback={<PageLoader />}><StudioFormsPage /></Suspense>),                                                                                    errorElement: routeError },
  { path: '/studio/global-lists',  element: protectDesktop(<Suspense fallback={<PageLoader />}><StudioGlobalListsPage /></Suspense>, 'Studio Global Lists'),                                             errorElement: routeError },
  { path: '/studio/library',       element: protectDesktop(<Suspense fallback={<PageLoader />}><StudioLibraryPage /></Suspense>, 'Studio Library'),                                                      errorElement: routeError },
  { path: '/safety/posters',       element: protect(<Suspense fallback={<PageLoader />}><SafetyPostersPage /></Suspense>),   errorElement: routeError },
  { path: '/job-docs',             element: protect(<Suspense fallback={<PageLoader />}><JobFieldDocsPage /></Suspense>),    errorElement: routeError },
  // Plan Manager — full module at /plan-manager, public share at /plan-manager/share/:token
  { path: '/plan-manager',                element: protect(<PlanManagerPage />),        errorElement: routeError },
  { path: '/plan-manager/share/:token',   element: <Suspense fallback={<PageLoader />}><PlanManagerSharePage /></Suspense>, errorElement: routeError },
  { path: '/plan-manager/:drawingId',     element: protect(<PlanManagerDrawingPage />), errorElement: routeError },
  // Asset Manager
  { path: '/studio/asset-manager',           element: protectDesktop(<AssetManagerPage />, 'Asset Manager'),       errorElement: routeError },
  { path: '/studio/asset-manager/:assetId',  element: protectDesktop(<AssetManagerDetailPage />, 'Asset Manager'), errorElement: routeError },
  { path: '/share/asset-report/:token',      element: <Suspense fallback={<PageLoader />}><AssetReportSharePage /></Suspense>, errorElement: routeError },
  // Public job photo gallery — token-validated, no login required
  { path: '/photos/share/:token',            element: <Suspense fallback={<PageLoader />}><PhotoSharePage /></Suspense>, errorElement: routeError },
  // Lens — company-wide photo gallery (Phase 1: read-only)
  { path: '/lens', element: protect(<LensPage />), errorElement: routeError },
  // Sign-in history
  { path: '/signin-history',             element: protect(<SignInHistoryPage />),       errorElement: routeError },
  // Standalone form instance
  { path: '/forms/:id',                  element: protect(<FormDetailPage />),          errorElement: routeError },
  // Primary module short-paths — redirect to canonical portal routes (SSR-safe loader redirects)
  { path: '/studio/jobs',      loader: () => redirect('/jobs') },
  { path: '/studio/estimates', loader: () => redirect('/estimating') },
  { path: '/studio/fleet',     loader: () => redirect('/fleet') },
  { path: '/studio/accounts',  loader: () => redirect('/settings') },
  { path: '/dazza-ai',      element: protectDev(<DazzaAIPage />),        errorElement: routeError },
  { path: '/annette',       loader: () => redirect('/owner-console?tab=health-check') },
  { path: '/team',          element: protect(<TeamPage />),            errorElement: routeError },
  { path: '/team/schedule', loader: () => redirect('/scheduler?tab=team-shifts') },
  { path: '/quick-links',   element: protect(<QuickLinksPage />),      errorElement: routeError },
  { path: '/settings',      element: protect(<SettingsPage />),        errorElement: routeError },
  { path: '/profile',       element: protect(<ProfilePage />),         errorElement: routeError },
  { path: '/help',          element: protect(<Suspense fallback={<PageLoader />}><HelpPage /></Suspense>), errorElement: routeError },
  { path: '/owner-console',     element: protectDev(<OwnerConsolePage />),   errorElement: routeError },
  { path: '/developer-console', loader: () => redirect('/owner-console') },
  { path: '/roadmap',           loader: () => redirect('/dashboard') },
  { path: '/billing',       element: protect(<BillingPage />),         errorElement: routeError },
  { path: '/lists',         element: protect(<ListsPage />),           errorElement: routeError },
  { path: '/user-logs',     element: protect(<UserLogsPage />),        errorElement: routeError },
  { path: '/job-cards',      element: protect(<Suspense fallback={<PageLoader />}><JobCardsPage /></Suspense>),     errorElement: routeError },
  { path: '/job-cards/new',  element: protect(<Suspense fallback={<PageLoader />}><JobCardNewPage /></Suspense>),  errorElement: routeError },
  { path: '/job-cards/:id',  element: protect(<Suspense fallback={<PageLoader />}><JobCardDetailPage /></Suspense>), errorElement: routeError },
  { path: '/documents/:id', element: protect(<DocumentViewerPage />),  errorElement: routeError },
  // New-tab viewer routes (authenticated, no sidebar)
  { path: '/view/file/:id',     element: protect(<ViewFilePage />),     errorElement: routeError },
  { path: '/view/estimate/:id', element: protect(<ViewEstimatePage />), errorElement: routeError },
  { path: '/view/invoice/:id',  element: protect(<ViewInvoicePage />),  errorElement: routeError },
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
  | '/dazza-ai'
  | '/team'
  | '/settings';

export type Params = Record<string, string | undefined>;
