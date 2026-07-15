import { requireMember } from "~/server/auth";
import { db } from "~/server/db";

export const runtime = "nodejs";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ userId: string }> },
) {
	const member = await requireMember();
	const { userId } = await params;
	if (!userId || userId.length > 100) {
		return new Response("Not found.", { status: 404 });
	}

	const avatar = await db.userAvatar.findFirst({
		where: {
			userId,
			user: {
				memberships: { some: { organizationId: member.orgId } },
			},
		},
		select: { data: true, mimeType: true },
	});
	if (!avatar) return new Response("Not found.", { status: 404 });

	return new Response(avatar.data, {
		headers: {
			"Cache-Control": "private, no-store",
			"Content-Length": String(avatar.data.byteLength),
			"Content-Security-Policy": "default-src 'none'; sandbox",
			"Content-Type": avatar.mimeType,
			"X-Content-Type-Options": "nosniff",
		},
	});
}
