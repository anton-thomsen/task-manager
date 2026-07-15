"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, actionError, int4IdSchema } from "~/lib/validation";
import { verifyOrgMembers } from "~/server/assignment";
import { requireMember } from "~/server/auth";
import { db } from "~/server/db";
import { requireTaskAccess } from "~/server/task-access";

const userIdSchema = z.string().trim().min(1).max(100);

export async function assignTask(
	taskIdInput: number,
	userIdInput: string,
): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const taskId = int4IdSchema.parse(taskIdInput);
		const userId = userIdSchema.parse(userIdInput);
		await requireTaskAccess(member, taskId);
		await verifyOrgMembers(member, [userId]);
		await db.taskAssignee.upsert({
			where: { taskId_userId: { taskId, userId } },
			create: {
				taskId,
				userId,
				assignedById: member.userId,
				acceptedAt: userId === member.userId ? new Date() : null,
			},
			update: {},
		});
		revalidatePath("/");
		revalidatePath(`/tasks/${taskId}`);
		return { ok: true };
	} catch (error) {
		return actionError(error, "The task could not be assigned.");
	}
}

export async function unassignTask(
	taskIdInput: number,
	userIdInput: string,
): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const taskId = int4IdSchema.parse(taskIdInput);
		const userId = userIdSchema.parse(userIdInput);
		await requireTaskAccess(member, taskId);
		const participants = await db.taskAssignee.count({ where: { taskId } });
		const row = await db.taskAssignee.findUnique({
			where: { taskId_userId: { taskId, userId } },
			select: { id: true },
		});
		if (!row) return { ok: false, error: "That person is not assigned." };
		if (participants <= 1) {
			return { ok: false, error: "A task needs at least one participant." };
		}
		await db.taskAssignee.delete({ where: { id: row.id } });
		revalidatePath("/");
		revalidatePath(`/tasks/${taskId}`);
		return { ok: true };
	} catch (error) {
		return actionError(error, "The assignment could not be removed.");
	}
}

export async function acceptTask(taskIdInput: number): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const taskId = int4IdSchema.parse(taskIdInput);
		const updated = await db.taskAssignee.updateMany({
			where: { taskId, userId: member.userId, acceptedAt: null },
			data: { acceptedAt: new Date() },
		});
		if (updated.count === 0) {
			return { ok: false, error: "There is no pending delegation to accept." };
		}
		revalidatePath("/");
		revalidatePath(`/tasks/${taskId}`);
		return { ok: true };
	} catch (error) {
		return actionError(error, "The delegation could not be accepted.");
	}
}
