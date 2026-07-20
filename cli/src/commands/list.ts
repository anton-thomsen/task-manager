import { parseArgs } from "node:util";
import { taskStatuses } from "../../../src/lib/tasks.ts";
import { withMcpSession } from "../command.ts";
import { CliError } from "../config.ts";
import {
	type Estimate,
	formatEstimate,
	formatParticipants,
	type Participant,
	printHuman,
	renderTable,
} from "../render.ts";

type TaskSummary = {
	id: number;
	title: string;
	status: string;
	archived: boolean;
	deadline: string | null;
	estimate: Estimate;
	client: string;
	label: string;
	participants: Participant[];
};

export function canonicalStatus(value: string): (typeof taskStatuses)[number] {
	const match = taskStatuses.find(
		(status) => status.toLowerCase() === value.toLowerCase(),
	);
	if (!match) {
		throw new CliError(
			`Unknown status "${value}". Expected one of: ${taskStatuses.join(", ")}.`,
			2,
		);
	}
	return match;
}

export async function listCommand(argv: string[]): Promise<void> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: false,
			options: {
				status: { type: "string" },
				client: { type: "string" },
				label: { type: "string" },
				assignee: { type: "string" },
				archived: { type: "boolean", default: false },
				json: { type: "boolean", default: false },
			},
		});
	} catch (error) {
		throw new CliError(
			`${error instanceof Error ? error.message : String(error)}\nUsage: task list [--status <status>] [--client <name>] [--label <name>] [--assignee <member>] [--archived] [--json]`,
			2,
		);
	}
	const values = parsed.values as {
		status?: string;
		client?: string;
		label?: string;
		assignee?: string;
		archived: boolean;
		json: boolean;
	};

	await withMcpSession(async (session) => {
		const tasks = await session.callTool<TaskSummary[]>("list_tasks", {
			...(values.status ? { status: canonicalStatus(values.status) } : {}),
			...(values.client ? { client: values.client } : {}),
			...(values.label ? { label: values.label } : {}),
			...(values.assignee ? { assignee: values.assignee } : {}),
			include_archived: values.archived,
		});

		if (values.json) {
			console.log(JSON.stringify(tasks, null, 2));
			return;
		}
		if (tasks.length === 0) {
			printHuman("No tasks.");
			return;
		}
		const rows = tasks.map((task) => [
			String(task.id),
			task.status,
			task.title,
			task.client === "none" ? "-" : task.client,
			task.label === "no label" ? "-" : task.label,
			task.deadline ?? "-",
			formatEstimate(task.estimate),
			formatParticipants(task.participants),
		]);
		printHuman(
			renderTable(rows, [
				"ID",
				"STATUS",
				"TITLE",
				"CLIENT",
				"LABEL",
				"DEADLINE",
				"EST",
				"WHO",
			]),
		);
	});
}
