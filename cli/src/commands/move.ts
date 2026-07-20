import { parseArgs } from "node:util";
import { parseId, withMcpSession } from "../command.ts";
import { CliError } from "../config.ts";
import { printHuman } from "../render.ts";
import { canonicalStatus } from "./list.ts";

const usage = "Usage: task move <id> <status>";

export async function moveCommand(argv: string[]): Promise<void> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({ args: argv, allowPositionals: true, options: {} });
	} catch (error) {
		throw new CliError(
			`${error instanceof Error ? error.message : String(error)}\n${usage}`,
			2,
		);
	}
	const [id, status, ...extra] = parsed.positionals;
	if (!id || !status || extra.length > 0) throw new CliError(usage, 2);
	const taskId = parseId(id);
	const canonical = canonicalStatus(status);

	await withMcpSession(async (session) => {
		const result = await session.callTool<{
			id: number;
			title: string;
			status: string;
		}>("move_task_status", {
			task_id: taskId,
			status: canonical,
		});
		printHuman(`Task ${result.id} moved to ${result.status}.`);
	});
}
