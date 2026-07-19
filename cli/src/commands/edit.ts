import { parseArgs } from "node:util";
import { CliError, loadCredentials } from "../config.ts";
import { connect } from "../mcp.ts";
import { parseEstimate } from "./create.ts";

const usage =
	'Usage: task edit <id> [--title <title>] [--description <text>] [--deadline <YYYY-MM-DD|none>] [--client <name|none>] [--estimate <min-max|n/a>] [--label <name|"no label">]';

const fieldFlags = [
	"title",
	"description",
	"deadline",
	"client",
	"estimate",
	"label",
] as const;

type FieldFlag = (typeof fieldFlags)[number];

export async function editCommand(argv: string[]): Promise<void> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			options: {
				title: { type: "string" },
				description: { type: "string" },
				deadline: { type: "string" },
				client: { type: "string" },
				estimate: { type: "string" },
				label: { type: "string" },
			},
		});
	} catch (error) {
		throw new CliError(
			`${error instanceof Error ? error.message : String(error)}\n${usage}`,
			2,
		);
	}
	const [id, ...extra] = parsed.positionals;
	if (!id || extra.length > 0) throw new CliError(usage, 2);
	if (!/^\d+$/.test(id)) {
		throw new CliError(`"${id}" is not a task ID (expected an integer).`, 2);
	}
	const values = parsed.values as Partial<Record<FieldFlag, string>>;
	const provided = fieldFlags.filter((flag) => values[flag] !== undefined);
	if (provided.length === 0) {
		throw new CliError(`Pass at least one field flag to edit.\n${usage}`, 2);
	}

	const fields: Record<string, unknown> = { task_id: Number(id) };
	for (const flag of provided) {
		fields[flag] =
			flag === "estimate" ? parseEstimate(values.estimate ?? "") : values[flag];
	}

	const session = await connect(loadCredentials());
	try {
		const result = (await session.callTool("update_task", fields)) as {
			id: number;
			updated_fields: string[];
		};
		console.log(
			`Task ${result.id} updated (${result.updated_fields.join(", ")}).`,
		);
	} finally {
		await session.close();
	}
}
