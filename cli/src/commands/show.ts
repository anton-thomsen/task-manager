import { parseArgs } from "node:util";
import { parseId, withMcpSession } from "../command.ts";
import { CliError } from "../config.ts";
import {
	type Estimate,
	formatEstimate,
	formatParticipants,
	type Participant,
	printHuman,
} from "../render.ts";

const usage = "Usage: task show <id> [--json]";

type Subtask = {
	id: number;
	title: string;
	description: string | null;
	reference_links: string[];
	status: string;
	estimated_hours: "n/a" | number;
	completed_by: string | null;
};

type WorkLog = {
	id: number;
	note: string;
	details: string | null;
	hours_spent: number | null;
	estimated_hours: "n/a" | number;
	author: string | null;
	created_at: string;
};

type TaskDetail = {
	id: number;
	title: string;
	status: string;
	archived: boolean;
	deadline: string | null;
	estimate: Estimate;
	client: string;
	label: string;
	participants: Participant[];
	description: string | null;
	created_at: string;
	created_by: string | null;
	subtasks: Subtask[];
	work_logs: WorkLog[];
};

function formatHours(hours: "n/a" | number | null): string {
	return hours === "n/a" || hours === null ? "-" : `${hours}h`;
}

function indent(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line) => `${prefix}${line}`)
		.join("\n");
}

function renderSubtask(subtask: Subtask): string {
	const box = subtask.status === "Finished" ? "[x]" : "[ ]";
	const parts = [`est ${formatHours(subtask.estimated_hours)}`];
	if (subtask.completed_by) parts.push(`completed by ${subtask.completed_by}`);
	const lines = [
		`  ${box} #${subtask.id} ${subtask.title} (${parts.join(", ")})`,
	];
	if (subtask.description) lines.push(indent(subtask.description, "      "));
	for (const link of subtask.reference_links) lines.push(`      ${link}`);
	return lines.join("\n");
}

function renderWorkLog(log: WorkLog): string {
	const date = log.created_at.slice(0, 10);
	const spent = formatHours(log.hours_spent);
	const estimated = formatHours(log.estimated_hours);
	const lines = [
		`  ${date}  ${log.author ?? "-"}  ${spent} spent (est ${estimated})  ${log.note}`,
	];
	if (log.details) lines.push(indent(log.details, "      "));
	return lines.join("\n");
}

function renderDetail(task: TaskDetail): string {
	const fields: Array<[string, string]> = [
		["Status", task.archived ? `${task.status} (archived)` : task.status],
		["Client", task.client === "none" ? "-" : task.client],
		["Label", task.label === "no label" ? "-" : task.label],
		["Deadline", task.deadline ?? "-"],
		["Estimate", formatEstimate(task.estimate)],
		["Participants", formatParticipants(task.participants)],
		["Created", `${task.created_at.slice(0, 10)} by ${task.created_by ?? "-"}`],
	];
	const width = Math.max(...fields.map(([name]) => name.length));
	const sections = [
		`#${task.id} ${task.title}`,
		fields.map(([name, value]) => `${name.padEnd(width)}  ${value}`).join("\n"),
	];
	if (task.description) {
		sections.push(`Description\n${indent(task.description, "  ")}`);
	}
	sections.push(
		`Subtasks\n${task.subtasks.map(renderSubtask).join("\n") || "  -"}`,
		`Work logs\n${task.work_logs.map(renderWorkLog).join("\n") || "  -"}`,
	);
	return sections.join("\n\n");
}

export async function showCommand(argv: string[]): Promise<void> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			options: { json: { type: "boolean", default: false } },
		});
	} catch (error) {
		throw new CliError(
			`${error instanceof Error ? error.message : String(error)}\n${usage}`,
			2,
		);
	}
	const [id, ...extra] = parsed.positionals;
	if (!id || extra.length > 0) throw new CliError(usage, 2);
	const taskId = parseId(id);
	const json = parsed.values.json === true;

	await withMcpSession(async (session) => {
		const task = await session.callTool<TaskDetail>("get_task", {
			task_id: taskId,
		});
		if (json) console.log(JSON.stringify(task, null, 2));
		else printHuman(renderDetail(task));
	});
}
