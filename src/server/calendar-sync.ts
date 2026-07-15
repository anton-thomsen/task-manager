import { after } from "next/server";

import { env } from "~/env";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

const calendarBase = "https://www.googleapis.com/calendar/v3/calendars/primary";

export function googleCalendarConfigured(): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

async function markSyncState(
	userId: string,
	state: { needsReconnect: boolean; synced?: boolean },
): Promise<void> {
	const lastSyncedAt = state.synced ? new Date() : undefined;
	await db.calendarSyncStatus.upsert({
		where: { userId },
		create: { userId, needsReconnect: state.needsReconnect, lastSyncedAt },
		update: { needsReconnect: state.needsReconnect, lastSyncedAt },
	});
}

/**
 * Access token via better-auth, which refreshes with the stored refresh
 * token and persists the result. Returns null (and flags the connection for
 * reconnect) when Google refuses the refresh - e.g. revoked access or an
 * expired test-mode refresh token.
 */
async function accessTokenFor(userId: string): Promise<string | null> {
	try {
		const { accessToken } = await auth.api.getAccessToken({
			body: { providerId: "google", userId },
		});
		if (!accessToken) throw new Error("Empty access token");
		return accessToken;
	} catch {
		await markSyncState(userId, { needsReconnect: true });
		return null;
	}
}

type SyncableTask = {
	id: number;
	title: string;
	deadline: Date | null;
	archivedAt: Date | null;
};

function eventBody(task: SyncableTask, deadline: Date) {
	const date = deadline.toISOString().slice(0, 10);
	const nextDay = new Date(deadline);
	nextDay.setUTCDate(nextDay.getUTCDate() + 1);
	return {
		summary: task.title,
		description: new URL(`/tasks/${task.id}`, env.BETTER_AUTH_URL).toString(),
		start: { date },
		end: { date: nextDay.toISOString().slice(0, 10) },
	};
}

