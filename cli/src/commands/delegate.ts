import { parseArgs } from "node:util";
import { parseId, withMcpSession } from "../command.ts";
import { CliError } from "../config.ts";
import { printHuman } from "../render.ts";

const usage =
	"Usage: task delegate <id> <member> | task delegate <id> --to <member>";

export async function delegateCommand(argv: string[]): Promise<void> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			options: { to: { type: "string" } },
		});
	} catch (error) {
		throw new CliError(
			`${error instanceof Error ? error.message : String(error)}\n${usage}`,
			2,
		);
	}
	const [id, positionalMember, ...extra] = parsed.positionals;
	if (!id || extra.length > 0) throw new CliError(usage, 2);
	const taskId = parseId(id);
	const optionMember = parsed.values.to;
	if (positionalMember && optionMember) {
		throw new CliError(
			`Pass the member either positionally or with --to, not both.\n${usage}`,
			2,
		);
	}
	const to = positionalMember ?? optionMember;
	if (typeof to !== "string" || !to) {
		throw new CliError(
			`Missing <member> (the teammate's name or email).\n${usage}`,
			2,
		);
	}

	await withMcpSession(async (session) => {
		const result = await session.callTool<{
			id: number;
			delegated_to: string;
		}>("delegate_task", { task_id: taskId, assignee: to });
		printHuman(
			`Task ${result.id} delegated to ${result.delegated_to}. It appears on their board.`,
		);
	});
}
