# MCP toolbox

The task manager exposes a Model Context Protocol server so an AI assistant
(Claude, or any MCP client) can manage tasks on your behalf.

- **Endpoint:** `POST https://<your-app-domain>/api/mcp` (streamable HTTP)
- **Auth:** `Authorization: Bearer <your API token>` - the same per-user token
  used by the quick-add API. Find or regenerate it under **Settings → Tokens**.
  Every action runs as you: your organization, your visibility (members only
  see tasks they created or are assigned to), your attribution on logs and
  completions.

## Connect Claude

```sh
claude mcp add task-manager https://<your-app-domain>/api/mcp \
  --transport http \
  --header "Authorization: Bearer <your API token>"
```

Or in a project `.mcp.json`:

```json
{
	"mcpServers": {
		"task-manager": {
			"type": "http",
			"url": "https://<your-app-domain>/api/mcp",
			"headers": { "Authorization": "Bearer <your API token>" }
		}
	}
}
```

## Tools

| Tool | What it does |
| --- | --- |
| `list_tasks` | List visible tasks, filterable by status, client, label, assignee |
| `get_task` | Full detail: subtasks, work logs, estimates, participants |
| `get_task_report` | Estimate-vs-actual analysis: per-worklog estimates, actuals, variances, and details text |
| `create_task` | Create a task (required-fields contract, see below) |
| `delegate_task` | Assign an existing task to a member, or create-and-delegate in one step |
| `accept_delegation` | Accept a task delegated to you: only your own pending assignment; nothing pending (or already accepted) is an error |
| `move_task_status` | Move a task to another status lane (Inbox, Review, Ongoing, Finished); it lands at the end of the destination lane, archived tasks are rejected |
| `update_task` | Partial edit of title, description, deadline, client, estimate, label; only passed fields change, opt-out literals clear a field, archived tasks are rejected |
| `add_subtask` | Add a subtask with an optional description and reference links (15-minute estimate increments, max 5h) |
| `complete_subtask` | Mark a subtask Finished, attributed to you |
| `log_work` | Record note, hours spent, details, and expected hours |
| `list_members` / `list_clients` / `list_labels` | Org directory lookups |
| `create_client` / `create_label` | Create pickable options (on user confirmation) |

Deleting and archiving are deliberately not exposed - use the web app.

Participant entries returned by `list_tasks` and `get_task` carry an
`accepted` boolean - `false` marks a delegation still waiting on
`accept_delegation`.

## The required-fields contract

`create_task` and `delegate_task` require `deadline`, `client`, `estimate`,
and `label`. None of them accept null. When you did not tell the AI a value,
the tool schema forces it to ask you instead of silently submitting nothing.
Each field has an explicit opt-out the AI may only use when you decline:

| Field | Real value | Explicit opt-out |
| --- | --- | --- |
| `deadline` | ISO date (`2026-07-24`) | `"none"` |
| `client` | Existing client name | `"none"` |
| `estimate` | `{ "min_hours": 4, "max_hours": 6 }` | `"n/a"` |
| `label` | Existing label name | `"no label"` |

Unknown client or label names return the existing options so the AI can ask
you whether to pick one or create it.

`log_work` applies the same idea to `details`: it must contain what actually
happened (that text is what later answers "why did this take longer than
estimated?"), with `"nothing notable"` as the only explicit opt-out.
