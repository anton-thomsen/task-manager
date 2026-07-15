import type { SessionMember } from "~/server/auth";
import { db } from "~/server/db";

/** A tool input error the AI caller is expected to recover from. */
export class ToolInputError extends Error {}

export async function resolveClientId(
	orgId: string,
	value: string,
): Promise<number | null> {
	if (value.toLowerCase() === "none") return null;
	const client = await db.client.findFirst({
		where: {
			organizationId: orgId,
			name: { equals: value, mode: "insensitive" },
		},
		select: { id: true },
	});
	if (client) return client.id;
	const options = await db.client.findMany({
		where: { organizationId: orgId },
		select: { name: true },
		orderBy: { name: "asc" },
	});
	throw new ToolInputError(
		`Unknown client "${value}". Existing clients: ${
			options.length ? options.map((c) => c.name).join(", ") : "(none yet)"
		}. Ask the user whether to use one of these or create it with create_client, or pass "none".`,
	);
}

export async function resolveLabelId(
	orgId: string,
	value: string,
): Promise<number | null> {
	if (value.toLowerCase() === "no label") return null;
	const label = await db.label.findFirst({
		where: {
			organizationId: orgId,
			name: { equals: value, mode: "insensitive" },
		},
		select: { id: true },
	});
	if (label) return label.id;
	const options = await db.label.findMany({
		where: { organizationId: orgId },
		select: { name: true },
		orderBy: { name: "asc" },
	});
	throw new ToolInputError(
		`Unknown label "${value}". Existing labels: ${
			options.length ? options.map((l) => l.name).join(", ") : "(none yet)"
		}. Ask the user whether to use one of these or create it with create_label, or pass "no label".`,
	);
}

export type ResolvedMember = { userId: string; name: string; email: string };

/** Resolve an org member by email or display name (case-insensitive). */
export async function resolveOrgMember(
	member: SessionMember,
	value: string,
): Promise<ResolvedMember> {
	const memberships = await db.member.findMany({
		where: { organizationId: member.orgId },
		select: { user: { select: { id: true, name: true, email: true } } },
	});
	const needle = value.trim().toLowerCase();
	const matches = memberships.filter(
		({ user }) =>
			user.email.toLowerCase() === needle || user.name.toLowerCase() === needle,
	);
	if (matches.length === 1 && matches[0]) {
		const { user } = matches[0];
		return { userId: user.id, name: user.name, email: user.email };
	}
	const roster = memberships
		.map(({ user }) => `${user.name} <${user.email}>`)
		.join(", ");
	throw new ToolInputError(
		matches.length === 0
			? `No organization member matches "${value}". Members: ${roster}.`
			: `"${value}" matches more than one member. Members: ${roster}. Use the email address.`,
	);
}
