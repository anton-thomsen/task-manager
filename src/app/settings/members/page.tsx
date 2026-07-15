import {
	type InvitationRow,
	type MemberRow,
	MembersSettings,
} from "~/components/settings/members-settings";
import { requireMember } from "~/server/auth";
import { db } from "~/server/db";

export default async function MembersSettingsPage() {
	const member = await requireMember();
	const [members, invitations] = await Promise.all([
		db.member.findMany({
			where: { organizationId: member.orgId },
			orderBy: { createdAt: "asc" },
			select: {
				id: true,
				role: true,
				user: { select: { name: true, email: true, image: true } },
			},
		}),
		db.invitation.findMany({
			where: {
				organizationId: member.orgId,
				status: "pending",
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: "desc" },
			select: { id: true, email: true, expiresAt: true },
		}),
	]);

	const memberRows: MemberRow[] = members.map((row) => ({
		id: row.id,
		name: row.user.name,
		email: row.user.email,
		image: row.user.image,
		role: row.role,
	}));
	const invitationRows: InvitationRow[] = invitations.map((row) => ({
		id: row.id,
		email: row.email,
		expiresAt: new Intl.DateTimeFormat("en", {
			dateStyle: "medium",
			timeZone: "UTC",
		}).format(row.expiresAt),
	}));

	return (
		<MembersSettings
			canInvite={member.role === "owner" || member.role === "admin"}
			invitations={invitationRows}
			members={memberRows}
		/>
	);
}
