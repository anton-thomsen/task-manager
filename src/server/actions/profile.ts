"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";

import { type ActionResult, actionError } from "~/lib/validation";
import { requireMember } from "~/server/auth";
import { db } from "~/server/db";
import { generateToken } from "~/server/token-auth";

const nameSchema = z.string().trim().min(1, "A name is required.").max(100);
const maxAvatarBytes = 5 * 1024 * 1024;
const avatarSize = 256;
const avatarError =
	"Avatars must be PNG, JPEG, GIF, or WebP images no larger than 5 MB.";

export async function updateProfile(formData: FormData): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const name = nameSchema.parse(formData.get("name")?.toString());
		await db.user.update({ where: { id: member.userId }, data: { name } });
		revalidatePath("/settings/profile");
		revalidatePath("/");
		return { ok: true };
	} catch (error) {
		return actionError(error, "The profile could not be updated.");
	}
}

export async function uploadAvatar(formData: FormData): Promise<ActionResult> {
	const member = await requireMember();
	const file = formData.get("avatar");
	if (!(file instanceof File) || file.size === 0) {
		return { ok: false, error: "Choose an image to upload." };
	}
	if (file.size > maxAvatarBytes) {
		return { ok: false, error: "The avatar must be 5 MB or smaller." };
	}
	let data: Uint8Array<ArrayBuffer>;
	try {
		const input = new Uint8Array(await file.arrayBuffer());
		data = Uint8Array.from(
			await sharp(input, {
				failOn: "warning",
				limitInputPixels: 20_000_000,
			})
				.resize(avatarSize, avatarSize, { fit: "cover" })
				.webp({ quality: 82 })
				.toBuffer(),
		);
	} catch {
		return { ok: false, error: avatarError };
	}
	await db.$transaction([
		db.userAvatar.upsert({
			where: { userId: member.userId },
			create: { userId: member.userId, mimeType: "image/webp", data },
			update: { mimeType: "image/webp", data },
		}),
		db.user.update({
			where: { id: member.userId },
			data: { image: `/api/avatars/${member.userId}` },
		}),
	]);
	revalidatePath("/settings/profile");
	revalidatePath("/");
	return { ok: true };
}

const tokenKindSchema = z.enum(["calendar", "api"]);

export async function regenerateToken(
	kindInput: string,
): Promise<ActionResult> {
	const member = await requireMember();
	try {
		const kind = tokenKindSchema.parse(kindInput);
		await db.user.update({
			where: { id: member.userId },
			data:
				kind === "calendar"
					? { calendarToken: generateToken() }
					: { apiToken: generateToken() },
		});
		revalidatePath("/settings/tokens");
		return { ok: true };
	} catch (error) {
		return actionError(error, "The token could not be regenerated.");
	}
}
