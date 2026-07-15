import type { UserRef } from "~/components/user-avatar";
import { db } from "~/server/db";

export async function listOrgMembers(orgId: string): Promise<UserRef[]> {
	const members = await db.member.findMany({
		where: { organizationId: orgId },
		select: {
			user: { select: { id: true, name: true, image: true } },
		},
		orderBy: { user: { name: "asc" } },
	});
	return members.map(({ user }) => ({
		userId: user.id,
		name: user.name,
		image: user.image,
	}));
}
