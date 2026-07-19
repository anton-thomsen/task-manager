import type { SessionMember } from "~/server/auth";
import { scheduleTaskSync } from "~/server/calendar-sync";
import { db } from "~/server/db";
import { taskWhereFor } from "~/server/task-access";
import type { Task, TaskStatus } from "../../generated/prisma";

export class TaskUpdateError extends Error {
	readonly reason: "not-found" | "archived" | "invalid-estimate";

	constructor(
		reason: "not-found" | "archived" | "invalid-estimate",
		message: string,
	) {
		super(message);
		this.reason = reason;
	}
}

/** Fields a partial task update may change; absent fields stay untouched. */
export type TaskFieldChanges = {
	title?: string;
	description?: string | null;
	status?: TaskStatus;
	deadline?: Date | null;
	estimateMinHours?: number | null;
	estimateMaxHours?: number | null;
	clientId?: number | null;
	labelId?: number | null;
};

/**
 * Apply a partial field update to a task the member can see. The estimate
 * range is validated against the values left in place, and a calendar sync
 * is scheduled when the deadline or title changes. Throws TaskUpdateError
 * when the task is invisible or unknown, archived (with rejectArchived), or
 * the effective estimate range inverts.
 */
export async function updateTaskFields(
	member: SessionMember,
	id: number,
	changes: TaskFieldChanges,
	options: { rejectArchived?: boolean } = {},
): Promise<Task> {
	const existing = await db.task.findFirst({
		where: { id, AND: taskWhereFor(member) },
	});
	if (!existing) {
		throw new TaskUpdateError("not-found", `Task ${id} not found.`);
	}
	if (options.rejectArchived && existing.archivedAt) {
		throw new TaskUpdateError(
			"archived",
			`Task ${id} is archived and cannot be edited. Restore it in the web app first.`,
		);
	}
	const effectiveMin =
		changes.estimateMinHours !== undefined
			? changes.estimateMinHours
			: existing.estimateMinHours;
	const effectiveMax =
		changes.estimateMaxHours !== undefined
			? changes.estimateMaxHours
			: existing.estimateMaxHours;
	if (
		effectiveMin !== null &&
		effectiveMax !== null &&
		effectiveMin > effectiveMax
	) {
		throw new TaskUpdateError(
			"invalid-estimate",
			"The minimum estimate cannot exceed the maximum estimate.",
		);
	}
	const updated = await db.task.update({ where: { id }, data: changes });
	const deadlineChanged =
		changes.deadline !== undefined &&
		(changes.deadline?.getTime() ?? null) !==
			(existing.deadline?.getTime() ?? null);
	const titleChanged =
		changes.title !== undefined && changes.title !== existing.title;
	if (deadlineChanged || titleChanged) scheduleTaskSync(id);
	return updated;
}
