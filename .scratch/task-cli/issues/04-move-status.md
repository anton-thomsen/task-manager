# 04 — Keep the board moving: `task move` (new MCP tool + CLI)

**What to build:** A user can run `task move <id> <status>` to move a task between Inbox, Review, Ongoing, and Finished. This requires a new MCP tool for status moves (the toolbox currently has none), which also becomes available to AI assistants - an accepted consequence per the spec. Archive remains excluded.

**Blocked by:** 01 — CLI foundation

**Status:** resolved

- [ ] A new status-move MCP tool exists, scoped by the caller's visibility (a member cannot move a task they cannot see), rejecting archived tasks and invalid statuses
- [ ] The new tool is tested at the existing MCP-over-HTTP e2e seam (real MCP client, Bearer token, e2e server), following the estimate-insights prior art
- [ ] `task move <id> <status>` accepts the four status names case-insensitively and confirms the move in output
- [ ] e2e coverage at the subprocess seam: a moved task shows its new status in `task list`
- [ ] MCP.md documents the new tool

## Comments

Resolved: new `move_task_status` MCP tool (src/server/mcp/tools.ts) with input { task_id: int4IdSchema, status: enum(taskStatuses) }, scoped by taskWhereFor visibility, rejecting archived tasks with "Task N is archived and cannot be moved. Restore it in the web app first." and unknown/invisible IDs with "Task N not found."; returns { id, title, status, message }. The web board's lane-move logic was extracted from the moveTask server action into a shared module src/server/task-move.ts (moveTaskToLane + TaskMoveError, same transaction and org-wide lane reorder, beforeId null = end of lane); both the server action and the MCP tool now call it, so web drag/drop and MCP moves share one implementation - web behavior unchanged (actionError still maps any failure to "The task could not be moved."). CLI: `task move <id> <status>` (cli/src/commands/move.ts) reuses canonicalStatus from list.ts for case-insensitive status names, confirms with "Task N moved to Ongoing."; usage errors (bad status, missing args, non-integer id) exit 2, server errors exit 1. Wired into dispatch and usage in cli/src/index.ts. MCP.md Tools table gained one style-matched row; the archiving/deleting exclusion wording is untouched. e2e: new self-contained e2e/cli-move.spec.ts (move-owner@, move-cli-owner@, move-outsider@) - test 1 at the MCP-over-HTTP seam (raw MCP client per estimate-insights prior art: listTools contains the tool, happy-path move + list_tasks verification, archived rejection with the task archived via the board's "Archive task" button since archiving is web-only, unknown-ID error), test 2 at the subprocess seam (`task move <id> ongoing` then `task list --status Ongoing --json` shows the new status; bad status and missing arg exit 2; a second-org user moving the owner's task exits 1 with "Task N not found."). Full suite 8/8 passed (1.1m), pnpm typecheck and pnpm check green.
