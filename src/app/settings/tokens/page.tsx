import { TokenSettings } from "~/components/settings/token-settings";
import { env } from "~/env";
import { requireMember } from "~/server/auth";
import { db } from "~/server/db";

export default async function TokenSettingsPage() {
	const member = await requireMember();
	const user = await db.user.findUniqueOrThrow({
		where: { id: member.userId },
		select: { calendarToken: true, apiToken: true },
	});
	const calendarUrl = user.calendarToken
		? new URL(
				`/api/calendar.ics?token=${user.calendarToken}`,
				env.BETTER_AUTH_URL,
			).toString()
		: null;
	return <TokenSettings apiToken={user.apiToken} calendarUrl={calendarUrl} />;
}
