import type { SessionMember } from "~/server/auth";
import { db } from "~/server/db";
import { taskWhereFor } from "~/server/task-access";

export class TaskAcceptError extends Error {
	readonly reason: "not-found" | "not-delegated" | "already-accepted";

	constructor(
		reason: "not-found" | "not-delegated" | "already-accepted",
		message: string,
	) {
		super(message);
		this.reason = reason;
	}
}

/**
 * Accept the member's own pending delegation on a task (the web board's
 * Accept button and the accept_delegation MCP tool both land here). Only the
 * caller's assignment can be accepted. Throws TaskAcceptError when the task
 * is invisible or unknown, when the caller has no assignment on it, or when
 * their assignment is already accepted.
 */
export async function acceptDelegation(
	member: SessionMember,
	taskId: number,
): Promise<{ id: number; title: string }> {
	const task = await db.task.findFirst({
		where: { id: taskId, AND: taskWhereFor(member) },
		select: {
			title: true,
			assignees: {
				where: { userId: member.userId },
				select: { id: true, acceptedAt: true },
			},
		},
	});
	if (!task) {
		throw new TaskAcceptError("not-found", `Task ${taskId} not found.`);
	}
	const assignment = task.assignees[0];
	if (!assignment) {
		throw new TaskAcceptError(
			"not-delegated",
			`Task ${taskId} is not delegated to you - there is nothing to accept.`,
		);
	}
	if (assignment.acceptedAt !== null) {
		throw new TaskAcceptError(
			"already-accepted",
			`Task ${taskId} is already accepted.`,
		);
	}
	const updated = await db.taskAssignee.updateMany({
		where: { id: assignment.id, acceptedAt: null },
		data: { acceptedAt: new Date() },
	});
	if (updated.count !== 1) {
		throw new TaskAcceptError(
			"already-accepted",
			`Task ${taskId} is already accepted.`,
		);
	}
	return { id: taskId, title: task.title };
}
