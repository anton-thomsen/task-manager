"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { TaskOption } from "~/lib/tasks";
import { requireMember } from "~/server/auth";
import { db } from "~/server/db";

const clientNameSchema = z.string().trim().min(1).max(50);

export async function createClient(nameInput: string): Promise<TaskOption> {
	const member = await requireMember();
	const name = clientNameSchema.parse(nameInput);
	const client = await db.client.upsert({
		where: {
			organizationId_name: { organizationId: member.orgId, name },
		},
		create: { organizationId: member.orgId, name },
		update: {},
	});
	revalidatePath("/");
	return { id: client.id, name: client.name };
}
