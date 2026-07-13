"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "~/lib/auth-client";

export function SignOutButton() {
	const router = useRouter();
	const [isSigningOut, setIsSigningOut] = useState(false);

	async function signOut() {
		setIsSigningOut(true);
		await authClient.signOut();
		router.push("/login");
		router.refresh();
	}

	return (
		<button
			className="font-semibold text-sm underline underline-offset-4 disabled:opacity-60"
			disabled={isSigningOut}
			onClick={signOut}
			type="button"
		>
			{isSigningOut ? "Signing out..." : "Sign out"}
		</button>
	);
}
