import { parseArgs } from "node:util";
import { CliError, loadCredentials } from "../config.ts";
import { connect } from "../mcp.ts";

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
	if (!/^\d+$/.test(id)) {
		throw new CliError(`"${id}" is not a task ID (expected an integer).`, 2);
	}

	const session = await connect(loadCredentials());
	try {
		const result = (await session.callTool("accept_delegation", {
			task_id: Number(id),
		})) as { id: number; title: string };
		console.log(`Task ${result.id} accepted.`);
	} finally {
		await session.close();
	}
}
