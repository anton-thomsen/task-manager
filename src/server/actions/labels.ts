"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { LabelOption } from "~/lib/tasks";
import { requireSession } from "~/server/auth";
import { db } from "~/server/db";

const labelSchema = z.object({
	name: z.string().trim().min(1).max(50),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function createLabel(
	nameInput: string,
	colorInput: string,
): Promise<LabelOption> {
	await requireSession();
	const { name, color } = labelSchema.parse({
		name: nameInput,
		color: colorInput,
	});
	const label = await db.label.upsert({
		where: { name },
		create: { name, color },
		update: { color },
	});
	revalidatePath("/");
	return label;
}
