# 03 - Capture work: `task create`, `task delegate`

**What to build:** A user can create a task in one line with flags for title, deadline, client, estimate, and label - and delegate a task (existing or create-and-delegate) to a teammate. The required-fields contract is honored: each required field takes either a real value or its documented explicit opt-out (`none`, `n/a`, `no label`); omitting a required flag is a usage error, not a silent default. Unknown client or label names fail with the list of existing options.

**Blocked by:** 01 - CLI foundation

**Status:** resolved

- [x] `task create` maps flags onto the existing create-task MCP tool, enforcing the required-fields contract at the CLI boundary (clear usage error when a required flag is missing)
- [x] Explicit opt-outs work: `--deadline none`, `--client none`, `--estimate n/a`, `--label "no label"`
- [x] Unknown client/label values surface the server's existing-options response as a readable error
- [x] `task delegate <id> <member>` assigns an existing task via the existing delegate tool; create-and-delegate works in one step
- [x] e2e coverage at the subprocess seam: created task appears in `task list`; delegated task appears on the delegatee's board as pending

## Comments

Resolved: `task create` (cli/src/commands/create.ts) maps flags onto create_task; the required-fields contract is enforced at the CLI boundary - omitting --title/--deadline/--client/--estimate/--label exits 2 naming the flag and its opt-out literal ("none", "n/a", "no label"), never silently defaulted. --estimate parses "min-max" or a single number into {min_hours, max_hours}, or "n/a"; optional --description and --status supported. Unknown client/label surface the server's existing-options message (exit 1). `task delegate <id> --to <member>` (cli/src/commands/delegate.ts) assigns via delegate_task; create-and-delegate mirrors the tool's schema as `task create ... --to <member>` (--status rejected there since delegated tasks start in Inbox). e2e: new e2e/cli-create.spec.ts covers create with real values (verified via `task list --json`), all opt-outs, missing-flag exit 2, unknown client/label exit 1 with options, and the REAL invitation flow: owner invites member-invitee@task-manager.local from Settings > Members, the invitation ID is read from the e2e database via the generated Prisma client (helper in e2e/cli-helpers.ts), a second browser context signs up and accepts at /accept-invitation/<id>, and the member's own token sees delegated and create-and-delegated tasks in `task list --json`. Shared mcpCaller extracted to e2e/cli-helpers.ts (cli-show.spec.ts now imports it). Full suite 6/6 passed, typecheck and biome green. Note: pre-existing delegation semantics - a self-created task keeps the creator as participant, so after delegation both appear; create-and-delegate assigns only the delegatee.
