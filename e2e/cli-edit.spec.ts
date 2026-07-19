import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "@playwright/test";
import { mintApiToken, runCli, signUp } from "./cli-helpers";

type TaskDetail = {
	id: number;
	title: string;
	deadline: string | null;
	client: string;
	label: string;
	estimate: "n/a" | { min_hours: number; max_hours: number };
};

type RawToolResult = { isError: boolean; text: string };

// Unlike the shared mcpCaller (which asserts success), this raw caller
// surfaces isError so rejection paths can be asserted at the MCP seam.
async function rawMcpClient(baseURL: string, token: string) {
	const transport = new StreamableHTTPClientTransport(
		new URL("/api/mcp", baseURL),
		{ requestInit: { headers: { Authorization: `Bearer ${token}` } } },
	);
	const client = new Client({ name: "e2e-edit", version: "1.0.0" });
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

test("update_task edits fields partially over MCP and rejects bad input", async ({
	page,
	baseURL,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Edit Owner", "edit-owner@task-manager.local");
	const token = await mintApiToken(page);

	const mcp = await rawMcpClient(baseURL, token);
	try {
		const tools = await mcp.client.listTools();
		expect(tools.tools.map((tool) => tool.name)).toContain("update_task");

		const seededClient = await mcp.call("create_client", { name: "Acme" });
		expect(seededClient.isError).toBe(false);
		const created = await mcp.call("create_task", {
			title: "Original wording",
			deadline: "2026-07-30",
			client: "Acme",
			estimate: { min_hours: 2, max_hours: 4 },
			label: "no label",
		});
		expect(created.isError).toBe(false);
		const taskId = (JSON.parse(created.text) as { id: number }).id;

		// Partial update happy path: only the passed fields change.
		const updated = await mcp.call("update_task", {
			task_id: taskId,
			title: "Sharper wording",
			estimate: { min_hours: 1, max_hours: 3 },
		});
		expect(updated.isError).toBe(false);
		expect(JSON.parse(updated.text)).toMatchObject({
			id: taskId,
			title: "Sharper wording",
			updated_fields: ["title", "estimate"],
		});

		const afterPartial = await mcp.call("get_task", { task_id: taskId });
		expect(afterPartial.isError).toBe(false);
		const partialDetail = JSON.parse(afterPartial.text) as TaskDetail;
		expect(partialDetail.title).toBe("Sharper wording");
		expect(partialDetail.estimate).toEqual({ min_hours: 1, max_hours: 3 });
		// Untouched fields survive the partial update.
		expect(partialDetail.deadline).toBe("2026-07-30");
		expect(partialDetail.client).toBe("Acme");

		// The explicit opt-out clears a previously set field.
		const cleared = await mcp.call("update_task", {
			task_id: taskId,
			deadline: "none",
		});
		expect(cleared.isError).toBe(false);
		const afterClear = await mcp.call("get_task", { task_id: taskId });
		const clearedDetail = JSON.parse(afterClear.text) as TaskDetail;
		expect(clearedDetail.deadline).toBeNull();
		expect(clearedDetail.client).toBe("Acme");

		// An unknown client surfaces the existing options.
		const unknownClient = await mcp.call("update_task", {
			task_id: taskId,
			client: "Globex",
		});
		expect(unknownClient.isError).toBe(true);
		expect(unknownClient.text).toContain('Unknown client "Globex"');
		expect(unknownClient.text).toContain("Acme");

		// Passing no fields at all is rejected.
		const noFields = await mcp.call("update_task", { task_id: taskId });
		expect(noFields.isError).toBe(true);
		expect(noFields.text).toContain("Pass at least one field");

		// Archived tasks are rejected: archive a second task from the board
		// (archiving is deliberately web-only) and try to edit it over MCP.
		const frozenTitle = "Set in stone";
		const frozen = await mcp.call("create_task", {
			title: frozenTitle,
			deadline: "none",
			client: "none",
			estimate: "n/a",
			label: "no label",
		});
		expect(frozen.isError).toBe(false);
		const frozenId = (JSON.parse(frozen.text) as { id: number }).id;
		await page.goto("/");
		const card = page.locator("article").filter({ hasText: frozenTitle });
		await card.getByRole("button", { name: "Archive task" }).click();
		await expect(card).toHaveCount(0);

		const archivedEdit = await mcp.call("update_task", {
			task_id: frozenId,
			title: "Chiseled anyway",
		});
		expect(archivedEdit.isError).toBe(true);
		expect(archivedEdit.text).toContain(`Task ${frozenId} is archived`);

		// An unknown task ID is a clean not-found error.
		const missingEdit = await mcp.call("update_task", {
			task_id: 999_999,
			title: "Ghost",
		});
		expect(missingEdit.isError).toBe(true);
		expect(missingEdit.text).toContain("Task 999999 not found.");
	} finally {
		await mcp.close();
	}
});

test("task edit corrects a task from the terminal", async ({
	page,
	baseURL,
	browser,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Edit CLI Owner", "edit-cli-owner@task-manager.local");
	const token = await mintApiToken(page);
	const env = { TASK_URL: baseURL, TASK_TOKEN: token };

	const createRun = runCli(
		[
			"create",
			"--title",
			"Rough draft",
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

	// Editing two fields in one command confirms what changed.
	const editRun = runCli(
		[
			"edit",
			String(taskId),
			"--deadline",
			"2026-08-01",
			"--title",
			"Polished final",
		],
		env,
	);
	expect(editRun.status).toBe(0);
	expect(editRun.stdout).toContain(`Task ${taskId} updated (title, deadline).`);

	// Both edits are visible in task show.
	const showRun = runCli(["show", String(taskId), "--json"], env);
	expect(showRun.status).toBe(0);
	const detail = JSON.parse(showRun.stdout) as {
		title: string;
		deadline: string | null;
	};
	expect(detail.title).toBe("Polished final");
	expect(detail.deadline).toBe("2026-08-01");

	// Providing no field flags is a usage error.
	const noFlagsRun = runCli(["edit", String(taskId)], env);
	expect(noFlagsRun.status).toBe(2);
	expect(noFlagsRun.stderr).toContain("Pass at least one field flag");

	// A user from another organization cannot edit the owner's task: their
	// visibility scope hides it entirely (exit 1, not-found).
	const outsiderContext = await browser.newContext();
	try {
		const outsiderPage = await outsiderContext.newPage();
		await signUp(
			outsiderPage,
			"Edit Outsider",
			"edit-outsider@task-manager.local",
		);
		const outsiderToken = await mintApiToken(outsiderPage);
		const outsiderRun = runCli(["edit", String(taskId), "--title", "Hijack"], {
			TASK_URL: baseURL,
			TASK_TOKEN: outsiderToken,
		});
		expect(outsiderRun.status).toBe(1);
		expect(outsiderRun.stderr).toContain(`Task ${taskId} not found.`);
	} finally {
		await outsiderContext.close();
	}
});
