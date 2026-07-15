import { GoogleCalendarSettings } from "~/components/settings/google-calendar-settings";
import { requireMember } from "~/server/auth";
import { googleCalendarConfigured } from "~/server/calendar-sync";
import { db } from "~/server/db";

function formatDate(date: Date): string {
	return date.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export default async function IntegrationsSettingsPage() {
	const member = await requireMember();
	const [account, syncStatus] = await Promise.all([
		db.account.findFirst({
			where: { userId: member.userId, providerId: "google" },
			select: { createdAt: true },
		}),
		db.calendarSyncStatus.findUnique({
			where: { userId: member.userId },
			select: { needsReconnect: true, lastSyncedAt: true },
		}),
	]);

	return (
		<GoogleCalendarSettings
			configured={googleCalendarConfigured()}
			connected={Boolean(account)}
			connectedSince={account ? formatDate(account.createdAt) : null}
			lastSyncedAt={
				syncStatus?.lastSyncedAt ? formatDate(syncStatus.lastSyncedAt) : null
			}
			needsReconnect={syncStatus?.needsReconnect ?? false}
		/>
	);
}
