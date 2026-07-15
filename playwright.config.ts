import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2ePort = 3100;
const baseURL = `http://127.0.0.1:${e2ePort}`;

function databaseUrlFromEnvFile(): string {
	const contents = readFileSync(resolve(process.cwd(), ".env"), "utf8");
	const match = contents.match(/^DATABASE_URL\s*=\s*(.+)$/m);
	if (!match) throw new Error("DATABASE_URL is missing from .env.");
	const value = match[1]?.trim();
	if (!value) throw new Error("DATABASE_URL is empty in .env.");
	const quote = value[0];
	return quote && quote === value.at(-1) && (quote === '"' || quote === "'")
		? value.slice(1, -1)
		: value;
}

function e2eDatabaseUrl(): string {
	const url = new URL(process.env.E2E_DATABASE_URL ?? databaseUrlFromEnvFile());
	const isPostgres =
		url.protocol === "postgresql:" || url.protocol === "postgres:";
	const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
	if (!isPostgres || !isLoopback) {
		throw new Error(
			"E2E database resets are allowed only for PostgreSQL on localhost.",
		);
	}
	url.searchParams.set("schema", "task_manager_e2e");
	return url.toString();
}

export default defineConfig({
	fullyParallel: false,
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	reporter: process.env.CI ? "github" : "line",
	retries: 0,
	testDir: "./e2e",
	use: {
		baseURL,
		contextOptions: { reducedMotion: "reduce" },
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		video: "retain-on-failure",
	},
	webServer: {
		command: "node e2e/start-server.mjs",
		env: {
			AUTH_ALLOW_SIGNUP: "true",
			BETTER_AUTH_SECRET: "task-manager-e2e-auth-secret-is-local-only",
			BETTER_AUTH_URL: baseURL,
			DATABASE_URL: e2eDatabaseUrl(),
		},
		reuseExistingServer: false,
		timeout: 120_000,
		url: `${baseURL}/api/health`,
	},
	workers: 1,
});
