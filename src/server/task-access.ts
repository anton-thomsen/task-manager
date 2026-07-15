import type { SessionMember } from "~/server/auth";
import { db } from "~/server/db";
import type { Prisma } from "../../generated/prisma";

/**
 * Role-based task visibility: owners and admins see every task in the
 * organization; members see only tasks they created or are assigned to.
 * Every task read and mutation must go through this where-clause.
 */
export function taskWhereFor(member: SessionMember): Prisma.TaskWhereInput {
	if (member.role === "owner" || member.role === "admin") {
		return { organizationId: member.orgId };
	}
	return {
		organizationId: member.orgId,
		OR: [
			{ createdById: member.userId },
			{ assignees: { some: { userId: member.userId } } },
		],
	};
}

export async function requireTaskAccess(
	member: SessionMember,
	taskId: number,
): Promise<void> {
	const task = await db.task.findFirst({
		where: { id: taskId, AND: taskWhereFor(member) },
		select: { id: true },
	});
	if (!task) throw new Error("Task not found.");
}
