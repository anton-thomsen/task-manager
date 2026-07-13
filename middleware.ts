import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const exactPublicPaths = [
	"/login",
	"/signup",
	"/api/health",
	"/api/tasks",
	"/api/calendar.ics",
	"/manifest.webmanifest",
];

export function middleware(request: NextRequest) {
	const isPublic =
		exactPublicPaths.includes(request.nextUrl.pathname) ||
		request.nextUrl.pathname.startsWith("/api/auth/");
	if (isPublic || getSessionCookie(request)) return NextResponse.next();

	return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp)$).*)",
	],
};
