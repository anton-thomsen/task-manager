import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createTask, mintApiToken, runCli, signUp } from "./cli-helpers";

test("the task CLI authenticates, lists, filters, and scopes to the caller's org", async ({
	page,
	baseURL,
	browser,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Terminal Owner", "terminal-owner@task-manager.local");
	const firstTask = "Wire the CLI seam";
	const secondTask = "Polish the board columns";
	await createTask(page, firstTask);
	await createTask(page, secondTask);
	const token = await mintApiToken(page);
	const env = { TASK_URL: baseURL, TASK_TOKEN: token };

	// --json emits machine-readable summaries of every visible task.
	const jsonRun = runCli(["list", "--json"], env);
	expect(jsonRun.status).toBe(0);
	const tasks = JSON.parse(jsonRun.stdout) as Array<{
		title: string;
		status: string;
		client: string;
	}>;
	expect(tasks.map((task) => task.title)).toEqual(
		expect.arrayContaining([firstTask, secondTask]),
	);
	expect(tasks.every((task) => task.status === "Inbox")).toBe(true);

	// The human-readable table carries the same tasks with a header row.
	const tableRun = runCli(["list"], env);
	expect(tableRun.status).toBe(0);
	expect(tableRun.stdout).toContain("ID");
	expect(tableRun.stdout).toContain("STATUS");
	expect(tableRun.stdout).toContain(firstTask);
	expect(tableRun.stdout).toContain(secondTask);

	// Status filters pass through to the server (case-insensitively).
	const inboxRun = runCli(["list", "--status", "inbox", "--json"], env);
	expect(inboxRun.status).toBe(0);
	expect(JSON.parse(inboxRun.stdout)).toHaveLength(tasks.length);
	const ongoingRun = runCli(["list", "--status", "Ongoing", "--json"], env);
	expect(ongoingRun.status).toBe(0);
	expect(JSON.parse(ongoingRun.stdout)).toHaveLength(0);
	const badStatusRun = runCli(["list", "--status", "Someday"], env);
	expect(badStatusRun.status).toBe(2);
	expect(badStatusRun.stderr).toContain('Unknown status "Someday"');

	// `task auth` verifies against the live server, persists 0600, and later
	// commands read the stored credentials with no environment help.
	const configHome = mkdtempSync(join(tmpdir(), "task-cli-config-"));
	const authEnv = { XDG_CONFIG_HOME: configHome };
	const authRun = runCli(["auth", baseURL, token], authEnv);
	expect(authRun.status).toBe(0);
	expect(authRun.stdout).toContain("Credentials verified and saved");
	const configFile = join(configHome, "task", "config.json");
	expect(statSync(configFile).mode & 0o777).toBe(0o600);
	const storedRun = runCli(["list", "--json"], authEnv);
	expect(storedRun.status).toBe(0);
	expect(JSON.parse(storedRun.stdout)).toHaveLength(tasks.length);

	// A bad token is rejected up front - by auth and by list alike.
	const badAuthRun = runCli(["auth", baseURL, "not-a-real-token"], {
		XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "task-cli-bad-")),
	});
	expect(badAuthRun.status).toBe(1);
	expect(badAuthRun.stderr).toContain("rejected the API token");
	const badListRun = runCli(["list"], {
		TASK_URL: baseURL,
		TASK_TOKEN: "not-a-real-token",
	});
	expect(badListRun.status).toBe(1);
	expect(badListRun.stderr).toContain("rejected the API token");

	// Missing credentials point the user at `task auth`.
	const noCredsRun = runCli(["list"], {
		XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "task-cli-empty-")),
	});
	expect(noCredsRun.status).toBe(1);
	expect(noCredsRun.stderr).toContain("task auth");

	// Visibility is scoped by the token: a second user in a different org
	// sees none of the first org's tasks.
	const otherContext = await browser.newContext();
	try {
		const otherPage = await otherContext.newPage();
		await signUp(otherPage, "Other Org", "other-org@task-manager.local");
		const otherToken = await mintApiToken(otherPage);
		const otherRun = runCli(["list", "--json"], {
			TASK_URL: baseURL,
			TASK_TOKEN: otherToken,
		});
		expect(otherRun.status).toBe(0);
		const otherTasks = JSON.parse(otherRun.stdout) as Array<{
			title: string;
		}>;
		expect(otherTasks.map((task) => task.title)).not.toContain(firstTask);
	} finally {
		await otherContext.close();
	}
});
