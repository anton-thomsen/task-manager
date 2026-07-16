"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { taskStatuses } from "~/lib/tasks";
import {
	type ActionResult,
	actionError,
	int4IdSchema,
	optionalPositiveNumber,
	referenceLinksSchema,
	taskDescriptionSchema,
	taskTitleSchema,
} from "~/lib/validation";
import { requireMember, type SessionMember } from "~/server/auth";
import { db } from "~/server/db";
import { requireTaskAccess, taskWhereFor } from "~/server/task-access";

const createSubtaskSchema = z.object({
	taskId: int4IdSchema,
	title: taskTitleSchema,
	description: taskDescriptionSchema,
	referenceLinks: referenceLinksSchema,
	status: z.enum(taskStatuses).default("Inbox"),
	estimatedHours: optionalPositiveNumber(5).refine(
		(value) => value === undefined || Number.isInteger(value * 4),
		"Estimate must use 15-minute increments.",
	),
});

const updateSubtaskSchema = createSubtaskSchema.omit({ taskId: true }).extend({
	id: int4IdSchema,
});

async function requireSubtaskAccess(
	member: SessionMember,
	subtaskId: number,
): Promise<{
	id: number;
	taskId: number;
	status: (typeof taskStatuses)[number];
}> {
	const subtask = await db.subtask.findFirst({
		where: { id: subtaskId, task: taskWhereFor(member) },
		select: { id: true, taskId: true, status: true },
	});
	if (!subtask) throw new Error("Subtask not found.");
	return subtask;
}

function referenceLinksInput(formData: FormData): string[] {
	return formData
		.getAll("referenceLinks")
		.map((value) => value.toString().trim())
		.filter(Boolean);
}

function subtaskInput(formData: FormData) {
	return {
		title: formData.get("title")?.toString(),
		description: formData.get("description")?.toString(),
		referenceLinks: referenceLinksInput(formData),
		status: formData.get("status")?.toString(),
		estimatedHours: formData.get("estimatedHours")?.toString(),
	};
}

function nullableText(value: string | undefined): string | null {
	return value && value.length > 0 ? value : null;
}

export async function createSubtask(formData: FormData): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const parsed = createSubtaskSchema.parse({
			...subtaskInput(formData),
			taskId: formData.get("taskId")?.toString(),
		});
		await requireTaskAccess(member, parsed.taskId);
		const lastSubtask = await db.subtask.findFirst({
			where: { taskId: parsed.taskId, status: parsed.status },
			orderBy: { sortOrder: "desc" },
			select: { sortOrder: true },
		});

		await db.subtask.create({
			data: {
				...parsed,
				description: nullableText(parsed.description),
				completedById: parsed.status === "Finished" ? member.userId : null,
				sortOrder: (lastSubtask?.sortOrder ?? 0) + 1024,
			},
		});
		revalidatePath(`/tasks/${parsed.taskId}`);
		revalidatePath("/");
		return { ok: true };
	} catch (error) {
		return actionError(error, "The subtask could not be created.");
	}
}

export async function updateSubtask(formData: FormData): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const parsed = updateSubtaskSchema.parse({
			...subtaskInput(formData),
			id: formData.get("id")?.toString(),
		});
		const subtask = await requireSubtaskAccess(member, parsed.id);
		await db.subtask.update({
			where: { id: subtask.id },
			data: {
				title: parsed.title,
				description: nullableText(parsed.description),
				referenceLinks: parsed.referenceLinks,
				status: parsed.status,
				estimatedHours: parsed.estimatedHours ?? null,
				...(parsed.status !== subtask.status
					? {
							completedById:
								parsed.status === "Finished" ? member.userId : null,
						}
					: {}),
			},
		});
		revalidatePath(`/tasks/${subtask.taskId}`);
		revalidatePath("/");
		return { ok: true };
	} catch (error) {
		return actionError(error, "The subtask could not be updated.");
	}
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
