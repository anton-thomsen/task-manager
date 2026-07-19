import { parseArgs } from "node:util";
import { CliError, loadCredentials } from "../config.ts";
import { connect } from "../mcp.ts";
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
	if (!/^\d+$/.test(id)) {
		throw new CliError(`"${id}" is not a task ID (expected an integer).`, 2);
	}
	const canonical = canonicalStatus(status);

	const session = await connect(loadCredentials());
	try {
		const result = (await session.callTool("move_task_status", {
			task_id: Number(id),
			status: canonical,
		})) as { id: number; title: string; status: string };
		console.log(`Task ${result.id} moved to ${result.status}.`);
	} finally {
		await session.close();
	}
}
