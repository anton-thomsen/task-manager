import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CliError, type Credentials } from "./config.ts";
import { sanitizeSingleLine } from "./render.ts";

export type McpSession = {
	callTool: <T>(name: string, args: Record<string, unknown>) => Promise<T>;
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
	const loopbackHosts = new Set(["127.0.0.1", "[::1]", "localhost"]);
	if (
		endpoint.protocol !== "https:" &&
		!(endpoint.protocol === "http:" && loopbackHosts.has(endpoint.hostname))
	) {
		throw new CliError(
			`Refusing to send an API token to insecure server ${endpoint.origin}. Use HTTPS; HTTP is allowed only for 127.0.0.1, ::1, or localhost.`,
		);
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
		async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
			const result = await client.callTool({ name, arguments: args });
			const content = result.content as Array<{ type: string; text?: string }>;
			const text = content.find((item) => item.type === "text")?.text ?? "";
			if (result.isError) {
				throw new CliError(sanitizeSingleLine(text) || `${name} failed.`);
			}
			try {
				return JSON.parse(text) as T;
			} catch {
				return text as T;
			}
		},
		close: () => transport.close(),
	};
}
