import { parseArgs } from "node:util";
import { CliError, loadCredentials } from "../config.ts";
import { connect } from "../mcp.ts";
import { canonicalStatus } from "./list.ts";

const usage =
	'Usage: task create --title <title> --deadline <YYYY-MM-DD|none> --client <name|none> --estimate <min-max|n/a> --label <name|"no label"> [--description <text>] [--status <status>] [--to <member>]';

// The required-fields contract: every flag takes a real value or its explicit
// opt-out literal - omitting one is a usage error, never a silent default.
const requiredFlags = [
	["title", "a short task title (always required)"],
	["deadline", 'an ISO date (YYYY-MM-DD), or "none" to opt out'],
	["client", 'an existing client name, or "none" to opt out'],
	[
		"estimate",
		'decimal hours as "min-max" (e.g. 2-4) or a single number, or "n/a" to opt out',
	],
	["label", 'an existing label name, or "no label" to opt out'],
] as const;

export type EstimateInput = "n/a" | { min_hours: number; max_hours: number };

export function parseEstimate(value: string): EstimateInput {
	const trimmed = value.trim();
	if (trimmed.toLowerCase() === "n/a") return "n/a";
	const match = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/.exec(trimmed);
	const min = Number(match?.[1]);
	const max = Number(match?.[2] ?? match?.[1]);
	if (!match || !(min > 0) || !(max > 0)) {
		throw new CliError(
			`"${value}" is not an estimate. Pass decimal hours as "min-max" (e.g. 2-4), a single number, or "n/a".`,
			2,
		);
	}
	if (min > max) {
		throw new CliError(
			`The estimate minimum (${min}) cannot exceed the maximum (${max}).`,
			2,
		);
	}
	return { min_hours: min, max_hours: max };
}

export async function createCommand(argv: string[]): Promise<void> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: false,
			options: {
				title: { type: "string" },
				deadline: { type: "string" },
				client: { type: "string" },
				estimate: { type: "string" },
				label: { type: "string" },
				description: { type: "string" },
				status: { type: "string" },
				to: { type: "string" },
			},
		});
	} catch (error) {
		throw new CliError(
			`${error instanceof Error ? error.message : String(error)}\n${usage}`,
			2,
		);
	}
	const values = parsed.values as Partial<
		Record<
			| "title"
			| "deadline"
			| "client"
			| "estimate"
			| "label"
			| "description"
			| "status"
			| "to",
			string
		>
	>;

	const missing = requiredFlags.filter(([flag]) => !values[flag]);
	if (missing.length > 0) {
		throw new CliError(
			`Missing required flag${missing.length > 1 ? "s" : ""}:\n${missing
				.map(([flag, hint]) => `  --${flag}  ${hint}`)
				.join("\n")}\n\n${usage}`,
			2,
		);
	}
	const {
		title = "",
		deadline = "",
		client = "",
		estimate: rawEstimate = "",
		label = "",
	} = values;
	const estimate = parseEstimate(rawEstimate);
	if (values.to && values.status) {
		throw new CliError(
			"--status cannot be combined with --to: delegated tasks always start in Inbox.",
			2,
		);
	}
	const status = values.status ? canonicalStatus(values.status) : undefined;

	const fields = {
		title,
		...(values.description ? { description: values.description } : {}),
		deadline,
		client,
		estimate,
		label,
	};
	const session = await connect(loadCredentials());
	try {
		if (values.to) {
			const result = (await session.callTool("delegate_task", {
				...fields,
				assignee: values.to,
			})) as { id: number; delegated_to: string };
			console.log(
				`Task ${result.id} created and delegated to ${result.delegated_to}.`,
			);
		} else {
			const result = (await session.callTool("create_task", {
				...fields,
				...(status ? { status } : {}),
			})) as { id: number; status: string };
			console.log(`Task ${result.id} created in ${result.status}.`);
		}
	} finally {
		await session.close();
	}
}
