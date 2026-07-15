"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { taskStatuses } from "~/lib/tasks";
import { int4IdSchema, optionalPositiveNumber } from "~/lib/validation";
import { requireMember, type SessionMember } from "~/server/auth";
import { db } from "~/server/db";
import { requireTaskAccess, taskWhereFor } from "~/server/task-access";

const createSubtaskSchema = z.object({
	taskId: int4IdSchema,
	title: z.string().trim().min(1).max(200),
	estimatedHours: optionalPositiveNumber(5).refine(
		(value) => value === undefined || Number.isInteger(value * 4),
		"Estimate must use 15-minute increments.",
	),
});

async function requireSubtaskAccess(
	member: SessionMember,
	subtaskId: number,
): Promise<{ id: number; taskId: number }> {
	const subtask = await db.subtask.findFirst({
		where: { id: subtaskId, task: taskWhereFor(member) },
		select: { id: true, taskId: true },
	});
	if (!subtask) throw new Error("Subtask not found.");
	return subtask;
}

export async function createSubtask(formData: FormData): Promise<void> {
	const member = await requireMember();
	const parsed = createSubtaskSchema.parse({
		taskId: formData.get("taskId")?.toString(),
		title: formData.get("title")?.toString(),
		estimatedHours: formData.get("estimatedHours")?.toString(),
	});
	await requireTaskAccess(member, parsed.taskId);
	const lastSubtask = await db.subtask.findFirst({
		where: { taskId: parsed.taskId, status: "Inbox" },
		orderBy: { sortOrder: "desc" },
		select: { sortOrder: true },
	});

	await db.subtask.create({
		data: { ...parsed, sortOrder: (lastSubtask?.sortOrder ?? 0) + 1024 },
	});
	revalidatePath(`/tasks/${parsed.taskId}`);
}

const moveSubtaskSchema = z.object({
	id: int4IdSchema,
	status: z.enum(taskStatuses),
	beforeId: int4IdSchema.nullable(),
});

export async function moveSubtask(
	idInput: number,
	statusInput: string,
	beforeIdInput: number | null,
): Promise<void> {
	const member = await requireMember();
	const { id, status, beforeId } = moveSubtaskSchema.parse({
		id: idInput,
		status: statusInput,
		beforeId: beforeIdInput,
	});
	await requireSubtaskAccess(member, id);
	const taskId = await db.$transaction(async (tx) => {
		const subtask = await tx.subtask.findUnique({
			where: { id },
			select: { taskId: true, status: true },
		});
		if (!subtask) throw new Error("Subtask not found.");
		const lane = await tx.subtask.findMany({
			where: { taskId: subtask.taskId, status, id: { not: id } },
			orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
			select: { id: true },
		});
		const beforeIndex = beforeId
			? lane.findIndex((item) => item.id === beforeId)
			: -1;
		lane.splice(beforeIndex >= 0 ? beforeIndex : lane.length, 0, { id });
		for (const [index, item] of lane.entries()) {
			await tx.subtask.update({
				where: { id: item.id },
				data: {
					status: item.id === id ? status : undefined,
					...(item.id === id && status !== subtask.status
						? { completedById: status === "Finished" ? member.userId : null }
						: {}),
					sortOrder: (index + 1) * 1024,
				},
			});
		}
		return subtask.taskId;
	});
	revalidatePath(`/tasks/${taskId}`);
	revalidatePath("/");
}

export async function updateSubtaskStatus(
	idInput: number,
	statusInput: string,
): Promise<void> {
	const member = await requireMember();
	const id = int4IdSchema.parse(idInput);
	const status = z.enum(taskStatuses).parse(statusInput);
	const subtask = await requireSubtaskAccess(member, id);

	await db.subtask.update({
		where: { id },
		data: {
			status,
			completedById: status === "Finished" ? member.userId : null,
		},
	});
	revalidatePath(`/tasks/${subtask.taskId}`);
	revalidatePath("/");
}

export async function deleteSubtask(idInput: number): Promise<void> {
	const member = await requireMember();
	const id = int4IdSchema.parse(idInput);
	const subtask = await requireSubtaskAccess(member, id);

	await db.subtask.delete({ where: { id } });
	revalidatePath(`/tasks/${subtask.taskId}`);
	revalidatePath("/");
}
