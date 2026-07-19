# 02 — Read the world: `task show`, `task members/clients/labels`

**What to build:** A user can run `task show <id>` to read a task's full detail - subtasks (active and completed), work logs with attribution, estimates, participants, client, label, deadline - and `task members`, `task clients`, `task labels` to list the organization directory. All support `--json`.

**Blocked by:** 01 — CLI foundation

**Status:** resolved

- [ ] `task show <id>` renders full task detail using the existing get-task MCP tool; invisible or unknown IDs produce a clear error and non-zero exit
- [ ] `task members`, `task clients`, `task labels` list the org directory via the existing lookup tools
- [ ] All four commands support `--json`
- [ ] e2e coverage at the subprocess seam, including a member being denied detail on a task they cannot see

## Comments

Resolved: `task show <id>` (cli/src/commands/show.ts) renders full detail via get_task - labeled fields, active and completed subtasks with estimates/completers/reference links, work logs with author, hours, estimate, and details. `task members`/`task clients`/`task labels` (cli/src/commands/directory.ts) use the existing lookup tools. All four accept --json; shared table/estimate rendering extracted to cli/src/render.ts. Unknown or cross-org task IDs exit 1 with "Task N not found."; usage errors exit 2. e2e: new self-contained e2e/cli-show.spec.ts at the subprocess seam (show-owner@ org, seeding via the MCP endpoint like the estimate-insights prior art, plus a show-outsider@ denial case); shared helpers extracted to e2e/cli-helpers.ts. Full suite (4 specs), typecheck, and biome all green.
