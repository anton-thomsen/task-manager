"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { int4IdSchema, optionalPositiveInt } from "~/lib/validation";
import { db } from "~/server/db";

const logSchema = z.object({
	taskId: int4IdSchema,
	note: z.string().trim().min(1).max(2000),
	minutesSpent: optionalPositiveInt(1440),
});

export async function addLog(formData: FormData): Promise<void> {
	const parsed = logSchema.parse({
		taskId: formData.get("taskId")?.toString(),
		note: formData.get("note")?.toString(),
		minutesSpent: formData.get("minutesSpent")?.toString(),
	});
	const task = await db.task.findUnique({
		where: { id: parsed.taskId },
		select: { id: true },
	});
	if (!task) throw new Error("Task not found.");

	await db.taskLog.create({ data: parsed });
	revalidatePath(`/tasks/${parsed.taskId}`);
}
