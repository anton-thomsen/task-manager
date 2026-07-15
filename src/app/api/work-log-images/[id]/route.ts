import { int4IdSchema } from "~/lib/validation";
import { requireMember } from "~/server/auth";
import { db } from "~/server/db";
import { taskWhereFor } from "~/server/task-access";

export const runtime = "nodejs";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const member = await requireMember();
	const { id: rawId } = await params;
	const parsedId = int4IdSchema.safeParse(rawId);
	if (!parsedId.success) return new Response("Not found.", { status: 404 });

	const image = await db.workLogImage.findFirst({
		where: {
			id: parsedId.data,
			taskLog: { task: taskWhereFor(member) },
		},
		select: { data: true, mimeType: true },
	});
	if (!image) return new Response("Not found.", { status: 404 });

	return new Response(image.data, {
		headers: {
			"Cache-Control": "private, no-store",
			"Content-Length": String(image.data.byteLength),
			"Content-Security-Policy": "default-src 'none'; sandbox",
			"Content-Type": image.mimeType,
			"X-Content-Type-Options": "nosniff",
		},
	});
}
