import { db } from "~/server/db";
import type { Prisma, TaskStatus } from "../../generated/prisma";

type TaskCreationData = Omit<
	Prisma.TaskUncheckedCreateInput,
	"sortOrder" | "status"
> & {
	status?: TaskStatus;
};

export async function createTaskAtLaneEnd(data: TaskCreationData) {
	const status = data.status ?? "Inbox";
	const lastTask = await db.task.findFirst({
		where: { status, archivedAt: null },
		orderBy: { sortOrder: "desc" },
		select: { sortOrder: true },
	});
	return db.task.create({
		data: {
			...data,
			status,
			sortOrder: (lastTask?.sortOrder ?? 0) + 1024,
		},
	});
}
