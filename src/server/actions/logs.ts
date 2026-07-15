"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";

import { type ActionResult, actionError, int4IdSchema } from "~/lib/validation";
import { requireMember } from "~/server/auth";
import { db } from "~/server/db";
import { taskWhereFor } from "~/server/task-access";

const maxImageCount = 5;
const maxImageBytes = 5 * 1024 * 1024;
const maxTotalImageBytes = 15 * 1024 * 1024;
const maxImageDimension = 8192;
const maxImagePixels = 20_000_000;
const supportedImageError =
	"Images must be complete PNG, JPEG, GIF, or WebP files no larger than 8192 pixels per side or 20 megapixels.";

const logSchema = z.object({
	taskId: int4IdSchema,
	note: z.string().trim().min(1, "A short description is required.").max(240),
	details: z.string().trim().max(20_000).optional(),
	hoursSpent: z.preprocess(
		(value) =>
			value === "" || value === null || value === undefined ? undefined : value,
		z.coerce
			.number({ invalid_type_error: "Time spent is required." })
			.positive("Time spent must be greater than zero.")
			.max(100_000),
	),
	estimatedHours: z.preprocess(
		(value) =>
			value === "" || value === null || value === undefined ? undefined : value,
		z.coerce
			.number({ invalid_type_error: "The estimate must be a number." })
			.positive("The estimate must be greater than zero.")
			.max(100_000)
			.optional(),
	),
	subtaskId: z.preprocess(
		(value) => (value === "" || value === undefined ? undefined : value),
		int4IdSchema.optional(),
	),
});

function imageMimeType(format: string | undefined): string | null {
	switch (format) {
		case "png":
			return "image/png";
		case "jpeg":
			return "image/jpeg";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		default:
			return null;
	}
}

async function validateImage(file: File) {
	try {
		const data = new Uint8Array(await file.arrayBuffer());
		const image = sharp(data, {
			animated: true,
			failOn: "warning",
			limitInputPixels: maxImagePixels,
		});
		const metadata = await image.metadata();
		const mimeType = imageMimeType(metadata.format);
		const width = metadata.width ?? 0;
		const frameHeight = metadata.pageHeight ?? metadata.height ?? 0;
		const pages = metadata.pages ?? 1;
		const pixelCount = width * frameHeight * pages;

		if (
			!mimeType ||
			width === 0 ||
			frameHeight === 0 ||
			width > maxImageDimension ||
			frameHeight > maxImageDimension ||
			!Number.isSafeInteger(pixelCount) ||
			pixelCount > maxImagePixels
		) {
			throw new Error("INVALID_IMAGE");
		}

		await image.raw().toBuffer();
		return {
			data,
			fileName: file.name.trim().slice(0, 200) || "work-log-image",
			mimeType,
		};
	} catch {
		throw new Error(supportedImageError);
	}
}

export async function addLog(formData: FormData): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const parsed = logSchema.parse({
			taskId: formData.get("taskId")?.toString(),
			note: formData.get("note")?.toString(),
			details: formData.get("details")?.toString(),
			hoursSpent: formData.get("hoursSpent")?.toString(),
			estimatedHours: formData.get("estimatedHours")?.toString(),
			subtaskId: formData.get("subtaskId")?.toString(),
		});
		const files = formData
			.getAll("images")
			.filter(
				(value): value is File => typeof value !== "string" && value.size > 0,
			);
		if (files.length > maxImageCount) {
			return { ok: false, error: `Upload at most ${maxImageCount} images.` };
		}
		if (files.some((file) => file.size > maxImageBytes)) {
			return { ok: false, error: "Each image must be 5 MB or smaller." };
		}
		const totalImageBytes = files.reduce((total, file) => total + file.size, 0);
		if (totalImageBytes > maxTotalImageBytes) {
			return { ok: false, error: "Images must total 15 MB or less." };
		}

		const task = await db.task.findFirst({
			where: { id: parsed.taskId, AND: taskWhereFor(member) },
			select: { id: true },
		});
		if (!task) return { ok: false, error: "Task not found." };

		if (parsed.subtaskId !== undefined) {
			const subtask = await db.subtask.findFirst({
				where: { id: parsed.subtaskId, taskId: parsed.taskId },
				select: { id: true },
			});
			if (!subtask) return { ok: false, error: "Subtask not found." };
		}

		const images = [];
		for (const file of files) {
			try {
				images.push(await validateImage(file));
			} catch {
				return {
					ok: false,
					error: supportedImageError,
				};
			}
		}

		await db.taskLog.create({
			data: {
				taskId: parsed.taskId,
				note: parsed.note,
				details: parsed.details || null,
				hoursSpent: parsed.hoursSpent,
				estimatedHours: parsed.estimatedHours ?? null,
				subtaskId: parsed.subtaskId ?? null,
				authorId: member.userId,
				images: { create: images },
			},
		});
		revalidatePath(`/tasks/${parsed.taskId}`);
		return { ok: true };
	} catch (error) {
		return actionError(error, "The work log entry could not be added.");
	}
}

export async function deleteLog(idInput: number): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const id = int4IdSchema.parse(idInput);
		const log = await db.taskLog.findFirst({
			where: { id, task: taskWhereFor(member) },
			select: { taskId: true },
		});
		if (!log) return { ok: false, error: "Work log entry not found." };

		await db.taskLog.delete({ where: { id } });
		revalidatePath(`/tasks/${log.taskId}`);
		return { ok: true };
	} catch (error) {
		return actionError(error, "The work log entry could not be deleted.");
	}
}
