import { ProfileSettings } from "~/components/settings/profile-settings";
import { requireMember } from "~/server/auth";
import { db } from "~/server/db";

export default async function ProfileSettingsPage() {
	const member = await requireMember();
	const user = await db.user.findUniqueOrThrow({
		where: { id: member.userId },
		select: { name: true, email: true, image: true },
	});
	return (
		<ProfileSettings email={user.email} image={user.image} name={user.name} />
	);
}
