import { parseArgs } from "node:util";
import { CliError, loadCredentials } from "../config.ts";
import { connect } from "../mcp.ts";
import {
	type Estimate,
	formatEstimate,
	formatParticipants,
	type Participant,
	renderTable,
} from "../render.ts";

const statuses = ["Inbox", "Review", "Ongoing", "Finished"] as const;

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

export function canonicalStatus(value: string): string {
	const match = statuses.find(
		(status) => status.toLowerCase() === value.toLowerCase(),
	);
	if (!match) {
		throw new CliError(
			`Unknown status "${value}". Expected one of: ${statuses.join(", ")}.`,
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

	const session = await connect(loadCredentials());
	try {
		const tasks = (await session.callTool("list_tasks", {
			...(values.status ? { status: canonicalStatus(values.status) } : {}),
			...(values.client ? { client: values.client } : {}),
			...(values.label ? { label: values.label } : {}),
			...(values.assignee ? { assignee: values.assignee } : {}),
			include_archived: values.archived,
		})) as TaskSummary[];

		if (values.json) {
			console.log(JSON.stringify(tasks, null, 2));
			return;
		}
		if (tasks.length === 0) {
			console.log("No tasks.");
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
		console.log(
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
	} finally {
		await session.close();
	}
}
