"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { type ActionResult, actionError } from "~/lib/validation";
import { auth, requireMember } from "~/server/auth";

const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.email("Enter a valid email address.")
	.max(200);

export async function inviteMember(formData: FormData): Promise<ActionResult> {
	const member = await requireMember();
	if (member.role !== "owner" && member.role !== "admin") {
		return { ok: false, error: "Only owners and admins can invite members." };
	}
	try {
		const email = emailSchema.parse(formData.get("email")?.toString());
		await auth.api.createInvitation({
			body: {
				email,
				role: "member",
				organizationId: member.orgId,
			},
			headers: await headers(),
		});
		revalidatePath("/settings/members");
		return { ok: true };
	} catch (error) {
		return actionError(error, "The invitation could not be sent.");
	}
}

const invitationIdSchema = z.string().trim().min(1).max(100);

export async function cancelInvitation(idInput: string): Promise<ActionResult> {
	const member = await requireMember();
	if (member.role !== "owner" && member.role !== "admin") {
		return {
			ok: false,
			error: "Only owners and admins can cancel invitations.",
		};
	}
	try {
		const invitationId = invitationIdSchema.parse(idInput);
		await auth.api.cancelInvitation({
			body: { invitationId },
			headers: await headers(),
		});
		revalidatePath("/settings/members");
		return { ok: true };
	} catch (error) {
		return actionError(error, "The invitation could not be canceled.");
	}
}
