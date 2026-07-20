# Spec: `task` - a terminal client for the task manager

**Status:** ready-for-agent

## Problem Statement

Anton lives in the terminal. Managing his day's work currently requires switching to the web app for every small action - checking what's on the board, moving a task to Ongoing, logging an hour of work, accepting a delegation. The friction of leaving the terminal means the board goes stale during deep work.

## Solution

A command-line client named `task` that talks to the existing hosted task manager. It authenticates with the user's personal API token and covers the daily-driver verbs: listing and viewing tasks, creating them, moving them between status lanes, editing their fields, managing subtasks, logging work, delegating, and accepting delegations. The server remains the single source of truth; the web app remains the place for administration and destructive actions.

## User Stories

1. As a terminal-dwelling user, I want a one-time `task auth` command that stores my server URL and API token, so that every later command just works.
2. As a user, I want `TASK_URL`/`TASK_TOKEN` environment variables to override my stored config, so that scripts and CI can authenticate without touching my config file.
3. As a user, I want `task list` to show my visible tasks in aligned, readable columns, so that I can see my board at a glance.
4. As a user, I want to filter `task list` by status, client, label, and assignee, so that I can narrow to what matters right now.
5. As a member, I want `task list` to show only tasks I created or participate in, so that my terminal view matches my web board exactly.
6. As an owner or admin, I want `task list` to show every task in the organization, so that my terminal view matches my role.
7. As a user, I want `task show <id>` to display a task's full detail - subtasks, work logs, estimates, participants - so that I never need the web app just to read.
8. As a user, I want `task create` with flags for title, deadline, client, estimate, and label, so that capturing new work takes one line.
9. As a user, I want explicit opt-out values (`none`, `n/a`, `no label`) when creating a task, so that skipping a field is a deliberate choice, never an accident.
10. As a user, I want an unknown client or label name on create to fail with the list of existing options, so that I can pick or create one deliberately.
11. As a user, I want `task move <id> <status>` to move a task between Inbox, Review, Ongoing, and Finished, so that keeping the board current is a keystroke, not a context switch.
12. As a user, I want `task edit <id>` to update a task's title, description, deadline, estimate, client, and label, so that corrections don't require the web app.
13. As a user, I want `task subtask add <id>` with an optional description, estimate, and reference links, so that I can break work down from the terminal.
14. As a user, I want `task subtask complete` to mark a subtask Finished attributed to me, so that progress is recorded as it happens.
15. As a user, I want `task log <id>` with a summary, hours, and details (or the explicit `nothing notable` opt-out), plus optional expected hours, so that logging work takes seconds without losing the required work context.
16. As a user, I want `task delegate <id> <member>` to assign a task to a teammate, so that handing work off doesn't interrupt my flow.
17. As a delegatee, I want `task accept <id>` to accept a pending delegation, so that a "From ..." task doesn't force me into the web app every day.
18. As a user, I want `task members`, `task clients`, and `task labels` to list my organization's directory, so that I can discover valid values for other commands.
19. As a script author, I want `--json` on every read command, so that I can pipe output into `jq` and other tools.
20. As a user, I want clear, human-readable error messages with non-zero exit codes when the server rejects a command or the network is down, so that failures are obvious and scriptable.
21. As a user, I want the CLI to tell me when my token is invalid or missing and point me at `task auth`, so that credential problems are self-explanatory.
22. As an AI assistant user, I want the new server capabilities (status move, task update, accept delegation) available through the same MCP toolbox, so that my assistant can keep the board current too.
23. As a security-conscious user, I want my config file written with owner-only permissions, so that my API token isn't readable by other local users.

## Implementation Decisions

- The CLI is a **client of the existing hosted server** - not a standalone local task manager. It is always online, and every data command goes to the server. There is no local cache, offline queue, or sync.
- The CLI **speaks MCP**: it is an MCP client of the existing streamable-HTTP MCP endpoint, authenticating with the same per-user Bearer token minted under Settings → Tokens. No new API surface is added.
- The MCP toolbox gains three tools it currently lacks: **move task status**, **update task**, and **accept delegation**. Accepted consequence: these become available to AI assistants as well. Archiving and deleting remain excluded from the toolbox for all programmatic clients - they stay web-only.
- Scope is the focused daily-driver subset: list/view, create, move status, edit fields, subtasks, work logs, delegate, accept delegation, and directory lookups. Org administration, invitations, token management, image attachments, Google Calendar, and archive search stay in the web app.
- The CLI lives in **this repo as a pnpm workspace package**, written in TypeScript and reusing the shared task status and estimate contracts. It exposes a `bin` named `task`, installed locally via `pnpm link --global`; Node.js 26 runs `src/index.ts` directly with no build step.
- Interaction shape is **plain subcommands** - scriptable and pipe-friendly. No TUI in this spec (a future `task board` could reuse the same client layer).
- Credentials live in `~/.config/task/config.json` by default, or under `$XDG_CONFIG_HOME/task/` when that variable is set. `task auth` writes the server URL and token with mode 0600; environment variables override the file.
- Tasks are referenced by their **real integer IDs** (the schema uses autoincrement integers) - no short-ID or aliasing scheme.
- Output is human-readable by default with a `--json` flag on read commands; the MCP tools already return structured data, so the JSON path is thin.
- The create/delegate commands honor the existing **required-fields contract**: deadline, client, estimate, and label are required, each with its documented explicit opt-out value.
- Logging work requires details, with `nothing notable` as the only explicit opt-out.
- Editing requires at least one field flag, and status moves place the task at the end of the destination lane, matching the web board.

## Testing Decisions

- Good tests exercise **external behavior at the highest seam** - never internal functions of the CLI or the tool implementations.
- **Existing seam, reused:** the new MCP tools are tested exactly like the existing estimate-insights e2e test - a real MCP client speaking streamable HTTP with a Bearer token against the Playwright-managed e2e server and its isolated Postgres schema.
- **One new seam:** the CLI is tested **as a subprocess** - e2e tests invoke the actual `task` binary with environment variables pointing at the e2e server, asserting on `--json` stdout, human-readable output, and exit codes. Argument parsing and formatting are covered through this same boundary; the CLI gets no unit-level seams.
- Prior art: the existing Playwright e2e suite (server boot, database reset, MCP-over-HTTP client setup).

## Out of Scope

- Offline mode, local caching, or sync of any kind.
- A TUI / interactive board view.
- Archiving, deleting, or restoring tasks from the CLI (or from any programmatic client).
- Organization administration: invitations, member roles, token minting/rotation.
- Image attachments on work logs.
- Google Calendar integration.
- OS keychain storage for the token.
- Short-ID/aliasing schemes for task references.

## Further Notes

- The decision that the MCP toolbox is the single programmatic surface (rather than a dedicated CLI API) is ADR-worthy: hard to reverse once tools are published to AI clients, surprising to future readers, and a genuine trade-off. Consider capturing it as the repo's first ADR.
- The `task` command name may collide with the Taskfile runner (`go-task`); accepted, aliasable later.
