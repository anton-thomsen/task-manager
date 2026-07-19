#!/usr/bin/env node
import { acceptCommand } from "./commands/accept.ts";
import { authCommand } from "./commands/auth.ts";
import { createCommand } from "./commands/create.ts";
import { delegateCommand } from "./commands/delegate.ts";
import {
	clientsCommand,
	labelsCommand,
	membersCommand,
} from "./commands/directory.ts";
import { editCommand } from "./commands/edit.ts";
import { listCommand } from "./commands/list.ts";
import { logCommand } from "./commands/log.ts";
import { moveCommand } from "./commands/move.ts";
import { showCommand } from "./commands/show.ts";
import { subtaskCommand } from "./commands/subtask.ts";
import { CliError } from "./config.ts";

const usage = `task - terminal client for the task manager

Usage:
  task auth <server-url> <api-token>   Verify and store credentials
  task list [options]                  List your visible tasks
  task show <id>                       Show a task's full detail
  task create [options]                Create a task (delegate it too with --to)
  task move <id> <status>              Move a task to another status lane
  task edit <id> [options]             Edit a task's fields
  task delegate <id> --to <member>     Assign an existing task to a teammate
  task accept <id>                     Accept a delegation pending on you
  task subtask add <id> [options]      Break a task down with a subtask
  task subtask complete <id>           Mark a subtask Finished, attributed to you
  task log <id> [options]              Log work done on a task
  task members                         List your organization's members
  task clients                         List your organization's clients
  task labels                          List your organization's labels

List options:
  --status <status>     Filter by status (Inbox, Review, Ongoing, Finished)
  --client <name>       Filter by client name
  --label <name>        Filter by label name
  --assignee <member>   Filter by participant (member name or email)
  --archived            Include archived tasks

Create options (--title, --deadline, --client, --estimate, and --label are
required; skipping a field takes its explicit opt-out value):
  --title <title>            Short task title
  --deadline <date|none>     ISO date (YYYY-MM-DD), or "none" for no deadline
  --client <name|none>       Existing client name, or "none" for no client
  --estimate <min-max|n/a>   Decimal hours like "2-4" or "3", or "n/a"
  --label <name|"no label">  Existing label name, or "no label"
  --description <text>       Optional longer description
  --status <status>          Starting lane (defaults to Inbox)
  --to <member>              Create and delegate to a member (name or email)

Edit options (pass at least one; only the fields you pass change):
  --title <title>            New task title
  --description <text>       New description (an empty string clears it)
  --deadline <date|none>     ISO date (YYYY-MM-DD), or "none" to clear
  --client <name|none>       Existing client name, or "none" to clear
  --estimate <min-max|n/a>   Decimal hours like "2-4" or "3", or "n/a" to clear
  --label <name|"no label">  Existing label name, or "no label" to clear

Subtask add options (--title is required):
  --title <title>            Short subtask title
  --estimate <hours|n/a>     Hours in 15-minute steps (max 5); omitted means "n/a"
  --description <text>       Optional context and requirements
  --link <url>               Reference link (repeat for more, up to ten)

Log options (--note, --hours, and --details are required):
  --note <summary>           Short summary of the work
  --hours <n>                Hours actually spent
  --details <text>           What actually happened; the literal "nothing
                             notable" is the only explicit opt-out
  --expected <hours|n/a>     What this work was expected to take

Image attachments on work logs are web-only; the CLI has no flags for them.

Every read command accepts --json to emit JSON instead of text.

Credentials are stored in ~/.config/task/config.json; the TASK_URL and
TASK_TOKEN environment variables override the stored values.`;

async function main(): Promise<void> {
	const [command, ...rest] = process.argv.slice(2);
	switch (command) {
		case "auth":
			await authCommand(rest);
			return;
		case "list":
			await listCommand(rest);
			return;
		case "show":
			await showCommand(rest);
			return;
		case "create":
			await createCommand(rest);
			return;
		case "move":
			await moveCommand(rest);
			return;
		case "edit":
			await editCommand(rest);
			return;
		case "delegate":
			await delegateCommand(rest);
			return;
		case "accept":
			await acceptCommand(rest);
			return;
		case "subtask":
			await subtaskCommand(rest);
			return;
		case "log":
			await logCommand(rest);
			return;
		case "members":
			await membersCommand(rest);
			return;
		case "clients":
			await clientsCommand(rest);
			return;
		case "labels":
			await labelsCommand(rest);
			return;
		case undefined:
		case "help":
		case "--help":
		case "-h":
			console.log(usage);
			return;
		default:
			throw new CliError(`Unknown command "${command}".\n\n${usage}`, 2);
	}
}

main().catch((error: unknown) => {
	if (error instanceof CliError) {
		console.error(error.message);
		process.exit(error.exitCode);
	}
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
