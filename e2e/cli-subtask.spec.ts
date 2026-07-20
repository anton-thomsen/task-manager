import { expect, test } from "@playwright/test";
import { createTask, mintApiToken, runCli, signUp } from "./cli-helpers";

type ShowDetail = {
	subtasks: Array<{
		id: number;
		title: string;
		description: string | null;
		reference_links: string[];
		status: string;
		estimated_hours: "n/a" | number;
		completed_by: string | null;
	}>;
	work_logs: Array<{
		note: string;
		details: string | null;
		hours_spent: number | null;
		estimated_hours: "n/a" | number;
		author: string | null;
	}>;
};

function showJson(taskId: number, env: Record<string, string>): ShowDetail {
	const run = runCli(["show", String(taskId), "--json"], env);
	expect(run.status).toBe(0);
	return JSON.parse(run.stdout) as ShowDetail;
}

test("task subtask add/complete and task log track effort end to end", async ({
	page,
	baseURL,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Subtask Owner", "subtask-owner@task-manager.local");
	const taskId = await createTask(page, "Break down the effort");
	const token = await mintApiToken(page);
	const env = { TASK_URL: baseURL, TASK_TOKEN: token };

	// Add a subtask with estimate, description, and two reference links.
	const addRun = runCli(
		[
			"subtask",
			"add",
			String(taskId),
			"--title",
			"Wire the flags",
			"--estimate",
			"1.25",
			"--description",
			"Map the flags onto add_subtask.",
			"--link",
			"https://example.com/spec",
			"--link",
			"https://example.com/prior-art",
		],
		env,
	);
	expect(addRun.status).toBe(0);
	expect(addRun.stdout).toContain(`added to task ${taskId}`);

	let detail = showJson(taskId, env);
	expect(detail.subtasks).toHaveLength(1);
	const subtask = detail.subtasks[0];
	if (!subtask) throw new Error("The added subtask is missing.");
	expect(subtask.title).toBe("Wire the flags");
	expect(subtask.description).toBe("Map the flags onto add_subtask.");
	expect(subtask.estimated_hours).toBe(1.25);
	expect(subtask.reference_links).toEqual([
		"https://example.com/spec",
		"https://example.com/prior-art",
	]);
	expect(subtask.status).not.toBe("Finished");
	expect(subtask.completed_by).toBeNull();

	// The 15-minute increment rule is the server's: its message surfaces, exit 1.
	const badEstimateRun = runCli(
		[
			"subtask",
			"add",
			String(taskId),
			"--title",
			"Sloppy estimate",
			"--estimate",
			"0.3",
		],
		env,
	);
	expect(badEstimateRun.status).toBe(1);
	expect(badEstimateRun.stderr).toContain(
		"Subtask estimates use 15-minute increments",
	);

	// Missing --title is a usage error, exit 2, before touching the network.
	const noTitleRun = runCli(["subtask", "add", String(taskId)], env);
	expect(noTitleRun.status).toBe(2);
	expect(noTitleRun.stderr).toContain("--title");

	// Completing attributes the subtask to the caller.
	const completeRun = runCli(["subtask", "complete", String(subtask.id)], env);
	expect(completeRun.status).toBe(0);
	expect(completeRun.stdout).toContain(`Subtask ${subtask.id}`);
	expect(completeRun.stdout).toContain("attributed to you");

	detail = showJson(taskId, env);
	expect(detail.subtasks[0]?.status).toBe("Finished");
	expect(detail.subtasks[0]?.completed_by).toBe("Subtask Owner");

	// Logging work records note, hours, details, and expected hours.
	const logRun = runCli(
		[
			"log",
			String(taskId),
			"--note",
			"Wired the CLI",
			"--hours",
			"1.5",
			"--details",
			"Flag parsing took a second pass.",
			"--expected",
			"1.25",
		],
		env,
	);
	expect(logRun.status).toBe(0);
	expect(logRun.stdout).toContain(`Logged 1.5h on task ${taskId}`);

	detail = showJson(taskId, env);
	expect(detail.work_logs).toHaveLength(1);
	const log = detail.work_logs[0];
	expect(log?.note).toBe("Wired the CLI");
	expect(log?.hours_spent).toBe(1.5);
	expect(log?.estimated_hours).toBe(1.25);
	expect(log?.details).toBe("Flag parsing took a second pass.");
	expect(log?.author).toBe("Subtask Owner");

	// Omitting required log flags is a usage error, exit 2; the details
	// contract names "nothing notable" as the only explicit opt-out.
	const noDetailsRun = runCli(
		["log", String(taskId), "--note", "Quick fix", "--hours", "0.5"],
		env,
	);
	expect(noDetailsRun.status).toBe(2);
	expect(noDetailsRun.stderr).toContain("--details");
	expect(noDetailsRun.stderr).toContain("nothing notable");

	const bareLogRun = runCli(["log", String(taskId)], env);
	expect(bareLogRun.status).toBe(2);
	expect(bareLogRun.stderr).toContain("--note");
	expect(bareLogRun.stderr).toContain("--hours");
});
