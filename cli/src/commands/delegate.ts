import { parseArgs } from "node:util";
import { CliError, loadCredentials } from "../config.ts";
import { connect } from "../mcp.ts";

const usage = "Usage: task delegate <id> --to <member>";

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
	const [id, ...extra] = parsed.positionals;
	if (!id || extra.length > 0) throw new CliError(usage, 2);
	if (!/^\d+$/.test(id)) {
		throw new CliError(`"${id}" is not a task ID (expected an integer).`, 2);
	}
	const to = parsed.values.to;
	if (typeof to !== "string" || !to) {
		throw new CliError(
			`Missing --to <member> (the teammate's name or email).\n${usage}`,
			2,
		);
	}

	const session = await connect(loadCredentials());
	try {
		const result = (await session.callTool("delegate_task", {
			task_id: Number(id),
			assignee: to,
		})) as { id: number; delegated_to: string };
		console.log(
			`Task ${result.id} delegated to ${result.delegated_to}. It appears on their board.`,
		);
	} finally {
		await session.close();
	}
}
