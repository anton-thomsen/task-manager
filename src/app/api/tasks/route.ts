import { z } from "zod";

import { taskDescriptionSchema, taskTitleSchema } from "~/lib/validation";
import { scheduleTaskSync } from "~/server/calendar-sync";
import { createTaskAtLaneEnd } from "~/server/task-creation";
import { memberFromToken } from "~/server/token-auth";

export const runtime = "nodejs";

const maxBodyBytes = 10 * 1024;
const isoDateSchema = z
	.string()
	.refine((value) => {
		const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
		const isDateTime = z
			.string()
			.datetime({ offset: true })
			.safeParse(value).success;
		return (isDateOnly || isDateTime) && !Number.isNaN(Date.parse(value));
	}, "Deadline must be an ISO date.")
	.transform((value) => new Date(value));
const createTaskApiSchema = z
	.object({
		deadline: isoDateSchema.optional(),
		description: taskDescriptionSchema,
		title: taskTitleSchema,
	})
	.strict();

function unauthorized() {
	return Response.json({ error: "Unauthorized." }, { status: 401 });
}

async function readLimitedBody(request: Request): Promise<string | null> {
	if (!request.body) return "";
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let body = "";
	let bytesRead = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		bytesRead += value.byteLength;
		if (bytesRead > maxBodyBytes) {
			await reader.cancel();
			return null;
		}
		body += decoder.decode(value, { stream: true });
	}
	return body + decoder.decode();
}

export async function POST(request: Request) {
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) return unauthorized();
	const member = await memberFromToken(authorization.slice(7), "apiToken");
	if (!member) return unauthorized();

	const declaredLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
		return Response.json(
			{ error: "Request body is too large." },
			{ status: 413 },
		);
	}

	const text = await readLimitedBody(request);
	if (text === null) {
		return Response.json(
			{ error: "Request body is too large." },
			{ status: 413 },
		);
	}

	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return Response.json(
			{ error: "Request body must be valid JSON." },
			{ status: 400 },
		);
	}

	const parsed = createTaskApiSchema.safeParse(json);
	if (!parsed.success) {
		return Response.json(
			{ error: parsed.error.issues[0]?.message ?? "Invalid task." },
			{ status: 400 },
		);
	}

	const task = await createTaskAtLaneEnd(
		{ orgId: member.orgId, userId: member.userId },
		{
			deadline: parsed.data.deadline,
			description: parsed.data.description || null,
			title: parsed.data.title,
		},
	);
	if (task.deadline) scheduleTaskSync(task.id);
	return Response.json({ id: task.id, title: task.title }, { status: 201 });
}
