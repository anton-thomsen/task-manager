"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { taskStatuses } from "~/lib/tasks";
import {
	type ActionResult,
	actionError,
	int4IdSchema,
	optionalPositiveInt,
} from "~/lib/validation";
import { db } from "~/server/db";

const optionalDate = z.preprocess(
	(value) =>
		value === "" || value === null || value === undefined ? undefined : value,
	z.coerce.date().optional(),
);

const taskFields = {
	title: z.string().trim().min(1, "A title is required.").max(200),
	description: z.string().trim().max(2000).optional(),
	status: z.enum(taskStatuses),
	deadline: optionalDate,
	estimateMinMinutes: optionalPositiveInt(300),
	estimateMaxMinutes: optionalPositiveInt(300),
	clientId: optionalPositiveInt(2_147_483_647),
	labelId: optionalPositiveInt(2_147_483_647),
};

const createTaskSchema = z.object({
	...taskFields,
	status: taskFields.status.default("Inbox"),
});

const updateTaskSchema = z.object({
	id: int4IdSchema,
	title: taskFields.title.optional(),
	description: taskFields.description,
	status: taskFields.status.optional(),
	deadline: taskFields.deadline,
	estimateMinMinutes: taskFields.estimateMinMinutes,
	estimateMaxMinutes: taskFields.estimateMaxMinutes,
	clientId: taskFields.clientId,
	labelId: taskFields.labelId,
});

function field(formData: FormData, name: string): string | undefined {
	if (!formData.has(name)) return undefined;
	return formData.get(name)?.toString() ?? "";
}

function taskInput(formData: FormData) {
	return {
		title: field(formData, "title"),
		description: field(formData, "description"),
		status: field(formData, "status"),
		deadline: field(formData, "deadline"),
		estimateMinMinutes: field(formData, "estimateMinMinutes"),
		estimateMaxMinutes: field(formData, "estimateMaxMinutes"),
		clientId: field(formData, "clientId"),
		labelId: field(formData, "labelId"),
	};
}

function nullableText(value: string | undefined): string | null {
	return value && value.length > 0 ? value : null;
}

async function verifyRelations(
	clientId: number | undefined,
	labelId: number | undefined,
): Promise<void> {
	const [client, label] = await Promise.all([
		clientId
			? db.client.findUnique({ where: { id: clientId }, select: { id: true } })
			: null,
		labelId
			? db.label.findUnique({ where: { id: labelId }, select: { id: true } })
			: null,
	]);
	if (clientId && !client) throw new Error("Client not found.");
	if (labelId && !label) throw new Error("Label not found.");
}

function estimatesAreValid(min: number | null, max: number | null): boolean {
	return min === null || max === null || min <= max;
}

export async function createTask(formData: FormData): Promise<ActionResult> {
	try {
		const parsed = createTaskSchema.parse(taskInput(formData));
		const min = parsed.estimateMinMinutes ?? null;
		const max = parsed.estimateMaxMinutes ?? null;
		if (!estimatesAreValid(min, max)) {
			return {
				ok: false,
				error: "The minimum estimate cannot exceed the maximum estimate.",
			};
		}
		await verifyRelations(parsed.clientId, parsed.labelId);
		const lastTask = await db.task.findFirst({
			where: { status: parsed.status, archivedAt: null },
			orderBy: { sortOrder: "desc" },
			select: { sortOrder: true },
		});
		await db.task.create({
			data: {
				...parsed,
				description: nullableText(parsed.description),
				sortOrder: (lastTask?.sortOrder ?? 0) + 1024,
			},
		});
		revalidatePath("/");
		revalidatePath("/archived");
		return { ok: true };
	} catch (error) {
		return actionError(error, "The task could not be created.");
	}
}

const moveTaskSchema = z.object({
	id: int4IdSchema,
	status: z.enum(taskStatuses),
	beforeId: int4IdSchema.nullable(),
});

