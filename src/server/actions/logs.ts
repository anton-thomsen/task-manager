"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, actionError, int4IdSchema } from "~/lib/validation";
import { requireSession } from "~/server/auth";
import { db } from "~/server/db";

const maxImageCount = 5;
const maxImageBytes = 5 * 1024 * 1024;
const maxTotalImageBytes = 15 * 1024 * 1024;

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
});

function detectImageMimeType(data: Uint8Array): string | null {
	if (
		data.length >= 8 &&
		data[0] === 0x89 &&
		data[1] === 0x50 &&
		data[2] === 0x4e &&
		data[3] === 0x47 &&
		data[4] === 0x0d &&
		data[5] === 0x0a &&
		data[6] === 0x1a &&
		data[7] === 0x0a
	) {
		return "image/png";
	}
	if (
		data.length >= 3 &&
		data[0] === 0xff &&
		data[1] === 0xd8 &&
		data[2] === 0xff
	) {
		return "image/jpeg";
	}
	const gifHeader = String.fromCharCode(...data.slice(0, 6));
	if (data.length >= 6 && (gifHeader === "GIF87a" || gifHeader === "GIF89a")) {
		return "image/gif";
	}
	if (
		data.length >= 12 &&
		String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
		String.fromCharCode(...data.slice(8, 12)) === "WEBP"
	) {
		return "image/webp";
	}
	return null;
}

export async function addLog(formData: FormData): Promise<ActionResult> {
	await requireSession();
	try {
		const parsed = logSchema.parse({
			taskId: formData.get("taskId")?.toString(),
			note: formData.get("note")?.toString(),
			details: formData.get("details")?.toString(),
			hoursSpent: formData.get("hoursSpent")?.toString(),
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

		const task = await db.task.findUnique({
			where: { id: parsed.taskId },
			select: { id: true },
		});
		if (!task) return { ok: false, error: "Task not found." };

		const images = await Promise.all(
			files.map(async (file) => {
				const data = new Uint8Array(await file.arrayBuffer());
				const mimeType = detectImageMimeType(data);
				if (!mimeType) throw new Error("UNSUPPORTED_IMAGE");
				return {
					data,
					fileName: file.name.trim().slice(0, 200) || "work-log-image",
					mimeType,
				};
			}),
		).catch((error: unknown) => {
			if (error instanceof Error && error.message === "UNSUPPORTED_IMAGE") {
				return null;
			}
			throw error;
		});
		if (!images) {
			return {
				ok: false,
				error: "Images must be PNG, JPEG, GIF, or WebP files.",
			};
		}

		await db.taskLog.create({
			data: {
				taskId: parsed.taskId,
				note: parsed.note,
				details: parsed.details || null,
				hoursSpent: parsed.hoursSpent,
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
	await requireSession();
	try {
		const id = int4IdSchema.parse(idInput);
		const log = await db.taskLog.findUnique({
			where: { id },
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
