import { randomBytes } from "node:crypto";

import type { OrgRole, SessionMember } from "~/server/auth";
import { db } from "~/server/db";

export function generateToken(): string {
	return randomBytes(32).toString("base64url");
}

function toOrgRole(role: string): OrgRole {
	return role === "owner" || role === "admin" ? role : "member";
}

/**
 * Resolve a per-user API token (calendar feed or task API) to the owning
 * member. Tokens are 256-bit random values stored under a unique index, so a
 * direct lookup is the practical equivalent of a constant-time compare.
 */
export async function memberFromToken(
	token: string,
	field: "calendarToken" | "apiToken",
): Promise<SessionMember | null> {
	if (token.length < 32) return null;
	const user = await db.user.findUnique({
		where:
			field === "calendarToken"
				? { calendarToken: token }
				: { apiToken: token },
		select: {
			id: true,
			name: true,
			memberships: {
				orderBy: { createdAt: "asc" },
				take: 1,
				select: { organizationId: true, role: true },
			},
		},
	});
	const membership = user?.memberships[0];
	if (!user || !membership) return null;
	return {
		userId: user.id,
		userName: user.name,
		orgId: membership.organizationId,
		role: toOrgRole(membership.role),
	};
}
