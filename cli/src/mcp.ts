import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CliError, type Credentials } from "./config.ts";

export type McpSession = {
	callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
	close: () => Promise<void>;
};

function isUnauthorized(error: unknown): boolean {
	return (
		error instanceof Error &&
		/\b401\b|unauthorized|invalid_token/i.test(error.message)
	);
}

export async function connect(credentials: Credentials): Promise<McpSession> {
	let endpoint: URL;
	try {
		endpoint = new URL("/api/mcp", credentials.url);
	} catch {
		throw new CliError(`"${credentials.url}" is not a valid server URL.`);
	}
	const transport = new StreamableHTTPClientTransport(endpoint, {
		requestInit: {
			headers: { Authorization: `Bearer ${credentials.token}` },
		},
	});
	const client = new Client({ name: "task-cli", version: "0.1.0" });
	try {
		await client.connect(transport);
	} catch (error) {
		if (isUnauthorized(error)) {
			throw new CliError(
				"The server rejected the API token. Run `task auth <server-url> <api-token>` with a token from Settings > Tokens.",
			);
		}
		throw new CliError(
			`Could not reach ${endpoint.origin}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return {
		async callTool(name, args) {
			const result = await client.callTool({ name, arguments: args });
			const content = result.content as Array<{ type: string; text?: string }>;
			const text = content.find((item) => item.type === "text")?.text ?? "";
			if (result.isError) throw new CliError(text || `${name} failed.`);
			try {
				return JSON.parse(text);
			} catch {
				return text;
			}
		},
		close: () => transport.close(),
	};
}
