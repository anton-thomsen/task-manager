import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "~/env";
import { db } from "~/server/db";

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	database: prismaAdapter(db, { provider: "postgresql" }),
	emailAndPassword: {
		disableSignUp: env.AUTH_ALLOW_SIGNUP !== "true",
		enabled: true,
	},
	secret: env.BETTER_AUTH_SECRET,
});

export async function requireSession() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) redirect("/login");
	return session;
}
