"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { type ActionResult, actionError } from "~/lib/validation";
import { auth, requireMember } from "~/server/auth";
import { removeAllEventsForUser } from "~/server/calendar-sync";

export async function disconnectGoogle(): Promise<ActionResult> {
	const member = await requireMember();
	try {
		// Remove synced events and mappings first, while the tokens still exist.
		await removeAllEventsForUser(member.userId);
		await auth.api.unlinkAccount({
			body: { providerId: "google" },
			headers: await headers(),
		});
		revalidatePath("/settings/integrations");
		return { ok: true };
	} catch (error) {
		return actionError(error, "Google Calendar could not be disconnected.");
	}
}
