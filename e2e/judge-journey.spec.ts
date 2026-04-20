import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const BACKEND_URL_PATTERN = /http:\/\/(localhost|127\.0\.0\.1):8080\/.*/;

const pipelinePayload = {
  run_id: "run-e2e-001",
  run_at: "2026-04-20T10:00:00Z",
  source: "live",
  hotspots: ["gate-a"],
  cascade_zones: ["north-concourse"],
  predictions: [
    {
      zone_id: "gate-a",
      zone_name: "Gate A",
      current_pct: 76,
      predicted_pct: 84,
      confidence: 0.91,
      uncertainty_reason: "stable ingress trend",
      risk_trajectory: "worsening",
      minutes_to_critical: 8,
    },
  ],
  decisions: [
    {
      action_type: "routing",
      target_zone: "gate-a",
      instruction: "Open secondary queue line",
      priority: "high",
      expected_impact: "Reduce queue depth",
    },
  ],
  impacts: [
    {
      action_instruction: "Open secondary queue line",
      target_zone: "gate-a",
      before_pct: 84,
      after_pct: 74,
      change_pct: 10,
      resolved: true,
      resolved_at: "2026-04-20T10:00:30Z",
    },
  ],
  communication: {
    attendee_notification: "Gate A is busy. Follow signage for faster entry.",
    staff_alert: "Deploy 2 stewards to Gate A for queue balancing.",
    signage_message: "Gate B OPEN",
    narration: "Queue-balancing intervention active.",
    reasoning_chain: {
      cause: "Ingress surge",
      trend: "rising",
      prediction: "Gate A will exceed 80%",
      reasoning: "Historical ramp pattern with current trend",
      action: "Open secondary queue line",
      status: "Applied",
    },
  },
  confidence_overall: 0.91,
  pipeline_duration_ms: 1420,
};

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function registerBackendMocks(page: Page): Promise<void> {
  await page.route(BACKEND_URL_PATTERN, async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;

    if (pathname === "/zones") {
      await fulfillJson(route, {
        zones: [
          {
            zone_id: "gate-a",
            name: "Gate A",
            occupancy_pct: 74,
            flow_rate: 320,
            queue_depth: 12,
            risk_level: "high",
            trend: "rising",
            capacity: 1000,
            current_count: 740,
          },
        ],
      });
      return;
    }

    if (pathname === "/pipeline/latest") {
      await fulfillJson(route, pipelinePayload);
      return;
    }

    if (pathname === "/activity-feed") {
      await fulfillJson(route, { events: [] });
      return;
    }

    if (pathname === "/simulation/heartbeat") {
      await fulfillJson(route, {
        is_paused: true,
        simulated_minutes: 0,
        simulation_speed: 90,
      });
      return;
    }

    if (
      pathname === "/simulation/reset" ||
      pathname === "/simulation/play" ||
      pathname === "/simulation/pause" ||
      pathname === "/simulation/phase"
    ) {
      await fulfillJson(route, { message: "ok" });
      return;
    }

    await fulfillJson(route, {});
  });
}

async function waitForDashboardReady(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /operations dashboard/i }),
  ).toBeVisible();
  await expect(page.getByText("Dashboard loading • Please wait")).toBeHidden({
    timeout: 7000,
  });
}

test.describe("Judge journey smoke", () => {
  test.beforeEach(async ({ page }) => {
    await registerBackendMocks(page);
  });

  test("supports scenario trigger and impact visibility", async ({ page }) => {
    await waitForDashboardReady(page);

    await expect(
      page.getByRole("link", { name: /skip to main content/i }),
    ).toBeAttached();

    const scenarioButton = page.getByRole("button", {
      name: /open simulation scenario menu/i,
    });
    await expect(scenarioButton).toBeVisible();
    await scenarioButton.click();

    await expect(
      page.getByRole("menu", { name: /simulation scenarios/i }),
    ).toBeVisible();

    await page
      .getByRole("menuitem", { name: /run scenario: normal flow/i })
      .click();

    await expect(
      page.getByRole("button", {
        name: /scenario running, \d+ seconds remaining/i,
      }),
    ).toBeVisible();

    await expect(
      page.getByText(/system:\s+(healthy|degraded|offline)/i),
    ).toBeVisible();
    await expect(page.getByText(/last run/i)).toBeVisible();
    await expect(page.getByText(/actions/i)).toBeVisible();
  });

  test("has zero browser axe violations in main dashboard region", async ({
    page,
  }) => {
    await waitForDashboardReady(page);

    const results = await new AxeBuilder({ page })
      .include("#main-content")
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
