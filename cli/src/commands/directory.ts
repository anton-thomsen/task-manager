import { parseArgs } from "node:util";
import { CliError, loadCredentials } from "../config.ts";
import { connect } from "../mcp.ts";
import { renderTable } from "../render.ts";

function parseJsonFlag(argv: string[], command: string): boolean {
	try {
		const parsed = parseArgs({
			args: argv,
			allowPositionals: false,
			options: { json: { type: "boolean", default: false } },
		});
		return parsed.values.json === true;
	} catch (error) {
		throw new CliError(
			`${error instanceof Error ? error.message : String(error)}\nUsage: task ${command} [--json]`,
			2,
		);
	}
}

async function lookup(name: string): Promise<unknown> {
	const session = await connect(loadCredentials());
	try {
		return await session.callTool(name, {});
	} finally {
		await session.close();
	}
}

export async function membersCommand(argv: string[]): Promise<void> {
	const json = parseJsonFlag(argv, "members");
	const members = (await lookup("list_members")) as Array<{
		name: string;
		email: string;
		role: string;
	}>;
	if (json) {
		console.log(JSON.stringify(members, null, 2));
		return;
	}
	if (members.length === 0) {
		console.log("No members.");
		return;
	}
	console.log(
		renderTable(
			members.map((member) => [member.name, member.email, member.role]),
			["NAME", "EMAIL", "ROLE"],
		),
	);
}

export async function clientsCommand(argv: string[]): Promise<void> {
	const json = parseJsonFlag(argv, "clients");
	const clients = (await lookup("list_clients")) as string[];
	if (json) {
		console.log(JSON.stringify(clients, null, 2));
		return;
	}
	if (clients.length === 0) {
		console.log("No clients.");
		return;
	}
	console.log(clients.join("\n"));
}

export async function labelsCommand(argv: string[]): Promise<void> {
	const json = parseJsonFlag(argv, "labels");
	const labels = (await lookup("list_labels")) as Array<{
		name: string;
		color: string;
	}>;
	if (json) {
		console.log(JSON.stringify(labels, null, 2));
		return;
	}
	if (labels.length === 0) {
		console.log("No labels.");
		return;
	}
	console.log(
		renderTable(
			labels.map((label) => [label.name, label.color]),
			["NAME", "COLOR"],
		),
	);
}
