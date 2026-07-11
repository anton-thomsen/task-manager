"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { TaskOption } from "~/lib/tasks";
import { db } from "~/server/db";

const clientNameSchema = z.string().trim().min(1).max(50);

export async function createClient(nameInput: string): Promise<TaskOption> {
	const name = clientNameSchema.parse(nameInput);
	const client = await db.client.upsert({
		where: { name },
		create: { name },
		update: {},
	});
	revalidatePath("/");
	return client;
}
