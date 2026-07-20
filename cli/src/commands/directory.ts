import { parseArgs } from "node:util";
import { withMcpSession } from "../command.ts";
import { CliError } from "../config.ts";
import { printHuman, renderTable } from "../render.ts";

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

async function lookup<T>(name: string): Promise<T> {
	return withMcpSession((session) => session.callTool<T>(name, {}));
}

export async function membersCommand(argv: string[]): Promise<void> {
	const json = parseJsonFlag(argv, "members");
	const members =
		await lookup<
			Array<{
				name: string;
				email: string;
				role: string;
			}>
		>("list_members");
	if (json) {
		console.log(JSON.stringify(members, null, 2));
		return;
	}
	if (members.length === 0) {
		printHuman("No members.");
		return;
	}
	printHuman(
		renderTable(
			members.map((member) => [member.name, member.email, member.role]),
			["NAME", "EMAIL", "ROLE"],
		),
	);
}

export async function clientsCommand(argv: string[]): Promise<void> {
	const json = parseJsonFlag(argv, "clients");
	const clients = await lookup<string[]>("list_clients");
	if (json) {
		console.log(JSON.stringify(clients, null, 2));
		return;
	}
	if (clients.length === 0) {
		printHuman("No clients.");
		return;
	}
	printHuman(clients.join("\n"));
}

export async function labelsCommand(argv: string[]): Promise<void> {
	const json = parseJsonFlag(argv, "labels");
	const labels =
		await lookup<
			Array<{
				name: string;
				color: string;
			}>
		>("list_labels");
	if (json) {
		console.log(JSON.stringify(labels, null, 2));
		return;
	}
	if (labels.length === 0) {
		printHuman("No labels.");
		return;
	}
	printHuman(
		renderTable(
			labels.map((label) => [label.name, label.color]),
			["NAME", "COLOR"],
		),
	);
}
