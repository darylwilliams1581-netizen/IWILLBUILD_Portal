import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import HomeScreen from "@/pages/home";
const mocks = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock("@/lib/end-drive-logbook", () => ({ stopDrivingWithLogbook: mocks.stop }));

vi.mock("@/lib/usePermissions", () => ({
  usePermissions: () => ({
    role: "worker",
    loading: false,
    me: { user: { id: "driver" } },
  }),
  invalidateMeCache: vi.fn(),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  useSession: () => ({ session: { user: { id: "driver" } } }),
  signOut: vi.fn(),
}));
vi.mock("@/lib/useTerminology", () => ({
  invalidateTerminologyCache: vi.fn(),
}));
vi.mock("@/lib/useSubscriptionGate", () => ({
  invalidateSubscriptionCache: vi.fn(),
}));
vi.mock("@/lib/useSupportMode", () => ({
  invalidateSupportModeCache: vi.fn(),
}));
vi.mock("@/components/JobPickerSheet", () => ({ default: () => null }));
vi.mock("@/components/NotificationList", () => ({ default: () => null }));
vi.mock("@/components/notes/MyTasksPanel", () => ({ default: () => null }));
vi.mock("@/components/home/PagedHomeScreen", () => ({ default: () => null }));
vi.mock("@/components/fleet/StartDrivingModal", () => ({
  default: () => null,
}));
vi.mock("@/components/AppPermissionsOnboarding", () => ({
  default: () => null,
  hasCompletedOnboarding: () => true,
}));
vi.mock("@/lib/capacitor-plugins", () => ({ isNative: () => false, getAppPlugin: () => null }));
vi.mock("@dr.pogodin/react-helmet", () => ({ Helmet: () => null }));
function Location() {
  return (
    <output data-testid="location">
      {useLocation().pathname + useLocation().search}
    </output>
  );
}
beforeEach(() => {
  mocks.stop.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => ({
      ok: true,
      json: async () =>
        String(url) === "/api/me/active-status"
          ? {
              ok: true,
              drivingSessions: [
                {
                  sessionId: 42,
                  assetId: 7,
                  assetName: "Hilux",
                  startAt: "2026-11-14T00:00:00Z",
                },
              ],
            }
          : {},
    })),
  );
  vi.stubGlobal("alert", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([true, false])(
  "Home Stop waits for the stop service; recording enabled=%s",
  async (enabled) => {
    let resolve!: (result: unknown) => void;
    mocks.stop.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(
      <MemoryRouter>
        <HomeScreen />
        <Location />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Hilux/ }));
    expect(mocks.stop).toHaveBeenCalledWith(42);
    expect(screen.getByTestId("location").textContent).toBe("/");
    resolve({ fleetAssetId: 7, logbookRequired: enabled });
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([url]) => url === "/api/me/active-status"),
      ).toHaveLength(2),
    );
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/",
      ),
    );
  },
);
it("Home Stop reports failure without navigating to completion", async () => {
  mocks.stop.mockRejectedValue(Error("Stop needs retry"));
  render(
    <MemoryRouter>
      <HomeScreen />
      <Location />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Hilux/ }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Stop needs retry");
  expect(screen.getByTestId("location").textContent).toBe("/");
});
