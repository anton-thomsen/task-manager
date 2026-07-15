import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "@playwright/test";

const EVIDENCE = process.env.EVIDENCE_DIR;

test("offers a pre-filled work log on completion and reports estimate-vs-actual", async ({
	page,
	baseURL,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	// A fresh account keeps this scenario isolated from the other spec's org.
	await page.goto("/signup");
	await page.getByLabel("Name").fill("Estimator");
	await page.getByLabel("Email").fill("estimator@task-manager.local");
	await page.getByLabel("Password").fill("estimator-local-password");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page).toHaveURL((url) => url.pathname === "/");

	const title = "Estimate insights build";
	await page.getByRole("button", { name: "Create task" }).click();
	const taskDialog = page.getByRole("dialog", { name: "Create a task" });
	await taskDialog.getByLabel("Title").fill(title);
	await taskDialog.getByLabel("Minimum estimate in hours").fill("2");
	await taskDialog.getByLabel("Maximum estimate in hours").fill("3");
	await taskDialog.getByRole("button", { name: "Add task" }).click();

	const taskLink = page.getByRole("link", { name: title, exact: true });
	await expect(taskLink).toBeVisible();
	const taskHref = await taskLink.getAttribute("href");
	if (!taskHref) throw new Error("The created task is missing its detail link.");
	const taskId = Number(taskHref.slice(taskHref.lastIndexOf("/") + 1));
	await page.goto(taskHref);

	// Two subtasks with estimates: one to skip the offer, one to log against.
	const skipSubtask = "Ship the API";
	const logSubtask = "Write the docs";
	await page.getByLabel("Subtask title").fill(skipSubtask);
	await page.getByLabel("Estimated hours").fill("0.5");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await expect(page.getByText(skipSubtask, { exact: true })).toBeVisible();
	await page.getByLabel("Subtask title").fill(logSubtask);
	await page.getByLabel("Estimated hours").fill("0.25");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await expect(page.getByText(logSubtask, { exact: true })).toBeVisible();

	// Completing a subtask OFFERS a pre-filled work log (locked decision D3).
	await page.getByLabel(`Status for ${skipSubtask}`).selectOption("Finished");
	const offer = page.getByRole("dialog");
	await expect(offer.getByRole("heading", { name: /is done/ })).toBeVisible();
	// The note defaults to the subtask title and the estimate is inherited.
	await expect(offer.getByLabel("What did you do?")).toHaveValue(skipSubtask);
	await expect(offer.getByLabel("Estimated (hours)")).toHaveValue("0.5");
	// Actual hours are left for the human - never pre-filled.
	await expect(offer.getByLabel("Time spent (hours)")).toHaveValue("");
	if (EVIDENCE) {
		await page.screenshot({ path: join(EVIDENCE, "completion-offer.png") });
	}

	// Skip path: dismissing leaves the subtask completed and logs nothing.
	await offer.getByRole("button", { name: "Skip" }).click();
	await expect(offer).toBeHidden();
	const completed = page.getByRole("region", { name: "Completed subtasks" });
	await expect(completed.getByText(skipSubtask, { exact: true })).toBeVisible();

	// Submit path: complete the second subtask and log the real hours.
	await page.getByLabel(`Status for ${logSubtask}`).selectOption("Finished");
	await expect(offer.getByRole("heading", { name: /is done/ })).toBeVisible();
	await expect(offer.getByLabel("Estimated (hours)")).toHaveValue("0.25");
	await offer.getByLabel("Time spent (hours)").fill("0.75");
	await offer
		.getByLabel("Detailed notes")
		.fill("Took longer than the estimate - auth edge cases needed docs too.");
	await offer.getByRole("button", { name: "Add work log" }).click();
	await expect(offer).toBeHidden();

	// The logged entry is linked to the subtask, keeps its estimate, and shows
	// an over/under variance badge (0.75 actual vs 0.25 estimate = 0.5h over).
	await page.getByRole("link", { name: /Work log/ }).click();
	const entries = page.getByRole("article");
	await expect(entries).toHaveCount(1);
	const entry = entries.first();
	await expect(
		entry.getByRole("heading", { name: logSubtask, exact: true }),
	).toBeVisible();
	await expect(entry.getByText("est. 0.25h")).toBeVisible();
	await expect(entry.getByText("0.5h over", { exact: true })).toBeVisible();
	await expect(entry.getByText(`From subtask: ${logSubtask}`)).toBeVisible();
	if (EVIDENCE) {
		await page.screenshot({
			fullPage: true,
			path: join(EVIDENCE, "work-log-variance.png"),
		});
	}

	// The task header exposes a server-computed per-worklog breakdown.
	await page.goto(taskHref);
	await page.getByText("Per-worklog breakdown").click();
	await expect(
		page.getByText(/est\. 0\.25h · actual 0\.75h · 0\.5h over/),
	).toBeVisible();
	await expect(
		page.getByText(/Totals: est\. 0\.25h · actual 0\.75h/),
	).toBeVisible();
	if (EVIDENCE) {
		await page.screenshot({
			path: join(EVIDENCE, "header-breakdown.png"),
		});
	}

	// Mint an API token so an AI caller can pull the report over MCP.
	await page.goto("/settings/tokens");
	const apiSection = page
		.locator("section")
		.filter({ hasText: "Quick-add API token" });
	await apiSection.getByRole("button", { name: "Generate token" }).click();
	await expect(
		apiSection.getByRole("button", { name: "Regenerate token" }),
	).toBeVisible();
	const apiToken = (
		await apiSection
			.locator("code")
			.filter({ hasText: /^[\w-]{40,}$/ })
			.innerText()
	).trim();
	expect(apiToken.length).toBeGreaterThanOrEqual(40);

	// get_task_report round-trip through the real MCP endpoint.
	const transport = new StreamableHTTPClientTransport(
		new URL("/api/mcp", baseURL),
		{ requestInit: { headers: { Authorization: `Bearer ${apiToken}` } } },
	);
	const client = new Client({ name: "e2e-report", version: "1.0.0" });
	await client.connect(transport);
	try {
		const tools = await client.listTools();
		expect(tools.tools.map((tool) => tool.name)).toContain("get_task_report");

		const response = await client.callTool({
			name: "get_task_report",
			arguments: { task_id: taskId },
		});
		const content = response.content as Array<{ type: string; text: string }>;
		const report = JSON.parse(content[0]?.text ?? "{}");

		expect(report.title).toBe(title);
		expect(report.task_estimate).toEqual({ min_hours: 2, max_hours: 3 });
		expect(report.totals.total_hours_logged).toBe(0.75);
		expect(report.totals.total_worklog_estimates).toBe(0.25);
		expect(report.totals.variance_vs_max_estimate).toBe(-2.25);

		expect(report.work_logs).toHaveLength(1);
		const [log] = report.work_logs;
		expect(log.note).toBe(logSubtask);
		expect(log.estimated_hours).toBe(0.25);
		expect(log.hours_spent).toBe(0.75);
		expect(log.variance_hours).toBe(0.5);
		expect(log.from_subtask).toBe(logSubtask);
		expect(log.author).toBe("Estimator");
		expect(log.details).toContain("auth edge cases");

		const completers = report.subtasks
			.filter((subtask: { status: string }) => subtask.status === "Finished")
			.map((subtask: { completed_by: string | null }) => subtask.completed_by);
		expect(completers).toEqual(["Estimator", "Estimator"]);

		if (EVIDENCE) {
			const { writeFileSync } = await import("node:fs");
			writeFileSync(
				join(EVIDENCE, "get_task_report.json"),
				JSON.stringify(report, null, 2),
			);
		}
	} finally {
		await transport.close();
	}
});
