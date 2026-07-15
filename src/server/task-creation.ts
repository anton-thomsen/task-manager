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
) {
	const status = data.status ?? "Inbox";
	const lastTask = await db.task.findFirst({
		where: { organizationId: creator.orgId, status, archivedAt: null },
		orderBy: { sortOrder: "desc" },
		select: { sortOrder: true },
	});
	return db.task.create({
		data: {
			...data,
			organizationId: creator.orgId,
			createdById: creator.userId,
			status,
			sortOrder: (lastTask?.sortOrder ?? 0) + 1024,
			assignees: {
				create: [{ userId: creator.userId, assignedById: creator.userId }],
			},
		},
	});
}
