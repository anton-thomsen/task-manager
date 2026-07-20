import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
	findPendingInvitationId,
	mintApiToken,
	runCli,
	signUp,
} from "./cli-helpers";

type Participant = { name: string; email: string; accepted: boolean };

type TaskDetail = { id: number; participants: Participant[] };

type RawToolResult = { isError: boolean; text: string };

// Unlike the shared mcpCaller (which asserts success), this raw caller
// surfaces isError so rejection paths can be asserted at the MCP seam.
async function rawMcpClient(baseURL: string, token: string) {
	const transport = new StreamableHTTPClientTransport(
		new URL("/api/mcp", baseURL),
		{ requestInit: { headers: { Authorization: `Bearer ${token}` } } },
	);
	const client = new Client({ name: "e2e-accept", version: "1.0.0" });
	await client.connect(transport);
	return {
		client,
		async call(
			name: string,
			args: Record<string, unknown>,
		): Promise<RawToolResult> {
			const response = await client.callTool({ name, arguments: args });
			const content = response.content as Array<{ type: string; text: string }>;
			return {
				isError: response.isError === true,
				text: content.find((item) => item.type === "text")?.text ?? "",
			};
		},
		close: () => transport.close(),
	};
}

// The owner invites the email from Settings > Members (the invitation ID
// comes from the e2e database - no Resend key, so no real email), then the
// invitee signs up in a second browser context, accepts the invitation, and
// mints their own API token as an in-org member.
async function joinAsMember(
	ownerPage: Page,
	browser: Browser,
	name: string,
	email: string,
): Promise<{ token: string; close: () => Promise<void> }> {
	await ownerPage.goto("/settings/members");
	await ownerPage.getByLabel("Email").fill(email);
	await ownerPage.getByRole("button", { name: "Send invite" }).click();
	await expect(ownerPage.getByText("Invitation sent.")).toBeVisible();
	const invitationId = await findPendingInvitationId(email);

	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto("/signup");
	await page.getByLabel("Name").fill(name);
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill("cli-e2e-local-password");
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL((url) => url.pathname !== "/signup");
	await page.goto(`/accept-invitation/${invitationId}`);
	await page.getByRole("button", { name: "Accept invitation" }).click();
	await expect(page).toHaveURL((url) => url.pathname === "/");
	const token = await mintApiToken(page);
	return { token, close: () => context.close() };
}

const optOuts = {
	deadline: "none",
	client: "none",
	estimate: "n/a",
	label: "no label",
};

