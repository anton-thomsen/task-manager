import { parseArgs } from "node:util";
import { parseId, withMcpSession } from "../command.ts";
import { CliError } from "../config.ts";
import { printHuman } from "../render.ts";

const usage = "Usage: task accept <id>";

export async function acceptCommand(argv: string[]): Promise<void> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({ args: argv, allowPositionals: true, options: {} });
	} catch (error) {
		throw new CliError(
			`${error instanceof Error ? error.message : String(error)}\n${usage}`,
			2,
		);
	}
	const [id, ...extra] = parsed.positionals;
	if (!id || extra.length > 0) throw new CliError(usage, 2);
	const taskId = parseId(id);

	await withMcpSession(async (session) => {
		const result = await session.callTool<{ id: number; title: string }>(
			"accept_delegation",
			{ task_id: taskId },
		);
		printHuman(`Task ${result.id} accepted.`);
	});
}
