import { randomUUID } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export type Credentials = { url: string; token: string };

export class CliError extends Error {
	readonly exitCode: number;

	constructor(message: string, exitCode = 1) {
		super(message);
		this.exitCode = exitCode;
	}
}

function configDir(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME;
	if (xdgConfigHome) {
		if (!isAbsolute(xdgConfigHome)) {
			throw new CliError("XDG_CONFIG_HOME must be an absolute path when set.");
		}
		return join(xdgConfigHome, "task");
	}
	return join(homedir(), ".config", "task");
}

export function configPath(): string {
	return join(configDir(), "config.json");
}

function removeTemporary(path: string): void {
	try {
		unlinkSync(path);
	} catch {
		return;
	}
}

function readStoredCredentials(): Partial<Credentials> {
	let raw: string;
	try {
		raw = readFileSync(configPath(), "utf8");
	} catch (error) {
		const code =
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			typeof error.code === "string"
				? error.code
				: undefined;
		if (code === "ENOENT") return {};
		throw new CliError(
			`Could not read the config file at ${configPath()}: ${error instanceof Error ? error.message : String(error)}`,
		);
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
	const directory = configDir();
	const destination = configPath();
	const temporary = join(
		directory,
		`.config.${process.pid}.${randomUUID()}.tmp`,
	);
	try {
		mkdirSync(directory, { mode: 0o700, recursive: true });
		chmodSync(directory, 0o700);
		writeFileSync(temporary, `${JSON.stringify(credentials, null, "\t")}\n`, {
			mode: 0o600,
			flag: "wx",
		});
		renameSync(temporary, destination);
	} catch (error) {
		removeTemporary(temporary);
		throw new CliError(
			`Could not save the config file at ${destination}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
