import { withMcpSession } from "../command.ts";
import { CliError, configPath, saveCredentials } from "../config.ts";
import { printHuman } from "../render.ts";

export async function authCommand(argv: string[]): Promise<void> {
	const [url, token, ...rest] = argv;
	if (!url || !token || rest.length > 0) {
		throw new CliError("Usage: task auth <server-url> <api-token>", 2);
	}
	try {
		new URL(url);
	} catch {
		throw new CliError(`"${url}" is not a valid URL.`, 2);
	}
	// Verify before persisting so a typo never poisons the config file.
	await withMcpSession(async () => undefined, { url, token });
	saveCredentials({ url, token });
	printHuman(`Credentials verified and saved to ${configPath()}.`);
}
