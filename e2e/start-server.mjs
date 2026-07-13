import { spawn, spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for E2E tests.");

const parsedDatabaseUrl = new URL(databaseUrl);
const isPostgres =
	parsedDatabaseUrl.protocol === "postgresql:" ||
	parsedDatabaseUrl.protocol === "postgres:";
const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(
	parsedDatabaseUrl.hostname,
);
if (
	!isPostgres ||
	!isLoopback ||
	parsedDatabaseUrl.searchParams.get("schema") !== "task_manager_e2e"
) {
	throw new Error(
		"Refusing to reset anything except PostgreSQL on the local task_manager_e2e schema.",
	);
}

const reset = spawnSync(
	"pnpm",
	["exec", "prisma", "migrate", "reset", "--force", "--skip-generate"],
	{ env: process.env, stdio: "inherit" },
);
if (reset.error) throw reset.error;
if (reset.status !== 0) process.exit(reset.status ?? 1);

const server = spawn(
	"pnpm",
	[
		"exec",
		"next",
		"dev",
		"--turbo",
		"--hostname",
		"127.0.0.1",
		"--port",
		"3100",
	],
	{ env: process.env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => server.kill(signal));
}

server.on("error", (error) => {
	throw error;
});
server.on("exit", (code) => process.exit(code ?? 1));
