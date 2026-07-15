import { env } from "~/env";
import { db } from "~/server/db";
import { taskWhereFor } from "~/server/task-access";
import { memberFromToken } from "~/server/token-auth";

export const runtime = "nodejs";

function escapeIcs(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll(";", "\\;")
		.replaceAll(",", "\\,")
		.replaceAll(/\r\n|\r|\n/g, "\\n");
}

function calendarDate(date: Date): string {
	return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function timestamp(date: Date): string {
	return date.toISOString().replaceAll(/[-:]/g, "").replace(".000", "");
}

function nextUtcDay(date: Date): Date {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + 1);
	return next;
}

export async function GET(request: Request) {
	const token = new URL(request.url).searchParams.get("token") ?? "";
	const member = await memberFromToken(token, "calendarToken");
	if (!member) {
		return new Response("Not found.", { status: 404 });
	}

	const tasks = await db.task.findMany({
		where: {
			AND: [taskWhereFor(member)],
			archivedAt: null,
			deadline: { not: null },
		},
		orderBy: [{ deadline: "asc" }, { id: "asc" }],
		include: { client: { select: { name: true } } },
	});
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Task Manager//Deadline Feed//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"X-WR-CALNAME:Task Manager Deadlines",
	];

	for (const task of tasks) {
		if (!task.deadline) continue;
		const taskUrl = new URL(
			`/tasks/${task.id}`,
			env.BETTER_AUTH_URL,
		).toString();
		const summary = task.client
			? `${task.client.name}: ${task.title}`
			: task.title;
		lines.push(
			"BEGIN:VEVENT",
			`UID:task-${task.id}@task-manager`,
			`DTSTAMP:${timestamp(task.updatedAt)}`,
			`DTSTART;VALUE=DATE:${calendarDate(task.deadline)}`,
			`DTEND;VALUE=DATE:${calendarDate(nextUtcDay(task.deadline))}`,
			`SUMMARY:${escapeIcs(summary)}`,
			`DESCRIPTION:${escapeIcs(taskUrl)}`,
			`URL:${escapeIcs(taskUrl)}`,
			"END:VEVENT",
		);
	}
	lines.push("END:VCALENDAR");

	return new Response(`${lines.join("\r\n")}\r\n`, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/calendar; charset=utf-8",
		},
	});
}
