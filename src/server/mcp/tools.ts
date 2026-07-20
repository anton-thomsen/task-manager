import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { taskStatusContract } from "~/lib/task-contracts";
import {
	int4IdSchema,
	referenceLinksSchema,
	taskDescriptionSchema,
} from "~/lib/validation";
import type { SessionMember } from "~/server/auth";
import { scheduleAssigneeSync, scheduleTaskSync } from "~/server/calendar-sync";
import { db } from "~/server/db";
import {
	resolveClientId,
	resolveLabelId,
	resolveOrgMember,
	ToolInputError,
} from "~/server/mcp/resolve";
import {
	type CreateTaskInput,
	createTaskShape,
	detailsContract,
	subtaskEstimateContract,
} from "~/server/mcp/schemas";
import {
	serializeTaskDetail,
	serializeTaskReport,
	serializeTaskSummary,
	taskDetailSelect,
	taskReportSelect,
	taskSummarySelect,
} from "~/server/mcp/serialize";
import { acceptDelegation, TaskAcceptError } from "~/server/task-accept";
import { taskWhereFor } from "~/server/task-access";
import { createTaskAtLaneEnd } from "~/server/task-creation";
import { moveTaskToLane, TaskMoveError } from "~/server/task-move";
import {
	type TaskFieldChanges,
	TaskUpdateError,
	updateTaskFields,
} from "~/server/task-update";

export const serverInstructions = `Task manager for the user's organization. All actions run as the user who owns the API token and are scoped to their organization and visibility (members only see tasks they created or are assigned to).

Field contract: create_task and delegate_task REQUIRE deadline, client, estimate, and label. There is no null - when the user did not specify one of these, ASK the user, then pass their answer or the explicit opt-out literal ("none", "n/a", "no label") when they decline. Never invent values and never pass an opt-out the user did not choose.

Deleting and archiving tasks is deliberately not available through this toolbox - direct the user to the web app for that.`;

function isSessionMember(value: unknown): value is SessionMember {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.userId === "string" &&
		typeof candidate.userName === "string" &&
		typeof candidate.orgId === "string" &&
		(candidate.role === "owner" ||
			candidate.role === "admin" ||
			candidate.role === "member")
	);
}

type ToolExtra = { authInfo?: { extra?: Record<string, unknown> } };

function memberFromExtra(extra: ToolExtra): SessionMember {
	const member = extra.authInfo?.extra?.member;
	if (!isSessionMember(member)) throw new ToolInputError("Unauthorized.");
	return member;
}

function jsonResult(data: unknown): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): CallToolResult {
	return { content: [{ type: "text", text: message }], isError: true };
}

async function run(
	handler: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
	try {
		return await handler();
	} catch (error) {
		if (error instanceof ToolInputError) return errorResult(error.message);
		if (error instanceof z.ZodError) {
			return errorResult(error.issues[0]?.message ?? "Invalid input.");
		}
		console.error("[mcp] tool failed:", error);
		return errorResult("The operation failed unexpectedly.");
	}
}

async function requireVisibleTask(
	member: SessionMember,
	taskId: number,
): Promise<void> {
	const task = await db.task.findFirst({
		where: { id: taskId, AND: taskWhereFor(member) },
		select: { id: true },
	});
	if (!task) throw new ToolInputError(`Task ${taskId} not found.`);
}

async function createTaskFromContract(
	member: SessionMember,
	input: CreateTaskInput,
	assigneeIds: string[] = [],
) {
	const clientId = await resolveClientId(member.orgId, input.client);
	const labelId = await resolveLabelId(member.orgId, input.label);
	const task = await createTaskAtLaneEnd(
		{ orgId: member.orgId, userId: member.userId },
		{
			title: input.title,
			description: input.description || null,
			status: input.status,
			deadline: input.deadline === "none" ? null : input.deadline,
			estimateMinHours:
				input.estimate === "n/a" ? null : input.estimate.min_hours,
			estimateMaxHours:
				input.estimate === "n/a" ? null : input.estimate.max_hours,
			clientId,
			labelId,
		},
		assigneeIds,
	);
	if (task.deadline) scheduleTaskSync(task.id);
	return task;
}

