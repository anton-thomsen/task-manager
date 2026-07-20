import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Credentials = { url: string; token: string };

export class CliError extends Error {
	readonly exitCode: number;

	constructor(message: string, exitCode = 1) {
		super(message);
		this.exitCode = exitCode;
	}
}

function configDir(): string {
	const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(base, "task");
}

export function configPath(): string {
	return join(configDir(), "config.json");
}

function readStoredCredentials(): Partial<Credentials> {
	let raw: string;
	try {
		raw = readFileSync(configPath(), "utf8");
	} catch {
		return {};
	}
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			url: typeof parsed.url === "string" ? parsed.url : undefined,
			token: typeof parsed.token === "string" ? parsed.token : undefined,
		};
	} catch {
		throw new CliError(
			`The config file at ${configPath()} is not valid JSON. Re-run \`task auth <url> <token>\` to rewrite it.`,
		);
	}
}

export function loadCredentials(): Credentials {
	const envUrl = process.env.TASK_URL;
	const envToken = process.env.TASK_TOKEN;
	const hasEnvUrl = typeof envUrl === "string" && envUrl.length > 0;
	const hasEnvToken = typeof envToken === "string" && envToken.length > 0;
	if (
		hasEnvUrl !== hasEnvToken ||
		(!hasEnvUrl && (envUrl !== undefined || envToken !== undefined))
	) {
		throw new CliError(
			"TASK_URL and TASK_TOKEN must both be set to non-empty values; partial environment credentials are not allowed.",
		);
	}
	if (hasEnvUrl && hasEnvToken) return { url: envUrl, token: envToken };

	const stored = readStoredCredentials();
	const { url, token } = stored;
	if (!url || !token) {
		throw new CliError(
			"No credentials found. Run `task auth <server-url> <api-token>` (mint a token in the web app under Settings > Tokens), or set TASK_URL and TASK_TOKEN.",
		);
	}
	return { url, token };
}

export function saveCredentials(credentials: Credentials): void {
	mkdirSync(configDir(), { mode: 0o700, recursive: true });
	writeFileSync(configPath(), `${JSON.stringify(credentials, null, "\t")}\n`, {
		mode: 0o600,
	});
	// writeFileSync only applies the mode on creation; tighten pre-existing files.
	chmodSync(configPath(), 0o600);
}
