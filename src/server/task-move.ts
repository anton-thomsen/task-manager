import type { SessionMember } from "~/server/auth";
import { db } from "~/server/db";
import { taskWhereFor } from "~/server/task-access";
import type { TaskStatus } from "../../generated/prisma";

export class TaskMoveError extends Error {
	readonly reason: "not-found" | "archived";

	constructor(reason: "not-found" | "archived", message: string) {
		super(message);
		this.reason = reason;
	}
}

/**
 * Move a task the member can see into a status lane, placed before the task
 * with beforeId (or at the end of the lane when beforeId is null). Archived
 * tasks cannot be moved. Throws TaskMoveError when the task is invisible,
 * unknown, or archived.
 */
export async function moveTaskToLane(
	member: SessionMember,
	id: number,
	status: TaskStatus,
	beforeId: number | null,
): Promise<{ id: number; title: string; status: TaskStatus }> {
	return db.$transaction(async (tx) => {
		const task = await tx.task.findFirst({
			where: { id, AND: taskWhereFor(member) },
			select: { title: true, archivedAt: true },
		});
		if (!task) {
			throw new TaskMoveError("not-found", `Task ${id} not found.`);
		}
		if (task.archivedAt) {
			throw new TaskMoveError(
				"archived",
				`Task ${id} is archived and cannot be moved. Restore it in the web app first.`,
			);
		}
		// Reorder within the full organization lane so tasks hidden from this
		// member keep consistent sort positions; visibility only gates which
		// task may be moved.
		const lane = await tx.task.findMany({
			where: {
				organizationId: member.orgId,
				status,
				archivedAt: null,
				id: { not: id },
			},
			orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
			select: { id: true },
		});
		const beforeIndex = beforeId
			? lane.findIndex((item) => item.id === beforeId)
			: -1;
		lane.splice(beforeIndex >= 0 ? beforeIndex : lane.length, 0, { id });
		for (const [index, item] of lane.entries()) {
			await tx.task.update({
				where: { id: item.id },
				data: {
					status: item.id === id ? status : undefined,
					sortOrder: (index + 1) * 1024,
				},
			});
		}
		return { id, title: task.title, status };
	});
}
