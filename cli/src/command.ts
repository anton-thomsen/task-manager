import type { Credentials } from "./config.ts";
import { CliError, loadCredentials } from "./config.ts";
import { connect, type McpSession } from "./mcp.ts";

export function parseId(value: string, what = "task ID"): number {
	if (!/^\d+$/.test(value)) {
		throw new CliError(`"${value}" is not a ${what} (expected an integer).`, 2);
	}
	const id = Number(value);
	if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) {
		throw new CliError(`"${value}" is not a ${what} (expected an integer).`, 2);
	}
	return id;
}

export async function withMcpSession<T>(
	handler: (session: McpSession) => Promise<T>,
	credentials: Credentials = loadCredentials(),
): Promise<T> {
	const session = await connect(credentials);
	try {
		return await handler(session);
	} finally {
		await session.close();
	}
}
