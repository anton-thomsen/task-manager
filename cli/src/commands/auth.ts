import { CliError, configPath, saveCredentials } from "../config.ts";
import { connect } from "../mcp.ts";

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
	const session = await connect({ url, token });
	await session.close();
	saveCredentials({ url, token });
	console.log(`Credentials verified and saved to ${configPath()}.`);
}
