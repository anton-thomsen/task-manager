import { parseArgs } from "node:util";
import { parseId, withMcpSession } from "../command.ts";
import { CliError } from "../config.ts";
import { printHuman } from "../render.ts";

const usage =
	"Usage: task log <task-id> --note <summary> --hours <n> --details <text> [--expected <hours|n/a>]\n" +
	'--details records what actually happened; pass the literal "nothing notable" only when there is truly nothing to add.\n' +
	"Image attachments are web-only - the CLI has no flags for them.";

const requiredFlags = [
	["note", "a short summary of the work (max 240 characters)"],
	["hours", "the hours actually spent, as a decimal number"],
	[
		"details",
		'what actually happened (blockers, surprises); "nothing notable" is the explicit opt-out',
	],
] as const;

function parseHours(value: string, flag: string): number {
	const hours = Number(value.trim());
	if (!Number.isFinite(hours) || hours <= 0) {
		throw new CliError(
			`"${value}" is not valid for --${flag}. Pass a positive decimal number of hours.`,
			2,
		);
	}
	return hours;
}

export async function logCommand(argv: string[]): Promise<void> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			options: {
				note: { type: "string" },
				hours: { type: "string" },
				details: { type: "string" },
				expected: { type: "string" },
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
	const taskId = parseId(id);
	const values = parsed.values as Partial<
		Record<"note" | "hours" | "details" | "expected", string>
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
	const { note = "", hours: rawHours = "", details = "" } = values;
	const hours = parseHours(rawHours, "hours");
	const expected: "n/a" | number =
		values.expected === undefined ||
		values.expected.trim().toLowerCase() === "n/a"
			? "n/a"
			: parseHours(values.expected, "expected");

	await withMcpSession(async (session) => {
		const result = await session.callTool<{ id: number }>("log_work", {
			task_id: taskId,
			note,
			hours_spent: hours,
			details,
			estimated_hours: expected,
		});
		printHuman(`Logged ${hours}h on task ${taskId} (work log ${result.id}).`);
	});
}