export async function moveTask(
	idInput: number,
	statusInput: string,
	beforeIdInput: number | null,
): Promise<ActionResult> {
	try {
		const { id, status, beforeId } = moveTaskSchema.parse({
			id: idInput,
			status: statusInput,
			beforeId: beforeIdInput,
		});
		await db.$transaction(async (tx) => {
			const task = await tx.task.findUnique({
				where: { id },
				select: { archivedAt: true },
			});
			if (!task || task.archivedAt) throw new Error("Task not found.");
			const lane = await tx.task.findMany({
				where: { status, archivedAt: null, id: { not: id } },
				orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
				select: { id: true },
			});
			const beforeIndex = beforeId
				? lane.findIndex((item) => item.id === beforeId)
				: -1;
			lane.splice(beforeIndex >= 0 ? beforeIndex : lane.length, 0, { id });
			for (const [index, item] of lane.entries()) {
				await tx.task.update({
					where: { id: item.id },
					data: {
						status: item.id === id ? status : undefined,
						sortOrder: (index + 1) * 1024,
					},
				});
			}
		});
		revalidatePath("/");
		return { ok: true };
	} catch (error) {
		return actionError(error, "The task could not be moved.");
	}
}

export async function updateTask(formData: FormData): Promise<ActionResult> {
	try {
		const parsed = updateTaskSchema.parse({
			...taskInput(formData),
			id: field(formData, "id"),
		});
		const existing = await db.task.findUnique({ where: { id: parsed.id } });
		if (!existing) return { ok: false, error: "Task not found." };

		const has = (name: string) => formData.has(name);
		const effectiveMin = has("estimateMinMinutes")
			? (parsed.estimateMinMinutes ?? null)
			: existing.estimateMinMinutes;
		const effectiveMax = has("estimateMaxMinutes")
			? (parsed.estimateMaxMinutes ?? null)
			: existing.estimateMaxMinutes;
		if (!estimatesAreValid(effectiveMin, effectiveMax)) {
			return {
				ok: false,
				error: "The minimum estimate cannot exceed the maximum estimate.",
			};
		}

		await verifyRelations(
			has("clientId") ? parsed.clientId : undefined,
			has("labelId") ? parsed.labelId : undefined,
		);
		await db.task.update({
			where: { id: parsed.id },
			data: {
				...(has("title") ? { title: parsed.title } : {}),
				...(has("description")
					? { description: nullableText(parsed.description) }
					: {}),
				...(has("status") ? { status: parsed.status } : {}),
				...(has("deadline") ? { deadline: parsed.deadline ?? null } : {}),
				...(has("estimateMinMinutes")
					? { estimateMinMinutes: parsed.estimateMinMinutes ?? null }
					: {}),
				...(has("estimateMaxMinutes")
					? { estimateMaxMinutes: parsed.estimateMaxMinutes ?? null }
					: {}),
				...(has("clientId") ? { clientId: parsed.clientId ?? null } : {}),
				...(has("labelId") ? { labelId: parsed.labelId ?? null } : {}),
			},
		});
		revalidatePath("/");
		revalidatePath(`/tasks/${parsed.id}`);
		return { ok: true };
	} catch (error) {
		return actionError(error, "The task could not be updated.");
	}
}

export async function deleteTask(idInput: number): Promise<ActionResult> {
	try {
		const id = int4IdSchema.parse(idInput);
		const existing = await db.task.findUnique({
			where: { id },
			select: { id: true },
		});
		if (!existing) return { ok: false, error: "Task not found." };
		await db.task.delete({ where: { id } });
		revalidatePath("/");
		revalidatePath("/archived");
		return { ok: true };
	} catch (error) {
		return actionError(error, "The task could not be deleted.");
	}
}

export async function setArchived(
	idInput: number,
	archivedInput: boolean,
): Promise<ActionResult> {
	try {
		const id = int4IdSchema.parse(idInput);
		const archived = z.boolean().parse(archivedInput);
		const existing = await db.task.findUnique({
			where: { id },
			select: { id: true },
		});
		if (!existing) return { ok: false, error: "Task not found." };
		await db.task.update({
			where: { id },
			data: { archivedAt: archived ? new Date() : null },
		});
		revalidatePath("/");
		revalidatePath("/archived");
		revalidatePath(`/tasks/${id}`);
		return { ok: true };
	} catch (error) {
		return actionError(error, "The task could not be archived.");
	}
}