export function registerTools(server: McpServer): void {
	server.registerTool(
		"list_tasks",
		{
			title: "List tasks",
			description:
				"List tasks visible to you, optionally filtered. Archived tasks are excluded unless include_archived is true.",
			inputSchema: {
				status: taskStatusContract.optional(),
				client: z.string().optional().describe("Filter by client name."),
				label: z.string().optional().describe("Filter by label name."),
				assignee: z
					.string()
					.optional()
					.describe("Filter by participant (member name or email)."),
				include_archived: z.boolean().default(false),
			},
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const assignee = args.assignee
					? await resolveOrgMember(member, args.assignee)
					: null;
				const tasks = await db.task.findMany({
					where: {
						AND: [taskWhereFor(member)],
						...(args.include_archived ? {} : { archivedAt: null }),
						...(args.status ? { status: args.status } : {}),
						...(args.client
							? {
									client: {
										name: { equals: args.client, mode: "insensitive" },
									},
								}
							: {}),
						...(args.label
							? {
									label: { name: { equals: args.label, mode: "insensitive" } },
								}
							: {}),
						...(assignee
							? { assignees: { some: { userId: assignee.userId } } }
							: {}),
					},
					orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
					select: taskSummarySelect,
				});
				return jsonResult(tasks.map(serializeTaskSummary));
			}),
	);

	server.registerTool(
		"get_task",
		{
			title: "Get task detail",
			description:
				"Full task detail: description, participants, subtasks with estimates and who completed them, and work logs with hours, estimates, details, and authors.",
			inputSchema: { task_id: int4IdSchema },
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const task = await db.task.findFirst({
					where: { id: args.task_id, AND: taskWhereFor(member) },
					select: taskDetailSelect,
				});
				if (!task) return errorResult(`Task ${args.task_id} not found.`);
				return jsonResult(serializeTaskDetail(task));
			}),
	);

	server.registerTool(
		"get_task_report",
		{
			title: "Get task time report",
			description:
				'The tool for "why did this take longer (or shorter) than estimated" analysis. Returns the task estimate range, every work log with its own estimate, actual hours, variance, author, and full details text, every subtask with estimate and completer, and totals. To explain a variance, READ the details field of each work log - that is where the reasons live. Estimates shown as "n/a" were never set.',
			inputSchema: { task_id: int4IdSchema },
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const task = await db.task.findFirst({
					where: { id: args.task_id, AND: taskWhereFor(member) },
					select: taskReportSelect,
				});
				if (!task) return errorResult(`Task ${args.task_id} not found.`);
				return jsonResult(serializeTaskReport(task));
			}),
	);

	server.registerTool(
		"create_task",
		{
			title: "Create task",
			description:
				'Create a task for yourself. deadline, client, estimate, and label are REQUIRED: if the user did not specify one, you MUST ask them. Pass "none" / "n/a" / "no label" only when the user explicitly declines that field.',
			inputSchema: createTaskShape,
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const task = await createTaskFromContract(member, args);
				return jsonResult({
					id: task.id,
					title: task.title,
					status: task.status,
					message: "Task created.",
				});
			}),
	);

	server.registerTool(
		"delegate_task",
		{
			title: "Delegate task",
			description:
				"Assign a task to another organization member. Provide task_id for an existing task, OR the create_task fields (title, deadline, client, estimate, label - same required-field contract: ask the user for missing values, opt-out literals only on explicit decline) to create and delegate in one step.",
			inputSchema: {
				assignee: z
					.string()
					.describe("Member to delegate to, by name or email."),
				task_id: int4IdSchema.optional().describe("Existing task to delegate."),
				title: createTaskShape.title.optional(),
				description: createTaskShape.description,
				deadline: createTaskShape.deadline.optional(),
				client: createTaskShape.client.optional(),
				estimate: createTaskShape.estimate.optional(),
				label: createTaskShape.label.optional(),
			},
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const target = await resolveOrgMember(member, args.assignee);
				let taskId: number;
				let title: string;
				if (args.task_id !== undefined) {
					await requireVisibleTask(member, args.task_id);
					const existing = await db.task.findUniqueOrThrow({
						where: { id: args.task_id },
						select: { title: true },
					});
					taskId = args.task_id;
					title = existing.title;
					await db.taskAssignee.upsert({
						where: { taskId_userId: { taskId, userId: target.userId } },
						create: {
							taskId,
							userId: target.userId,
							assignedById: member.userId,
						},
						update: {},
					});
					scheduleAssigneeSync(taskId, [target.userId], []);
				} else {
					if (
						args.title === undefined ||
						args.deadline === undefined ||
						args.client === undefined ||
						args.estimate === undefined ||
						args.label === undefined
					) {
						return errorResult(
							"To create and delegate in one step, title, deadline, client, estimate, and label are all required (ask the user for any you are missing). Alternatively pass task_id for an existing task.",
						);
					}
					const task = await createTaskFromContract(
						member,
						{
							title: args.title,
							description: args.description,
							deadline: args.deadline,
							client: args.client,
							estimate: args.estimate,
							label: args.label,
							status: "Inbox",
						},
						[target.userId],
					);
					taskId = task.id;
					title = task.title;
				}
				return jsonResult({
					id: taskId,
					title,
					delegated_to: target.name,
					message: `Task delegated to ${target.name}. It appears on their board.`,
				});
			}),
	);

	server.registerTool(
		"accept_delegation",
		{
			title: "Accept delegation",
			description:
				'Accept a task that was delegated to you: your pending assignment is marked accepted and the "From ..." marker clears from your board. Only your own pending assignment can be accepted.',
			inputSchema: { task_id: int4IdSchema },
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				try {
					const task = await acceptDelegation(member, args.task_id);
					return jsonResult({
						id: task.id,
						title: task.title,
						message: "Delegation accepted. The task is now on your plate.",
					});
				} catch (error) {
					if (error instanceof TaskAcceptError) {
						return errorResult(error.message);
					}
					throw error;
				}
			}),
	);

	server.registerTool(
		"move_task_status",
		{
			title: "Move task status",
			description:
				"Move a task you can see to another status lane (Inbox, Review, Ongoing, or Finished). The task lands at the end of the destination lane. Archived tasks cannot be moved - direct the user to the web app to restore them first.",
			inputSchema: {
				task_id: int4IdSchema,
				status: taskStatusContract.describe("Destination status lane."),
			},
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				try {
					const task = await moveTaskToLane(
						member,
						args.task_id,
						args.status,
						null,
					);
					return jsonResult({
						id: task.id,
						title: task.title,
						status: task.status,
						message: `Task moved to ${task.status}.`,
					});
				} catch (error) {
					if (error instanceof TaskMoveError) return errorResult(error.message);
					throw error;
				}
			}),
	);

	server.registerTool(
		"update_task",
		{
			title: "Update task",
			description:
				'Update fields of a task you can see: title, description, deadline, client, estimate, label. Only the fields you pass change. Clear a field with its explicit opt-out ("none" for deadline or client, "n/a" for estimate, "no label" for label) only when the user asks for that. Archived tasks cannot be edited.',
			inputSchema: {
				task_id: int4IdSchema,
				title: createTaskShape.title.optional(),
				description: createTaskShape.description.describe(
					"New description. Pass an empty string to clear it.",
				),
				deadline: createTaskShape.deadline.optional(),
				client: createTaskShape.client.optional(),
				estimate: createTaskShape.estimate.optional(),
				label: createTaskShape.label.optional(),
			},
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const changes: TaskFieldChanges = {};
				if (args.title !== undefined) changes.title = args.title;
				if (args.description !== undefined) {
					changes.description = args.description || null;
				}
				if (args.deadline !== undefined) {
					changes.deadline = args.deadline === "none" ? null : args.deadline;
				}
				if (args.client !== undefined) {
					changes.clientId = await resolveClientId(member.orgId, args.client);
				}
				if (args.estimate !== undefined) {
					changes.estimateMinHours =
						args.estimate === "n/a" ? null : args.estimate.min_hours;
					changes.estimateMaxHours =
						args.estimate === "n/a" ? null : args.estimate.max_hours;
				}
				if (args.label !== undefined) {
					changes.labelId = await resolveLabelId(member.orgId, args.label);
				}
				if (Object.keys(changes).length === 0) {
					return errorResult(
						"Pass at least one field to update: title, description, deadline, client, estimate, or label.",
					);
				}
				try {
					const task = await updateTaskFields(member, args.task_id, changes, {
						rejectArchived: true,
					});
					const updatedFields = (
						[
							"title",
							"description",
							"deadline",
							"client",
							"estimate",
							"label",
						] as const
					).filter((name) => args[name] !== undefined);
					return jsonResult({
						id: task.id,
						title: task.title,
						updated_fields: updatedFields,
						message: "Task updated.",
					});
				} catch (error) {
					if (error instanceof TaskUpdateError) {
						return errorResult(error.message);
					}
					throw error;
				}
			}),
	);

	server.registerTool(
		"add_subtask",
		{
			title: "Add subtask",
			description:
				"Add a detailed subtask to a task you can see. Estimates use 15-minute increments (max 5 hours).",
			inputSchema: {
				task_id: int4IdSchema,
				title: z.string().trim().min(1).max(200),
				description: taskDescriptionSchema.describe(
					"Optional context and requirements for the subtask.",
				),
				reference_links: referenceLinksSchema.default([]),
				estimated_hours: subtaskEstimateContract,
			},
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				await requireVisibleTask(member, args.task_id);
				const last = await db.subtask.findFirst({
					where: { taskId: args.task_id, status: "Inbox" },
					orderBy: { sortOrder: "desc" },
					select: { sortOrder: true },
				});
				const subtask = await db.subtask.create({
					data: {
						taskId: args.task_id,
						title: args.title,
						description: args.description || null,
						referenceLinks: args.reference_links,
						estimatedHours:
							args.estimated_hours === "n/a" ? null : args.estimated_hours,
						sortOrder: (last?.sortOrder ?? 0) + 1024,
					},
				});
				return jsonResult({
					id: subtask.id,
					title: subtask.title,
					message: "Subtask added.",
				});
			}),
	);

	server.registerTool(
		"complete_subtask",
		{
			title: "Complete subtask",
			description:
				"Mark a subtask as Finished. Completion is attributed to you. Consider logging the work with log_work afterwards.",
			inputSchema: { subtask_id: int4IdSchema },
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const subtask = await db.subtask.findFirst({
					where: { id: args.subtask_id, task: taskWhereFor(member) },
					select: { id: true, taskId: true, estimatedHours: true },
				});
				if (!subtask) {
					return errorResult(`Subtask ${args.subtask_id} not found.`);
				}
				await db.subtask.update({
					where: { id: subtask.id },
					data: { status: "Finished", completedById: member.userId },
				});
				return jsonResult({
					id: subtask.id,
					task_id: subtask.taskId,
					estimated_hours: subtask.estimatedHours ?? "n/a",
					message:
						"Subtask completed. Offer to log the actual time spent with log_work (estimated_hours is prefilled from the subtask when you pass it).",
				});
			}),
	);

	server.registerTool(
		"log_work",
		{
			title: "Log work",
			description:
				'Record work done on a task: a short note, the hours actually spent, and details of what happened (required for estimate-vs-actual analysis; pass "nothing notable" only when the user explicitly has nothing to add). estimated_hours records what this work was expected to take.',
			inputSchema: {
				task_id: int4IdSchema,
				note: z.string().trim().min(1).max(240),
				hours_spent: z.number().positive().max(100_000),
				details: detailsContract,
				estimated_hours: z
					.union([z.literal("n/a"), z.number().positive().max(100_000)])
					.default("n/a"),
				subtask_id: int4IdSchema
					.optional()
					.describe("Subtask this work log belongs to, when applicable."),
			},
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				await requireVisibleTask(member, args.task_id);
				if (args.subtask_id !== undefined) {
					const subtask = await db.subtask.findFirst({
						where: { id: args.subtask_id, taskId: args.task_id },
						select: { id: true },
					});
					if (!subtask) {
						return errorResult(
							`Subtask ${args.subtask_id} does not belong to task ${args.task_id}.`,
						);
					}
				}
				const log = await db.taskLog.create({
					data: {
						taskId: args.task_id,
						note: args.note,
						details:
							args.details.toLowerCase() === "nothing notable"
								? null
								: args.details,
						hoursSpent: args.hours_spent,
						estimatedHours:
							args.estimated_hours === "n/a" ? null : args.estimated_hours,
						subtaskId: args.subtask_id,
						authorId: member.userId,
					},
				});
				return jsonResult({ id: log.id, message: "Work logged." });
			}),
	);

	server.registerTool(
		"list_members",
		{
			title: "List organization members",
			description:
				"List the members of your organization (for delegation and filtering).",
			inputSchema: {},
		},
		(_args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const members = await db.member.findMany({
					where: { organizationId: member.orgId },
					orderBy: { createdAt: "asc" },
					select: {
						role: true,
						user: { select: { name: true, email: true } },
					},
				});
				return jsonResult(
					members.map((row) => ({
						name: row.user.name,
						email: row.user.email,
						role: row.role,
					})),
				);
			}),
	);

	server.registerTool(
		"list_clients",
		{
			title: "List clients",
			description: "List the organization's clients.",
			inputSchema: {},
		},
		(_args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const clients = await db.client.findMany({
					where: { organizationId: member.orgId },
					orderBy: { name: "asc" },
					select: { name: true },
				});
				return jsonResult(clients.map((client) => client.name));
			}),
	);

	server.registerTool(
		"list_labels",
		{
			title: "List labels",
			description: "List the organization's labels.",
			inputSchema: {},
		},
		(_args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const labels = await db.label.findMany({
					where: { organizationId: member.orgId },
					orderBy: { name: "asc" },
					select: { name: true, color: true },
				});
				return jsonResult(labels);
			}),
	);

	server.registerTool(
		"create_client",
		{
			title: "Create client",
			description:
				"Create a client (or return the existing one with the same name). Only do this when the user confirms the client should be created.",
			inputSchema: { name: z.string().trim().min(1).max(50) },
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const client = await db.client.upsert({
					where: {
						organizationId_name: {
							organizationId: member.orgId,
							name: args.name,
						},
					},
					create: { organizationId: member.orgId, name: args.name },
					update: {},
				});
				return jsonResult({ name: client.name, message: "Client ready." });
			}),
	);

	server.registerTool(
		"create_label",
		{
			title: "Create label",
			description:
				"Create a label with a hex color (or update the color of the existing label with the same name). Only do this when the user confirms.",
			inputSchema: {
				name: z.string().trim().min(1).max(50),
				color: z
					.string()
					.regex(/^#[0-9a-fA-F]{6}$/)
					.describe("Hex color like #047857."),
			},
		},
		(args, extra) =>
			run(async () => {
				const member = memberFromExtra(extra);
				const label = await db.label.upsert({
					where: {
						organizationId_name: {
							organizationId: member.orgId,
							name: args.name,
						},
					},
					create: {
						organizationId: member.orgId,
						name: args.name,
						color: args.color,
					},
					update: { color: args.color },
				});
				return jsonResult({ name: label.name, message: "Label ready." });
			}),
	);
}
