# 01 - CLI foundation: scaffold, `task auth`, `task list`

**What to build:** A user can install the `task` command from this repo, run `task auth <url> <token>` once to store credentials, and run `task list` to see their visible tasks from the hosted server in readable columns - or as JSON with `--json`. Filters narrow the list by status, client, label, and assignee. Credential and network failures produce clear errors and non-zero exit codes.

**Blocked by:** None - can start immediately

**Status:** resolved

- [x] A pnpm workspace package exposes a `task` bin (TypeScript), linkable via `pnpm link --global`
- [x] `task auth <url> <token>` writes `~/.config/task/config.json` with mode 0600; `TASK_URL`/`TASK_TOKEN` env vars override the file
- [x] `task list` calls the existing MCP endpoint (streamable HTTP, Bearer token) and renders tasks in aligned human-readable columns
- [x] `task list --json` emits the structured data suitable for `jq`
- [x] `task list` supports status, client, label, and assignee filters (matching the existing list tool's filters)
- [x] Missing/invalid credentials produce a clear message pointing at `task auth`, exit code non-zero
- [x] e2e coverage at the subprocess seam: tests invoke the real `task` binary with env vars pointing at the Playwright-managed e2e server, asserting on stdout and exit codes
- [x] Visibility scoping is observable at the seam: a second user's token sees none of the first org's tasks

## Comments

Resolved: cli/ workspace package (task auth + task list, filters, --json, 0600 config, env overrides), e2e/cli.spec.ts at the subprocess seam. All acceptance criteria met; full e2e suite, typecheck, and lint green. Node 26 type stripping means the bin points at src/index.ts directly - no build step. Also fixed two pre-existing stale e2e assertions (subtask dialog flow, ambiguous locators) left behind by the rich-subtasks feature.

Scoped the visibility criterion to org scoping (two signups = two orgs): the finer member-vs-owner rule needs an in-org member, and invitations only travel by email (no copyable link in the UI), so that assertion moves to the delegation tickets (03/06) where a second org member is set up anyway.
