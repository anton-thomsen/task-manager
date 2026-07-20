import { parseArgs } from "node:util";
import { parseId, withMcpSession } from "../command.ts";
import { CliError } from "../config.ts";
import { printHuman } from "../render.ts";

const addUsage =
	"Usage: task subtask add <task-id> --title <title> [--estimate <hours|n/a>] [--description <text>] [--link <url> ...]\n" +
	"Estimates use 15-minute increments (0.25 steps, max 5); omitting --estimate records no estimate.\n" +
	"Image attachments are web-only - the CLI has no flags for them.";

const completeUsage = "Usage: task subtask complete <subtask-id>";

const usage = `${addUsage}\n${completeUsage}`;

type SubtaskEstimate = "n/a" | number;

// Format-only check: the 15-minute increment and 5h max rules stay with the
// server, whose message is surfaced verbatim (exit 1).
function parseSubtaskEstimate(value: string): SubtaskEstimate {
	const trimmed = value.trim();
	if (trimmed.toLowerCase() === "n/a") return "n/a";
	const hours = Number(trimmed);
	if (!Number.isFinite(hours) || hours <= 0) {
		throw new CliError(
			`"${value}" is not a subtask estimate. Pass hours in 15-minute increments (e.g. 0.25, 1.5) or "n/a".`,
			2,
		);
	}
	return hours;
}

async function addSubtask(argv: string[]): Promise<void> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			options: {
				title: { type: "string" },
				estimate: { type: "string" },
				description: { type: "string" },
				link: { type: "string", multiple: true },
			},
		});
	} catch (error) {
		throw new CliError(
			`${error instanceof Error ? error.message : String(error)}\n${addUsage}`,
			2,
		);
	}
	const [id, ...extra] = parsed.positionals;
	if (!id || extra.length > 0) throw new CliError(addUsage, 2);
	const taskId = parseId(id);
	const values = parsed.values as Partial<{
		title: string;
		estimate: string;
		description: string;
		link: string[];
	}>;
	if (!values.title) {
		throw new CliError(
			`Missing required flag:\n  --title  a short subtask title\n\n${addUsage}`,
			2,
		);
	}
	const estimate = values.estimate
		? parseSubtaskEstimate(values.estimate)
		: "n/a";

	await withMcpSession(async (session) => {
		const result = await session.callTool<{ id: number }>("add_subtask", {
			task_id: taskId,
			title: values.title,
			...(values.description ? { description: values.description } : {}),
			...(values.link ? { reference_links: values.link } : {}),
			estimated_hours: estimate,
		});
		printHuman(`Subtask ${result.id} added to task ${taskId}.`);
	});
}

async function completeSubtask(argv: string[]): Promise<void> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({ args: argv, allowPositionals: true, options: {} });
	} catch (error) {
		throw new CliError(
			`${error instanceof Error ? error.message : String(error)}\n${completeUsage}`,
			2,
		);
	}
	const [id, ...extra] = parsed.positionals;
	if (!id || extra.length > 0) throw new CliError(completeUsage, 2);
	const subtaskId = parseId(id, "subtask ID");

	await withMcpSession(async (session) => {
		const result = await session.callTool<{ id: number; task_id: number }>(
			"complete_subtask",
			{ subtask_id: subtaskId },
		);
		printHuman(
			`Subtask ${result.id} on task ${result.task_id} completed, attributed to you.`,
		);
	});
}

export async function subtaskCommand(argv: string[]): Promise<void> {
	const [action, ...rest] = argv;
	switch (action) {
		case "add":
			await addSubtask(rest);
			return;
		case "complete":
			await completeSubtask(rest);
			return;
		default:
			throw new CliError(usage, 2);
	}
}
