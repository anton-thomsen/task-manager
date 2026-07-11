"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { taskStatuses } from "~/lib/tasks";
import { int4IdSchema, optionalPositiveInt } from "~/lib/validation";
import { db } from "~/server/db";

const createSubtaskSchema = z.object({
	taskId: int4IdSchema,
	title: z.string().trim().min(1).max(200),
	estimatedMinutes: optionalPositiveInt(300),
});

export async function createSubtask(formData: FormData): Promise<void> {
	const parsed = createSubtaskSchema.parse({
		taskId: formData.get("taskId")?.toString(),
		title: formData.get("title")?.toString(),
		estimatedMinutes: formData.get("estimatedMinutes")?.toString(),
	});
	const task = await db.task.findUnique({
		where: { id: parsed.taskId },
		select: { id: true },
	});
	if (!task) throw new Error("Task not found.");

	await db.subtask.create({ data: parsed });
	revalidatePath(`/tasks/${parsed.taskId}`);
}

export async function updateSubtaskStatus(
	idInput: number,
	statusInput: string,
): Promise<void> {
	const id = int4IdSchema.parse(idInput);
	const status = z.enum(taskStatuses).parse(statusInput);
	const subtask = await db.subtask.findUnique({
		where: { id },
		select: { taskId: true },
	});
	if (!subtask) throw new Error("Subtask not found.");

	await db.subtask.update({ where: { id }, data: { status } });
	revalidatePath(`/tasks/${subtask.taskId}`);
	revalidatePath("/");
}

export async function deleteSubtask(idInput: number): Promise<void> {
	const id = int4IdSchema.parse(idInput);
	const subtask = await db.subtask.findUnique({
		where: { id },
		select: { taskId: true },
	});
	if (!subtask) throw new Error("Subtask not found.");

	await db.subtask.delete({ where: { id } });
	revalidatePath(`/tasks/${subtask.taskId}`);
	revalidatePath("/");
}