test("accept_delegation accepts only the caller's own pending assignment over MCP", async ({
	page,
	baseURL,
	browser,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Accept Owner", "accept-owner@task-manager.local");
	const ownerToken = await mintApiToken(page);
	const memberEmail = "accept-member@task-manager.local";
	const member = await joinAsMember(
		page,
		browser,
		"Accept Member",
		memberEmail,
	);
	try {
		const ownerMcp = await rawMcpClient(baseURL, ownerToken);
		const memberMcp = await rawMcpClient(baseURL, member.token);
		try {
			const tools = await memberMcp.client.listTools();
			expect(tools.tools.map((tool) => tool.name)).toContain(
				"accept_delegation",
			);

			// The owner creates and delegates in one step, so the member is the
			// sole (pending) participant and the owner has no assignment at all.
			const title = "Water the office plants";
			const delegated = await ownerMcp.call("delegate_task", {
				title,
				assignee: memberEmail,
				...optOuts,
			});
			expect(delegated.isError).toBe(false);
			const taskId = (JSON.parse(delegated.text) as { id: number }).id;

			// The pending state is visible in the serialized participants.
			const before = await memberMcp.call("get_task", { task_id: taskId });
			expect(before.isError).toBe(false);
			expect((JSON.parse(before.text) as TaskDetail).participants).toEqual([
				{ name: "Accept Member", email: memberEmail, accepted: false },
			]);

			const attempts = await Promise.all([
				memberMcp.call("accept_delegation", { task_id: taskId }),
				memberMcp.call("accept_delegation", { task_id: taskId }),
			]);
			expect(attempts.filter((attempt) => !attempt.isError)).toHaveLength(1);
			expect(attempts.filter((attempt) => attempt.isError)).toHaveLength(1);
			const accepted = attempts.find((attempt) => !attempt.isError);
			expect(JSON.parse(accepted?.text ?? "null")).toMatchObject({
				id: taskId,
				title,
			});
			expect(attempts.find((attempt) => attempt.isError)?.text).toContain(
				`Task ${taskId} is already accepted.`,
			);

			const after = await memberMcp.call("get_task", { task_id: taskId });
			expect(after.isError).toBe(false);
			expect((JSON.parse(after.text) as TaskDetail).participants).toEqual([
				{ name: "Accept Member", email: memberEmail, accepted: true },
			]);

			// Accepting again is a clear error.
			const again = await memberMcp.call("accept_delegation", {
				task_id: taskId,
			});
			expect(again.isError).toBe(true);
			expect(again.text).toContain(`Task ${taskId} is already accepted.`);

			// The owner sees the task but holds no assignment on it - accepting
			// someone else's delegation is rejected.
			const ownerAccept = await ownerMcp.call("accept_delegation", {
				task_id: taskId,
			});
			expect(ownerAccept.isError).toBe(true);
			expect(ownerAccept.text).toContain(
				`Task ${taskId} is not delegated to you`,
			);

			// An unknown task ID is a clean not-found error.
			const missing = await memberMcp.call("accept_delegation", {
				task_id: 999_999,
			});
			expect(missing.isError).toBe(true);
			expect(missing.text).toContain("Task 999999 not found.");
		} finally {
			await ownerMcp.close();
			await memberMcp.close();
		}
	} finally {
		await member.close();
	}
});

test("task accept clears a pending delegation from the terminal", async ({
	page,
	baseURL,
	browser,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Accept CLI Owner", "accept-cli-owner@task-manager.local");
	const ownerToken = await mintApiToken(page);
	const ownerEnv = { TASK_URL: baseURL, TASK_TOKEN: ownerToken };
	const memberEmail = "accept-cli-member@task-manager.local";
	const member = await joinAsMember(
		page,
		browser,
		"Accept CLI Member",
		memberEmail,
	);
	try {
		const memberEnv = { TASK_URL: baseURL, TASK_TOKEN: member.token };

		// The owner creates and delegates a task to the member in one line.
		const createRun = runCli(
			[
				"create",
				"--title",
				"Refill the coffee beans",
				"--deadline",
				"none",
				"--client",
				"none",
				"--estimate",
				"n/a",
				"--label",
				"no label",
				"--to",
				memberEmail,
			],
			ownerEnv,
		);
		expect(createRun.status).toBe(0);
		const match = /^Task (\d+) /.exec(createRun.stdout);
		if (!match?.[1]) throw new Error(`No task ID in: ${createRun.stdout}`);
		const taskId = Number(match[1]);

		// The member sees the pending marker in human output.
		const showBefore = runCli(["show", String(taskId)], memberEnv);
		expect(showBefore.status).toBe(0);
		expect(showBefore.stdout).toContain("Accept CLI Member (pending)");

		// Accepting confirms and flips the serialized accepted flag.
		const acceptRun = runCli(["accept", String(taskId)], memberEnv);
		expect(acceptRun.status).toBe(0);
		expect(acceptRun.stdout).toContain(`Task ${taskId} accepted.`);

		const showAfter = runCli(["show", String(taskId), "--json"], memberEnv);
		expect(showAfter.status).toBe(0);
		const detail = JSON.parse(showAfter.stdout) as TaskDetail;
		expect(detail.participants).toEqual([
			{ name: "Accept CLI Member", email: memberEmail, accepted: true },
		]);
		const showHuman = runCli(["show", String(taskId)], memberEnv);
		expect(showHuman.status).toBe(0);
		expect(showHuman.stdout).not.toContain("(pending)");

		// Accepting twice is a server error (exit 1).
		const againRun = runCli(["accept", String(taskId)], memberEnv);
		expect(againRun.status).toBe(1);
		expect(againRun.stderr).toContain(`Task ${taskId} is already accepted.`);

		// The owner has no assignment to accept (exit 1).
		const ownerRun = runCli(["accept", String(taskId)], ownerEnv);
		expect(ownerRun.status).toBe(1);
		expect(ownerRun.stderr).toContain(`Task ${taskId} is not delegated to you`);

		// Usage errors exit 2: a missing ID and a non-integer ID.
		const noArgRun = runCli(["accept"], memberEnv);
		expect(noArgRun.status).toBe(2);
		expect(noArgRun.stderr).toContain("Usage: task accept <id>");

		const badIdRun = runCli(["accept", "soon"], memberEnv);
		expect(badIdRun.status).toBe(2);
		expect(badIdRun.stderr).toContain("not a task ID");
	} finally {
		await member.close();
	}
});
