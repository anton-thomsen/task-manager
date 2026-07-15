import { randomUUID } from "node:crypto";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { magicLink, organization } from "better-auth/plugins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "~/env";
import { db } from "~/server/db";
import { sendEmail } from "~/server/email";

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	database: prismaAdapter(db, { provider: "postgresql" }),
	databaseHooks: {
		user: {
			create: {
				async before(user) {
					if (env.AUTH_ALLOW_SIGNUP === "true") return;
					const userCount = await db.user.count();
					if (userCount === 0) return;
					const invitation = await db.invitation.findFirst({
						where: {
							email: user.email.toLowerCase(),
							status: "pending",
							expiresAt: { gt: new Date() },
						},
						select: { id: true },
					});
					if (!invitation) {
						throw new APIError("FORBIDDEN", {
							message: "An invitation is required to create an account.",
						});
					}
				},
				async after(user) {
					// Users who sign up without a pending invitation (open signup or
					// the very first account) get their own workspace; invited users
					// join through the invitation instead.
					const invitation = await db.invitation.findFirst({
						where: {
							email: { equals: user.email, mode: "insensitive" },
							status: "pending",
							expiresAt: { gt: new Date() },
						},
						select: { id: true },
					});
					if (invitation) return;
					const orgId = randomUUID().replaceAll("-", "");
					await db.organization.create({
						data: {
							id: orgId,
							name: `${user.name}'s workspace`,
							slug: `workspace-${orgId.slice(0, 12)}`,
							members: {
								create: [
									{
										id: randomUUID().replaceAll("-", ""),
										userId: user.id,
										role: "owner",
									},
								],
							},
						},
					});
				},
			},
		},
	},
	emailAndPassword: {
		disableSignUp: env.AUTH_ALLOW_SIGNUP !== "true",
		enabled: true,
	},
	plugins: [
		magicLink({
			async sendMagicLink({ email, url }) {
				await sendEmail({
					to: email,
					subject: "Sign in to Task Manager",
					text: `Use this link to sign in to Task Manager:\n\n${url}\n\nThe link expires shortly. If you did not request it, ignore this email.`,
				});
			},
		}),
		organization({
			allowUserToCreateOrganization: false,
			async sendInvitationEmail(data) {
				const acceptUrl = new URL(
					`/accept-invitation/${data.id}`,
					env.BETTER_AUTH_URL,
				).toString();
				await sendEmail({
					to: data.email,
					subject: `${data.inviter.user.name} invited you to ${data.organization.name}`,
					text: `${data.inviter.user.name} invited you to join ${data.organization.name} on Task Manager.\n\nAccept the invitation:\n${acceptUrl}\n\nIf you did not expect this invitation, ignore this email.`,
				});
			},
		}),
	],
	secret: env.BETTER_AUTH_SECRET,
});

export async function requireSession() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) redirect("/login");
	return session;
}

export type OrgRole = "owner" | "admin" | "member";

export type SessionMember = {
	userId: string;
	userName: string;
	orgId: string;
	role: OrgRole;
};

function toOrgRole(role: string): OrgRole {
	return role === "owner" || role === "admin" ? role : "member";
}

export async function requireMember(): Promise<SessionMember> {
	const session = await requireSession();
	const membership = await db.member.findFirst({
		where: { userId: session.user.id },
		orderBy: { createdAt: "asc" },
		select: { organizationId: true, role: true },
	});
	if (!membership) {
		// Signed in but not yet in an organization: route invited users to
		// their pending invitation instead of bouncing them back to /login.
		const invitation = await db.invitation.findFirst({
			where: {
				email: { equals: session.user.email, mode: "insensitive" },
				status: "pending",
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		if (invitation) redirect(`/accept-invitation/${invitation.id}`);
		redirect("/no-access");
	}
	return {
		userId: session.user.id,
		userName: session.user.name,
		orgId: membership.organizationId,
		role: toOrgRole(membership.role),
	};
}
