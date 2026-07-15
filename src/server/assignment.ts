import type { SessionMember } from "~/server/auth";
import { db } from "~/server/db";

/** Throws unless every id is a user belonging to the caller's organization. */
export async function verifyOrgMembers(
	member: SessionMember,
	userIds: string[],
): Promise<void> {
	if (userIds.length === 0) return;
	const count = await db.member.count({
		where: { organizationId: member.orgId, userId: { in: userIds } },
	});
	if (count !== new Set(userIds).size) {
		throw new Error("Assignees must be members of your organization.");
	}
}

/**
 * Reconcile a task's assignee rows against a target participant set. Existing
 * rows keep their acceptance state; new rows are pending delegations unless
 * the caller assigns themself. A task always keeps at least one participant.
 */
export async function reconcileAssignees(
	member: SessionMember,
	taskId: number,
	targetUserIds: string[],
): Promise<void> {
	const target = [...new Set(targetUserIds)];
	if (target.length === 0) {
		throw new Error("A task needs at least one participant.");
	}
	await verifyOrgMembers(member, target);
	const existing = await db.taskAssignee.findMany({
		where: { taskId },
		select: { userId: true },
	});
	const existingIds = new Set(existing.map(({ userId }) => userId));
	const toAdd = target.filter((userId) => !existingIds.has(userId));
	const toRemove = [...existingIds].filter(
		(userId) => !target.includes(userId),
	);
	await db.$transaction([
		...(toRemove.length > 0
			? [
					db.taskAssignee.deleteMany({
						where: { taskId, userId: { in: toRemove } },
					}),
				]
			: []),
		...toAdd.map((userId) =>
			db.taskAssignee.create({
				data: {
					taskId,
					userId,
					assignedById: member.userId,
					acceptedAt: userId === member.userId ? new Date() : null,
				},
			}),
		),
	]);
}
