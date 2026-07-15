"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "~/lib/auth-client";

export function AcceptInvitationButton({
	invitationId,
}: {
	invitationId: string;
}) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [isAccepting, setIsAccepting] = useState(false);

	async function accept() {
		setIsAccepting(true);
		setError(null);
		try {
			const result = await authClient.organization.acceptInvitation({
				invitationId,
			});
			if (result.error) {
				setError("The invitation could not be accepted. Ask for a new one.");
				return;
			}
			router.push("/");
			router.refresh();
		} catch {
			setError("The invitation could not be accepted. Try again.");
		} finally {
			setIsAccepting(false);
		}
	}

	return (
		<div>
			<button
				className="w-full rounded-md border border-emerald-950 bg-emerald-700 px-4 py-2.5 font-bold text-white shadow-[2px_2px_0_#052e16] hover:bg-emerald-800 disabled:opacity-60"
				disabled={isAccepting}
				onClick={accept}
				type="button"
			>
				{isAccepting ? "Joining..." : "Accept invitation"}
			</button>
			{error ? (
				<p
					className="mt-3 rounded-md bg-red-100 p-3 text-red-900 text-sm"
					role="alert"
				>
					{error}
				</p>
			) : null}
		</div>
	);
}
