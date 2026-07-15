"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { taskStatuses } from "~/lib/tasks";
import {
	type ActionResult,
	actionError,
	int4IdSchema,
	optionalDateSchema,
	optionalPositiveInt,
	optionalPositiveNumber,
	taskDescriptionSchema,
	taskTitleSchema,
} from "~/lib/validation";
import { reconcileAssignees, verifyOrgMembers } from "~/server/assignment";
import { requireMember, type SessionMember } from "~/server/auth";
import {
	prepareTaskEventCleanup,
	scheduleTaskSync,
} from "~/server/calendar-sync";
import { db } from "~/server/db";
import { requireTaskAccess, taskWhereFor } from "~/server/task-access";
import { createTaskAtLaneEnd } from "~/server/task-creation";

const assigneeIdsSchema = z.array(z.string().trim().min(1).max(100)).max(50);

function assigneeInput(formData: FormData): string[] | undefined {
	// The form always submits this marker when the picker is rendered, so an
	// empty selection is distinguishable from a form without the picker.
	if (!formData.has("assigneesPresent")) return undefined;
	return assigneeIdsSchema.parse(
		formData.getAll("assignees").map((value) => value.toString()),
	);
}

const taskFields = {
	title: taskTitleSchema,
	description: taskDescriptionSchema,
	status: z.enum(taskStatuses),
	deadline: optionalDateSchema,
	estimateMinHours: optionalPositiveNumber(100_000),
	estimateMaxHours: optionalPositiveNumber(100_000),
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
	estimateMinHours: taskFields.estimateMinHours,
	estimateMaxHours: taskFields.estimateMaxHours,
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
		estimateMinHours: field(formData, "estimateMinHours"),
		estimateMaxHours: field(formData, "estimateMaxHours"),
		clientId: field(formData, "clientId"),
		labelId: field(formData, "labelId"),
	};
}

function nullableText(value: string | undefined): string | null {
	return value && value.length > 0 ? value : null;
}

async function verifyRelations(
	member: SessionMember,
	clientId: number | undefined,
	labelId: number | undefined,
): Promise<void> {
	const [client, label] = await Promise.all([
		clientId
			? db.client.findFirst({
					where: { id: clientId, organizationId: member.orgId },
					select: { id: true },
				})
			: null,
		labelId
			? db.label.findFirst({
					where: { id: labelId, organizationId: member.orgId },
					select: { id: true },
				})
			: null,
	]);
	if (clientId && !client) throw new Error("Client not found.");
	if (labelId && !label) throw new Error("Label not found.");
}

function estimatesAreValid(min: number | null, max: number | null): boolean {
	return min === null || max === null || min <= max;
}

export async function createTask(formData: FormData): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const parsed = createTaskSchema.parse(taskInput(formData));
		const min = parsed.estimateMinHours ?? null;
		const max = parsed.estimateMaxHours ?? null;
		if (!estimatesAreValid(min, max)) {
			return {
				ok: false,
				error: "The minimum estimate cannot exceed the maximum estimate.",
			};
		}
		await verifyRelations(member, parsed.clientId, parsed.labelId);
		const assigneeIds = assigneeInput(formData) ?? [];
		await verifyOrgMembers(member, assigneeIds);
		const task = await createTaskAtLaneEnd(
			{ orgId: member.orgId, userId: member.userId },
			{
				...parsed,
				description: nullableText(parsed.description),
			},
			assigneeIds,
		);
		if (task.deadline) scheduleTaskSync(task.id);
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
	const member = await requireMember();
	try {
		const { id, status, beforeId } = moveTaskSchema.parse({
			id: idInput,
			status: statusInput,
			beforeId: beforeIdInput,
		});
		await db.$transaction(async (tx) => {
			const task = await tx.task.findFirst({
				where: { id, AND: taskWhereFor(member) },
				select: { archivedAt: true },
			});
			if (!task || task.archivedAt) throw new Error("Task not found.");
			// Reorder within the full organization lane so tasks hidden from this
			// member keep consistent sort positions; visibility only gates which
			// task may be moved.
			const lane = await tx.task.findMany({
				where: {
					organizationId: member.orgId,
					status,
					archivedAt: null,
					id: { not: id },
				},
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
	const member = await requireMember();
	try {
		const parsed = updateTaskSchema.parse({
			...taskInput(formData),
			id: field(formData, "id"),
		});
		const existing = await db.task.findFirst({
			where: { id: parsed.id, AND: taskWhereFor(member) },
		});
		if (!existing) return { ok: false, error: "Task not found." };

		const has = (name: string) => formData.has(name);
		const effectiveMin = has("estimateMinHours")
			? (parsed.estimateMinHours ?? null)
			: existing.estimateMinHours;
		const effectiveMax = has("estimateMaxHours")
			? (parsed.estimateMaxHours ?? null)
			: existing.estimateMaxHours;
		if (!estimatesAreValid(effectiveMin, effectiveMax)) {
			return {
				ok: false,
				error: "The minimum estimate cannot exceed the maximum estimate.",
			};
		}

		await verifyRelations(
			member,
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
				...(has("estimateMinHours")
					? { estimateMinHours: parsed.estimateMinHours ?? null }
					: {}),
				...(has("estimateMaxHours")
					? { estimateMaxHours: parsed.estimateMaxHours ?? null }
					: {}),
				...(has("clientId") ? { clientId: parsed.clientId ?? null } : {}),
				...(has("labelId") ? { labelId: parsed.labelId ?? null } : {}),
			},
		});
		const assigneeIds = assigneeInput(formData);
		if (assigneeIds) {
			// An emptied picker mirrors create semantics: the task falls back to
			// its creator (or the editor) as sole participant.
			const fallback = existing.createdById ?? member.userId;
			await reconcileAssignees(
				member,
				parsed.id,
				assigneeIds.length > 0 ? assigneeIds : [fallback],
			);
		}
		const deadlineChanged =
			has("deadline") &&
			(parsed.deadline ?? null)?.getTime() !== existing.deadline?.getTime();
		const titleChanged = has("title") && parsed.title !== existing.title;
		if (deadlineChanged || titleChanged) scheduleTaskSync(parsed.id);
		revalidatePath("/");
		revalidatePath(`/tasks/${parsed.id}`);
		return { ok: true };
	} catch (error) {
		return actionError(error, "The task could not be updated.");
	}
}

export async function deleteTask(idInput: number): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const id = int4IdSchema.parse(idInput);
		await requireTaskAccess(member, id);
		const cleanupCalendarEvents = await prepareTaskEventCleanup(id);
		await db.task.delete({ where: { id } });
		cleanupCalendarEvents();
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
	const member = await requireMember();
	try {
		const id = int4IdSchema.parse(idInput);
		const archived = z.boolean().parse(archivedInput);
		await requireTaskAccess(member, id);
		await db.task.update({
			where: { id },
			data: { archivedAt: archived ? new Date() : null },
		});
		scheduleTaskSync(id);
		revalidatePath("/");
		revalidatePath("/archived");
		revalidatePath(`/tasks/${id}`);
		return { ok: true };
	} catch (error) {
		return actionError(error, "The task could not be archived.");
	}
}