async function calendarRequest(
	accessToken: string,
	method: "POST" | "PATCH" | "DELETE",
	path: string,
	body?: unknown,
): Promise<{
	ok: boolean;
	unauthorized: boolean;
	notFound: boolean;
	eventId?: string;
}> {
	const response = await fetch(`${calendarBase}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const notFound = response.status === 404 || response.status === 410;
	// A deleted or already-gone event is success for our purposes.
	if (method === "DELETE" && notFound) {
		return { ok: true, unauthorized: false, notFound: true };
	}
	if (!response.ok) {
		return { ok: false, unauthorized: response.status === 401, notFound };
	}
	if (method === "DELETE") {
		return { ok: true, unauthorized: false, notFound: false };
	}
	const payload = (await response.json()) as { id?: string };
	return {
		ok: true,
		unauthorized: false,
		notFound: false,
		eventId: payload.id,
	};
}

async function deleteEvent(
	userId: string,
	googleEventId: string,
): Promise<void> {
	const accessToken = await accessTokenFor(userId);
	if (!accessToken) return;
	await calendarRequest(accessToken, "DELETE", `/events/${googleEventId}`);
}

/**
 * Bring one participant's Google calendar in line with one task: upsert an
 * all-day event while the task is live with a deadline, delete it otherwise.
 * Never throws - calendar sync must not break task mutations.
 */
export async function syncTaskForUser(
	taskId: number,
	userId: string,
): Promise<void> {
	if (!googleCalendarConfigured()) return;
	try {
		const [task, account, mapping] = await Promise.all([
			db.task.findUnique({
				where: { id: taskId },
				select: { id: true, title: true, deadline: true, archivedAt: true },
			}),
			db.account.findFirst({
				where: { userId, providerId: "google" },
				select: { id: true },
			}),
			db.taskCalendarEvent.findUnique({
				where: { taskId_userId: { taskId, userId } },
			}),
		]);
		if (!account) return;

		const wantsEvent = Boolean(task && !task.archivedAt && task.deadline);

		if (!wantsEvent) {
			if (!mapping) return;
			await deleteEvent(userId, mapping.googleEventId);
			await db.taskCalendarEvent
				.delete({ where: { id: mapping.id } })
				.catch(() => undefined);
			return;
		}
		if (!task?.deadline) return;

		const accessToken = await accessTokenFor(userId);
		if (!accessToken) return;
		const body = eventBody(task, task.deadline);

		if (mapping) {
			const updated = await calendarRequest(
				accessToken,
				"PATCH",
				`/events/${mapping.googleEventId}`,
				body,
			);
			if (updated.ok) {
				await markSyncState(userId, { needsReconnect: false, synced: true });
				return;
			}
			if (updated.unauthorized) {
				await markSyncState(userId, { needsReconnect: true });
				return;
			}
			// Transient/other failure (403, 429, 5xx): leave the mapping intact so
			// the next scheduled sync retries the PATCH.
			if (!updated.notFound) return;
			// Event vanished on Google's side (404/410) - drop the mapping and recreate.
			await db.taskCalendarEvent.delete({ where: { id: mapping.id } });
		}

		const created = await calendarRequest(accessToken, "POST", "/events", body);
		if (created.ok && created.eventId) {
			await db.taskCalendarEvent.upsert({
				where: { taskId_userId: { taskId, userId } },
				create: { taskId, userId, googleEventId: created.eventId },
				update: { googleEventId: created.eventId },
			});
			await markSyncState(userId, { needsReconnect: false, synced: true });
		} else if (created.unauthorized) {
			await markSyncState(userId, { needsReconnect: true });
		}
	} catch (error) {
		console.error(`Calendar sync failed for task ${taskId}:`, error);
	}
}

/** Sync every participant of a task. Never throws. */
export async function syncTask(taskId: number): Promise<void> {
	if (!googleCalendarConfigured()) return;
	try {
		const assignees = await db.taskAssignee.findMany({
			where: { taskId },
			select: { userId: true },
		});
		for (const { userId } of assignees) {
			await syncTaskForUser(taskId, userId);
		}
	} catch (error) {
		console.error(`Calendar sync failed for task ${taskId}:`, error);
	}
}

/** Fire-and-forget wrapper for task mutations. */
export function scheduleTaskSync(taskId: number): void {
	if (!googleCalendarConfigured()) return;
	after(() => syncTask(taskId));
}

/**
 * Remove one user's event for a task regardless of task state. Needed when a
 * participant is unassigned: syncTask only iterates current assignees, so the
 * removed user's event would otherwise linger. Never throws.
 */
export async function unsyncTaskForUser(
	taskId: number,
	userId: string,
): Promise<void> {
	if (!googleCalendarConfigured()) return;
	try {
		const mapping = await db.taskCalendarEvent.findUnique({
			where: { taskId_userId: { taskId, userId } },
		});
		if (!mapping) return;
		await deleteEvent(userId, mapping.googleEventId).catch(() => undefined);
		await db.taskCalendarEvent
			.delete({ where: { id: mapping.id } })
			.catch(() => undefined);
	} catch (error) {
		console.error(`Calendar unsync failed for task ${taskId}:`, error);
	}
}

/** Fire-and-forget sync for assignee changes: added users gain the task's
 * event, removed users lose it. */
export function scheduleAssigneeSync(
	taskId: number,
	added: string[],
	removed: string[],
): void {
	if (!googleCalendarConfigured()) return;
	if (added.length === 0 && removed.length === 0) return;
	after(async () => {
		for (const userId of added) await syncTaskForUser(taskId, userId);
		for (const userId of removed) await unsyncTaskForUser(taskId, userId);
	});
}

/**
 * Call BEFORE deleting a task (cascade removes the mappings): captures the
 * per-user event mappings and returns a cleanup to run after the delete.
 */
export async function prepareTaskEventCleanup(
	taskId: number,
): Promise<() => void> {
	if (!googleCalendarConfigured()) return () => undefined;
	const mappings = await db.taskCalendarEvent.findMany({
		where: { taskId },
		select: { userId: true, googleEventId: true },
	});
	return () => {
		if (mappings.length === 0) return;
		after(async () => {
			for (const mapping of mappings) {
				await deleteEvent(mapping.userId, mapping.googleEventId).catch(
					() => undefined,
				);
			}
		});
	};
}

/**
 * Disconnect cleanup: best-effort delete of every synced event for the user,
 * then drop the mappings and sync status. Used by the disconnect action.
 */
export async function removeAllEventsForUser(userId: string): Promise<void> {
	const mappings = await db.taskCalendarEvent.findMany({
		where: { userId },
		select: { googleEventId: true },
	});
	const accessToken = await accessTokenFor(userId);
	if (accessToken) {
		for (const mapping of mappings) {
			await calendarRequest(
				accessToken,
				"DELETE",
				`/events/${mapping.googleEventId}`,
			).catch(() => undefined);
		}
	}
	await db.taskCalendarEvent.deleteMany({ where: { userId } });
	await db.calendarSyncStatus.deleteMany({ where: { userId } });
}
