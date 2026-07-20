import { expect, test } from "@playwright/test";
import {
	createTask,
	mcpCaller,
	mintApiToken,
	runCli,
	signUp,
} from "./cli-helpers";

test("task show renders full detail and the directory commands list the org", async ({
	page,
	baseURL,
	browser,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Show Owner", "show-owner@task-manager.local");
	const title = "Render the detail view";
	const taskId = await createTask(page, title, { min: "2", max: "3" });
	const maxOnlyTaskId = await createTask(page, "Bounded above", {
		min: "",
		max: "3",
	});
	const minOnlyTaskId = await createTask(page, "Bounded below", {
		min: "2",
		max: "",
	});
	const token = await mintApiToken(page);
	const env = { TASK_URL: baseURL, TASK_TOKEN: token };

	const activeSubtask = "Draft the layout";
	const doneSubtask = "Ship the renderer";
	const logNote = "Aligned the columns";
	const unsafeTitle = "Visible title\u001b]0;owned title\u0007 after";
	const unsafeDetails = "Visible details\u001b[2J after";
	let unsafeTaskId = 0;
	const seed = await mcpCaller(baseURL, token);
	try {
		await seed.call("create_client", { name: "Acme Industries" });
		await seed.call("create_label", { name: "Deep Work", color: "#047857" });
		await seed.call("add_subtask", {
			task_id: taskId,
			title: activeSubtask,
			estimated_hours: 0.5,
		});
		const created = (await seed.call("add_subtask", {
			task_id: taskId,
			title: doneSubtask,
			estimated_hours: 0.25,
		})) as { id: number };
		await seed.call("complete_subtask", { subtask_id: created.id });
		await seed.call("log_work", {
			task_id: taskId,
			note: logNote,
			hours_spent: 0.75,
			estimated_hours: 0.25,
			details: "The padding math needed a second pass.",
		});
		const unsafeTask = (await seed.call("create_task", {
			title: unsafeTitle,
			deadline: "none",
			client: "none",
			estimate: "n/a",
			label: "no label",
		})) as { id: number };
		unsafeTaskId = unsafeTask.id;
		await seed.call("log_work", {
			task_id: unsafeTaskId,
			note: "Visible note",
			hours_spent: 0.25,
			estimated_hours: "n/a",
			details: unsafeDetails,
		});
	} finally {
		await seed.close();
	}

	// --json emits the full structured detail.
	const jsonRun = runCli(["show", String(taskId), "--json"], env);
	expect(jsonRun.status).toBe(0);
	const detail = JSON.parse(jsonRun.stdout) as {
		id: number;
		title: string;
		status: string;
		estimate: { min_hours: number; max_hours: number };
		subtasks: Array<{
			title: string;
			status: string;
			completed_by: string | null;
		}>;
		work_logs: Array<{
			note: string;
			hours_spent: number;
			estimated_hours: number;
			author: string | null;
		}>;
	};
	expect(detail.id).toBe(taskId);
	expect(detail.title).toBe(title);
	expect(detail.status).toBe("Inbox");
	expect(detail.estimate).toEqual({ min_hours: 2, max_hours: 3 });
	expect(detail.subtasks).toHaveLength(2);
	const finished = detail.subtasks.find((s) => s.title === doneSubtask);
	expect(finished?.status).toBe("Finished");
	expect(finished?.completed_by).toBe("Show Owner");
	const active = detail.subtasks.find((s) => s.title === activeSubtask);
	expect(active?.status).not.toBe("Finished");
	expect(detail.work_logs).toHaveLength(1);
	expect(detail.work_logs[0]?.note).toBe(logNote);
	expect(detail.work_logs[0]?.hours_spent).toBe(0.75);
	expect(detail.work_logs[0]?.estimated_hours).toBe(0.25);
	expect(detail.work_logs[0]?.author).toBe("Show Owner");

	// The human rendering carries the same facts.
	const humanRun = runCli(["show", String(taskId)], env);
	expect(humanRun.status).toBe(0);
	expect(humanRun.stdout).toContain(`#${taskId} ${title}`);
	expect(humanRun.stdout).toContain("2-3h");
	expect(humanRun.stdout).toContain(`[ ] `);
	expect(humanRun.stdout).toContain(activeSubtask);
	expect(humanRun.stdout).toContain(`[x] `);
	expect(humanRun.stdout).toContain(doneSubtask);
	expect(humanRun.stdout).toContain("completed by Show Owner");
	expect(humanRun.stdout).toContain(logNote);
	expect(humanRun.stdout).toContain("0.75h spent (est 0.25h)");
	expect(humanRun.stdout).toContain("The padding math needed a second pass.");

	const maxOnlyRun = runCli(["show", String(maxOnlyTaskId)], env);
	expect(maxOnlyRun.status).toBe(0);
	expect(maxOnlyRun.stdout).toContain("up to 3h");
	const minOnlyRun = runCli(["show", String(minOnlyTaskId)], env);
	expect(minOnlyRun.status).toBe(0);
	expect(minOnlyRun.stdout).toContain("2h+");

	const unsafeJsonRun = runCli(["show", String(unsafeTaskId), "--json"], env);
	expect(unsafeJsonRun.status).toBe(0);
	const unsafeDetail = JSON.parse(unsafeJsonRun.stdout) as {
		title: string;
		work_logs: Array<{ details: string }>;
	};
	expect(unsafeDetail.title).toBe(unsafeTitle);
	expect(unsafeDetail.work_logs[0]?.details).toBe(unsafeDetails);
	const unsafeHumanRun = runCli(["show", String(unsafeTaskId)], env);
	expect(unsafeHumanRun.status).toBe(0);
	expect(unsafeHumanRun.stdout).toContain("Visible title after");
	expect(unsafeHumanRun.stdout).toContain("Visible details");
	expect(unsafeHumanRun.stdout).not.toContain("\u001b");
	expect(unsafeHumanRun.stdout).not.toContain("owned title");
	const unsafeListRun = runCli(["list"], env);
	expect(unsafeListRun.status).toBe(0);
	expect(unsafeListRun.stdout).toContain("Visible title after");
	expect(unsafeListRun.stdout).not.toContain("\u001b");
	expect(unsafeListRun.stdout).not.toContain("owned title");

	// The directory commands list the org, as JSON and as text.
	const membersJson = runCli(["members", "--json"], env);
	expect(membersJson.status).toBe(0);
	expect(JSON.parse(membersJson.stdout)).toEqual([
		{
			name: "Show Owner",
			email: "show-owner@task-manager.local",
			role: "owner",
		},
	]);
	const membersRun = runCli(["members"], env);
	expect(membersRun.status).toBe(0);
	expect(membersRun.stdout).toContain("NAME");
	expect(membersRun.stdout).toContain("ROLE");
	expect(membersRun.stdout).toContain("show-owner@task-manager.local");

	const clientsJson = runCli(["clients", "--json"], env);
	expect(clientsJson.status).toBe(0);
	expect(JSON.parse(clientsJson.stdout)).toEqual(["Acme Industries"]);
	const clientsRun = runCli(["clients"], env);
	expect(clientsRun.status).toBe(0);
	expect(clientsRun.stdout).toContain("Acme Industries");

	const labelsJson = runCli(["labels", "--json"], env);
	expect(labelsJson.status).toBe(0);
	expect(JSON.parse(labelsJson.stdout)).toEqual([
		{ name: "Deep Work", color: "#047857" },
	]);
	const labelsRun = runCli(["labels"], env);
	expect(labelsRun.status).toBe(0);
	expect(labelsRun.stdout).toContain("Deep Work");
	expect(labelsRun.stdout).toContain("#047857");

	// Usage errors exit 2 before touching the network.
	const noIdRun = runCli(["show"], env);
	expect(noIdRun.status).toBe(2);
	expect(noIdRun.stderr).toContain("Usage: task show <id>");
	const badIdRun = runCli(["show", "not-a-number"], env);
	expect(badIdRun.status).toBe(2);
	expect(badIdRun.stderr).toContain("not a task ID");

	// A nonexistent ID fails with a clear message and non-zero exit.
	const missingRun = runCli(["show", "999999"], env);
	expect(missingRun.status).toBe(1);
	expect(missingRun.stderr).toContain("Task 999999 not found.");

	// A caller from another org is denied detail on a task they cannot see -
	// same message as a nonexistent ID, so visibility leaks nothing.
	const otherContext = await browser.newContext();
	try {
		const otherPage = await otherContext.newPage();
		await signUp(
			otherPage,
			"Show Outsider",
			"show-outsider@task-manager.local",
		);
		const otherToken = await mintApiToken(otherPage);
		const deniedRun = runCli(["show", String(taskId)], {
			TASK_URL: baseURL,
			TASK_TOKEN: otherToken,
		});
		expect(deniedRun.status).toBe(1);
		expect(deniedRun.stderr).toContain(`Task ${taskId} not found.`);
	} finally {
		await otherContext.close();
	}
});
