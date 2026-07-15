import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { registerTools, serverInstructions } from "~/server/mcp/tools";
import { memberFromToken } from "~/server/token-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createMcpHandler(
	registerTools,
	{
		serverInfo: { name: "task-manager", version: "1.0.0" },
		instructions: serverInstructions,
	},
	{ basePath: "/api", disableSse: true, maxDuration: 60 },
);

async function verifyToken(
	_request: Request,
	bearerToken?: string,
): Promise<AuthInfo | undefined> {
	if (!bearerToken) return undefined;
	const member = await memberFromToken(bearerToken, "apiToken");
	if (!member) return undefined;
	return {
		token: bearerToken,
		clientId: member.userId,
		scopes: ["tasks"],
		extra: { member },
	};
}

const authedHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
