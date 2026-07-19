import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "../generated/prisma/index.js";

const cliEntry = resolve(process.cwd(), "cli/src/index.ts");

export type CliResult = {
	stdout: string;
	stderr: string;
	status: number | null;
};

export function runCli(args: string[], env: Record<string, string>): CliResult {
	const result = spawnSync(process.execPath, [cliEntry, ...args], {
		encoding: "utf8",
		env: { ...process.env, TASK_URL: "", TASK_TOKEN: "", ...env },
	});
	if (result.error) throw result.error;
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		status: result.status,
	};
}

export async function signUp(
	page: Page,
	name: string,
	email: string,
): Promise<void> {
	await page.goto("/signup");
	await page.getByLabel("Name").fill(name);
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill("cli-e2e-local-password");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page).toHaveURL((url) => url.pathname === "/");
}

export async function mintApiToken(page: Page): Promise<string> {
	await page.goto("/settings/tokens");
	const apiSection = page
		.locator("section")
		.filter({ hasText: "Quick-add API token" });
	await apiSection.getByRole("button", { name: "Generate token" }).click();
	await expect(
		apiSection.getByRole("button", { name: "Regenerate token" }),
	).toBeVisible();
	const token = (
		await apiSection
			.locator("code")
			.filter({ hasText: /^[\w-]{40,}$/ })
			.innerText()
	).trim();
	expect(token.length).toBeGreaterThanOrEqual(40);
	return token;
}

export type McpCaller = {
	call: (name: string, args: Record<string, unknown>) => Promise<unknown>;
	close: () => Promise<void>;
};

// Seeding directory rows, subtasks, and work logs goes through the real MCP
// endpoint with the user's token - the same prior art as the estimate
// insights spec. The assertions stay at the CLI subprocess seam.
export async function mcpCaller(
	baseURL: string,
	token: string,
): Promise<McpCaller> {
	const transport = new StreamableHTTPClientTransport(
		new URL("/api/mcp", baseURL),
		{ requestInit: { headers: { Authorization: `Bearer ${token}` } } },
	);
	const client = new Client({ name: "e2e-cli-seed", version: "1.0.0" });
	await client.connect(transport);
	return {
		async call(name, args) {
			const response = await client.callTool({ name, arguments: args });
			const content = response.content as Array<{
				type: string;
				text: string;
			}>;
			expect(response.isError ?? false).toBe(false);
			return JSON.parse(content[0]?.text ?? "null");
		},
		close: () => transport.close(),
	};
}

// The e2e database URL is constructed the same way playwright.config.ts
// builds it for the web server: .env DATABASE_URL, schema task_manager_e2e.
function e2eDatabaseUrl(): string {
	const fromEnvFile = () => {
		const contents = readFileSync(resolve(process.cwd(), ".env"), "utf8");
		const match = contents.match(/^DATABASE_URL\s*=\s*(.+)$/m);
		const value = match?.[1]?.trim();
		if (!value) throw new Error("DATABASE_URL is missing from .env.");
		const quote = value[0];
		return quote && quote === value.at(-1) && (quote === '"' || quote === "'")
			? value.slice(1, -1)
			: value;
	};
	const url = new URL(process.env.E2E_DATABASE_URL ?? fromEnvFile());
	url.searchParams.set("schema", "task_manager_e2e");
	return url.toString();
}

// Without a RESEND_API_KEY the invitation email falls back to a console log,
// so the invitation ID is read straight from the e2e database instead.
export async function findPendingInvitationId(email: string): Promise<string> {
	const prisma = new PrismaClient({ datasourceUrl: e2eDatabaseUrl() });
	try {
		const invitation = await prisma.invitation.findFirst({
			where: {
				email: { equals: email, mode: "insensitive" },
				status: "pending",
			},
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		if (!invitation) throw new Error(`No pending invitation for ${email}.`);
		return invitation.id;
	} finally {
		await prisma.$disconnect();
	}
}

export async function createTask(
	page: Page,
	title: string,
	estimate?: { min: string; max: string },
): Promise<number> {
	await page.goto("/");
	await page.getByRole("button", { name: "Create task" }).click();
	const dialog = page.getByRole("dialog", { name: "Create a task" });
	await dialog.getByLabel("Title").fill(title);
	if (estimate) {
		await dialog.getByLabel("Minimum estimate in hours").fill(estimate.min);
		await dialog.getByLabel("Maximum estimate in hours").fill(estimate.max);
	}
	await dialog.getByRole("button", { name: "Add task" }).click();
	const link = page.getByRole("link", { name: title, exact: true });
	await expect(link).toBeVisible();
	const href = await link.getAttribute("href");
	if (!href) throw new Error("The created task is missing its detail link.");
	return Number(href.slice(href.lastIndexOf("/") + 1));
}
