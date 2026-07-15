import type { Prisma } from "../../../generated/prisma";

export const taskSummarySelect = {
	id: true,
	title: true,
	status: true,
	deadline: true,
	archivedAt: true,
	estimateMinHours: true,
	estimateMaxHours: true,
	client: { select: { name: true } },
	label: { select: { name: true } },
	assignees: { select: { user: { select: { name: true, email: true } } } },
} satisfies Prisma.TaskSelect;

export const taskDetailSelect = {
	...taskSummarySelect,
	description: true,
	createdAt: true,
	createdBy: { select: { name: true } },
	subtasks: {
		orderBy: [{ status: "asc" }, { sortOrder: "asc" }] as const,
		select: {
			id: true,
			title: true,
			status: true,
			estimatedHours: true,
			completedBy: { select: { name: true } },
		},
	},
	logs: {
		orderBy: { createdAt: "asc" } as const,
		select: {
			id: true,
			note: true,
			details: true,
			hoursSpent: true,
			estimatedHours: true,
			createdAt: true,
			author: { select: { name: true } },
		},
	},
} satisfies Prisma.TaskSelect;

type TaskSummaryRow = Prisma.TaskGetPayload<{
	select: typeof taskSummarySelect;
}>;
type TaskDetailRow = Prisma.TaskGetPayload<{ select: typeof taskDetailSelect }>;

function isoDate(value: Date | null): string | null {
	return value ? value.toISOString().slice(0, 10) : null;
}

export function serializeTaskSummary(task: TaskSummaryRow) {
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		archived: task.archivedAt !== null,
		deadline: isoDate(task.deadline),
		estimate:
			task.estimateMinHours === null && task.estimateMaxHours === null
				? "n/a"
				: {
						min_hours: task.estimateMinHours,
						max_hours: task.estimateMaxHours,
					},
		client: task.client?.name ?? "none",
		label: task.label?.name ?? "no label",
		participants: task.assignees.map(({ user }) => ({
			name: user.name,
			email: user.email,
		})),
	};
}

export function serializeTaskDetail(task: TaskDetailRow) {
	return {
		...serializeTaskSummary(task),
		description: task.description,
		created_at: task.createdAt.toISOString(),
		created_by: task.createdBy?.name ?? null,
		subtasks: task.subtasks.map((subtask) => ({
			id: subtask.id,
			title: subtask.title,
			status: subtask.status,
			estimated_hours: subtask.estimatedHours ?? "n/a",
			completed_by: subtask.completedBy?.name ?? null,
		})),
		work_logs: task.logs.map((log) => ({
			id: log.id,
			note: log.note,
			details: log.details,
			hours_spent: log.hoursSpent,
			estimated_hours: log.estimatedHours ?? "n/a",
			author: log.author?.name ?? null,
			created_at: log.createdAt.toISOString(),
		})),
	};
}
