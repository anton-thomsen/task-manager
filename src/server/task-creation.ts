import { db } from "~/server/db";
import type { Prisma, TaskStatus } from "../../generated/prisma";

type TaskCreationData = Omit<
	Prisma.TaskUncheckedCreateInput,
	"sortOrder" | "status" | "organizationId" | "createdById"
> & {
	status?: TaskStatus;
};

type TaskCreator = {
	orgId: string;
	userId: string;
};

export async function createTaskAtLaneEnd(
	creator: TaskCreator,
	data: TaskCreationData,
	assigneeIds: string[] = [],
) {
	const status = data.status ?? "Inbox";
	const lastTask = await db.task.findFirst({
		where: { organizationId: creator.orgId, status, archivedAt: null },
		orderBy: { sortOrder: "desc" },
		select: { sortOrder: true },
	});
	// Delegating to others only does not assign the creator; they keep
	// visibility through createdById. With no explicit assignees the creator
	// is the sole participant.
	const participantIds =
		assigneeIds.length > 0 ? [...new Set(assigneeIds)] : [creator.userId];
	return db.task.create({
		data: {
			...data,
			organizationId: creator.orgId,
			createdById: creator.userId,
			status,
			sortOrder: (lastTask?.sortOrder ?? 0) + 1024,
			assignees: {
				create: participantIds.map((userId) => ({
					userId,
					assignedById: creator.userId,
					acceptedAt: userId === creator.userId ? new Date() : null,
				})),
			},
		},
	});
}
