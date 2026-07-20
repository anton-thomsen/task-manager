import type { SerializedEstimate } from "~/lib/task-contracts";
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
	assignees: {
		select: {
			acceptedAt: true,
			user: { select: { name: true, email: true } },
		},
	},
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
			description: true,
			referenceLinks: true,
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

export const taskReportSelect = {
	id: true,
	title: true,
	status: true,
	deadline: true,
	archivedAt: true,
	estimateMinHours: true,
	estimateMaxHours: true,
	client: { select: { name: true } },
	subtasks: {
		orderBy: [{ status: "asc" }, { sortOrder: "asc" }] as const,
		select: {
			title: true,
			description: true,
			referenceLinks: true,
			status: true,
			estimatedHours: true,
			completedBy: { select: { name: true } },
		},
	},
	logs: {
		orderBy: { createdAt: "asc" } as const,
		select: {
			note: true,
			details: true,
			hoursSpent: true,
			estimatedHours: true,
			createdAt: true,
			author: { select: { name: true } },
			subtask: { select: { title: true } },
		},
	},
} satisfies Prisma.TaskSelect;

type TaskSummaryRow = Prisma.TaskGetPayload<{
	select: typeof taskSummarySelect;
}>;
type TaskReportRow = Prisma.TaskGetPayload<{ select: typeof taskReportSelect }>;
type TaskDetailRow = Prisma.TaskGetPayload<{ select: typeof taskDetailSelect }>;

function isoDate(value: Date | null): string | null {
	return value ? value.toISOString().slice(0, 10) : null;
}

function serializeEstimate(
	minHours: number | null,
	maxHours: number | null,
): SerializedEstimate {
	return minHours === null && maxHours === null
		? "n/a"
		: { min_hours: minHours, max_hours: maxHours };
}

export function serializeTaskSummary(task: TaskSummaryRow) {
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		archived: task.archivedAt !== null,
		deadline: isoDate(task.deadline),
		estimate: serializeEstimate(task.estimateMinHours, task.estimateMaxHours),
		client: task.client?.name ?? "none",
		label: task.label?.name ?? "no label",
		participants: task.assignees.map(({ acceptedAt, user }) => ({
			name: user.name,
			email: user.email,
			accepted: acceptedAt !== null,
		})),
	};
}

export function serializeTaskReport(task: TaskReportRow) {
	const totalLogged = task.logs.reduce(
		(total, log) => total + (log.hoursSpent ?? 0),
		0,
	);
	const totalLogEstimates = task.logs.reduce(
		(total, log) => total + (log.estimatedHours ?? 0),
		0,
	);
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		archived: task.archivedAt !== null,
		deadline: isoDate(task.deadline),
		client: task.client?.name ?? "none",
		task_estimate: serializeEstimate(
			task.estimateMinHours,
			task.estimateMaxHours,
		),
		totals: {
			total_hours_logged: totalLogged,
			total_worklog_estimates:
				totalLogEstimates > 0 ? totalLogEstimates : "n/a",
			variance_vs_max_estimate:
				task.estimateMaxHours !== null
					? Number((totalLogged - task.estimateMaxHours).toFixed(2))
					: "n/a",
		},
		subtasks: task.subtasks.map((subtask) => ({
			title: subtask.title,
			description: subtask.description,
			reference_links: subtask.referenceLinks,
			status: subtask.status,
			estimated_hours: subtask.estimatedHours ?? "n/a",
			completed_by: subtask.completedBy?.name ?? null,
		})),
		work_logs: task.logs.map((log) => ({
			note: log.note,
			details: log.details,
			estimated_hours: log.estimatedHours ?? "n/a",
			hours_spent: log.hoursSpent,
			variance_hours:
				log.estimatedHours !== null && log.hoursSpent !== null
					? Number((log.hoursSpent - log.estimatedHours).toFixed(2))
					: "n/a",
			author: log.author?.name ?? null,
			from_subtask: log.subtask?.title ?? null,
			created_at: log.createdAt.toISOString(),
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
			description: subtask.description,
			reference_links: subtask.referenceLinks,
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
