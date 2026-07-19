import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "@playwright/test";
import { mintApiToken, runCli, signUp } from "./cli-helpers";

type TaskSummary = { id: number; status: string };

type RawToolResult = { isError: boolean; text: string };

// Unlike the shared mcpCaller (which asserts success), this raw caller
// surfaces isError so rejection paths can be asserted at the MCP seam.
async function rawMcpClient(baseURL: string, token: string) {
	const transport = new StreamableHTTPClientTransport(
		new URL("/api/mcp", baseURL),
		{ requestInit: { headers: { Authorization: `Bearer ${token}` } } },
	);
	const client = new Client({ name: "e2e-move", version: "1.0.0" });
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

function createdTaskId(stdout: string): number {
	const match = /^Task (\d+) /.exec(stdout);
	if (!match?.[1]) throw new Error(`No task ID in: ${stdout}`);
	return Number(match[1]);
}

test("move_task_status moves a task over MCP and rejects archived and unknown tasks", async ({
	page,
	baseURL,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Move Owner", "move-owner@task-manager.local");
	const token = await mintApiToken(page);

	const mcp = await rawMcpClient(baseURL, token);
	try {
		const tools = await mcp.client.listTools();
		expect(tools.tools.map((tool) => tool.name)).toContain("move_task_status");

		const optOuts = {
			deadline: "none",
			client: "none",
			estimate: "n/a",
			label: "no label",
		};
		const created = await mcp.call("create_task", {
			title: "Ride the lanes",
			...optOuts,
		});
		expect(created.isError).toBe(false);
		const taskId = (JSON.parse(created.text) as { id: number }).id;

		// Happy path: the move is confirmed with id, title, and new status.
		const moved = await mcp.call("move_task_status", {
			task_id: taskId,
			status: "Ongoing",
		});
		expect(moved.isError).toBe(false);
		expect(JSON.parse(moved.text)).toMatchObject({
			id: taskId,
			title: "Ride the lanes",
			status: "Ongoing",
		});

		// The task really landed in the destination lane.
		const listed = await mcp.call("list_tasks", { status: "Ongoing" });
		expect(listed.isError).toBe(false);
		const ongoing = JSON.parse(listed.text) as TaskSummary[];
		expect(ongoing.map((task) => task.id)).toContain(taskId);

		// Archived tasks are rejected: archive a second task from the board
		// (archiving is deliberately web-only) and try to move it over MCP.
		const frozenTitle = "Frozen in amber";
		const frozen = await mcp.call("create_task", {
			title: frozenTitle,
			...optOuts,
		});
		expect(frozen.isError).toBe(false);
		const frozenId = (JSON.parse(frozen.text) as { id: number }).id;
		await page.goto("/");
		const card = page.locator("article").filter({ hasText: frozenTitle });
		await card.getByRole("button", { name: "Archive task" }).click();
		await expect(card).toHaveCount(0);

		const archivedMove = await mcp.call("move_task_status", {
			task_id: frozenId,
			status: "Finished",
		});
		expect(archivedMove.isError).toBe(true);
		expect(archivedMove.text).toContain(`Task ${frozenId} is archived`);

		// An unknown task ID is a clean not-found error.
		const missingMove = await mcp.call("move_task_status", {
			task_id: 999_999,
			status: "Ongoing",
		});
		expect(missingMove.isError).toBe(true);
		expect(missingMove.text).toContain("Task 999999 not found.");
	} finally {
		await mcp.close();
	}
});

test("task move keeps the board current from the terminal", async ({
	page,
	baseURL,
	browser,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Move CLI Owner", "move-cli-owner@task-manager.local");
	const token = await mintApiToken(page);
	const env = { TASK_URL: baseURL, TASK_TOKEN: token };

	const createRun = runCli(
		[
			"create",
			"--title",
			"Sweep the inbox",
			"--deadline",
			"none",
			"--client",
			"none",
			"--estimate",
			"n/a",
			"--label",
			"no label",
		],
		env,
	);
	expect(createRun.status).toBe(0);
	const taskId = createdTaskId(createRun.stdout);

	// Status names are accepted case-insensitively and the move is confirmed.
	const moveRun = runCli(["move", String(taskId), "ongoing"], env);
	expect(moveRun.status).toBe(0);
	expect(moveRun.stdout).toContain(`Task ${taskId} moved to Ongoing.`);

	// The moved task shows its new status in task list.
	const listRun = runCli(["list", "--status", "Ongoing", "--json"], env);
	expect(listRun.status).toBe(0);
	const ongoing = JSON.parse(listRun.stdout) as TaskSummary[];
	expect(ongoing.find((task) => task.id === taskId)?.status).toBe("Ongoing");

	// Usage errors exit 2: an unknown status and a missing argument.
	const badStatusRun = runCli(["move", String(taskId), "Done"], env);
	expect(badStatusRun.status).toBe(2);
	expect(badStatusRun.stderr).toContain('Unknown status "Done"');
	expect(badStatusRun.stderr).toContain("Inbox, Review, Ongoing, Finished");

	const missingArgRun = runCli(["move", String(taskId)], env);
	expect(missingArgRun.status).toBe(2);
	expect(missingArgRun.stderr).toContain("Usage: task move <id> <status>");

	// A user from another organization cannot move the owner's task: their
	// visibility scope hides it entirely (exit 1, not-found).
	const outsiderContext = await browser.newContext();
	try {
		const outsiderPage = await outsiderContext.newPage();
		await signUp(
			outsiderPage,
			"Move Outsider",
			"move-outsider@task-manager.local",
		);
		const outsiderToken = await mintApiToken(outsiderPage);
		const outsiderRun = runCli(["move", String(taskId), "ongoing"], {
			TASK_URL: baseURL,
			TASK_TOKEN: outsiderToken,
		});
		expect(outsiderRun.status).toBe(1);
		expect(outsiderRun.stderr).toContain(`Task ${taskId} not found.`);
	} finally {
		await outsiderContext.close();
	}
});
