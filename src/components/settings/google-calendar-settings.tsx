"use client";

import { useState } from "react";

import { authClient } from "~/lib/auth-client";
import { disconnectGoogle } from "~/server/actions/integrations";

const buttonClass =
	"rounded-md border border-stone-900 bg-white px-3 py-1.5 font-bold text-sm hover:bg-stone-900 hover:text-white disabled:opacity-60";

type GoogleCalendarSettingsProps = {
	configured: boolean;
	connected: boolean;
	connectedSince: string | null;
	needsReconnect: boolean;
	lastSyncedAt: string | null;
};

export function GoogleCalendarSettings({
	configured,
	connected,
	connectedSince,
	needsReconnect,
	lastSyncedAt,
}: GoogleCalendarSettingsProps) {
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState<string | null>(null);

	async function connect() {
		setBusy(true);
		setStatus(null);
		const { error } = await authClient.linkSocial({
			provider: "google",
			callbackURL: "/settings/integrations",
			scopes: ["https://www.googleapis.com/auth/calendar.events"],
		});
		if (error) {
			setStatus(error.message ?? "Google could not be connected.");
			setBusy(false);
		}
	}

	async function disconnect() {
		setBusy(true);
		setStatus(null);
		const result = await disconnectGoogle();
		if (!result.ok) setStatus(result.error);
		setBusy(false);
	}

	return (
		<section className="rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[4px_4px_0_#1c1917]">
			<div className="flex items-center gap-2">
				<h2 className="display-font font-black text-2xl">Google Calendar</h2>
				{connected ? (
					needsReconnect ? (
						<span className="rounded-full border border-amber-700 bg-amber-50 px-2 py-0.5 font-bold text-amber-800 text-xs">
							Needs reconnect
						</span>
					) : (
						<span className="rounded-full border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800 text-xs">
							Connected
						</span>
					)
				) : null}
			</div>
			<p className="mt-1 text-sm text-stone-600">
				Deadlines for tasks you participate in appear as all-day events in your
				own Google Calendar and stay in sync as tasks change.
			</p>

			{!configured ? (
				<p className="mt-3 rounded-md border border-stone-300 bg-white p-3 text-sm text-stone-600">
					The server is not configured for Google yet. Set{" "}
					<code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>{" "}
					(see GOOGLE_CALENDAR.md).
				</p>
			) : connected ? (
				<div className="mt-3 space-y-3">
					<p className="text-sm">
						{needsReconnect
							? "Google rejected the stored access. Reconnect to resume syncing."
							: `Connected${connectedSince ? ` since ${connectedSince}` : ""}${
									lastSyncedAt ? ` · last synced ${lastSyncedAt}` : ""
								}.`}
					</p>
					<div className="flex flex-wrap gap-2">
						{needsReconnect ? (
							<button
								className={buttonClass}
								disabled={busy}
								onClick={connect}
								type="button"
							>
								{busy ? "Working..." : "Reconnect Google"}
							</button>
						) : null}
						<button
							className={buttonClass}
							disabled={busy}
							onClick={disconnect}
							type="button"
						>
							{busy ? "Working..." : "Disconnect"}
						</button>
					</div>
					<p className="text-stone-600 text-xs">
						Disconnecting removes the synced events from your calendar.
					</p>
				</div>
			) : (
				<button
					className={`${buttonClass} mt-3`}
					disabled={busy}
					onClick={connect}
					type="button"
				>
					{busy ? "Redirecting..." : "Connect Google Calendar"}
				</button>
			)}
			{status ? <p className="mt-3 text-sm">{status}</p> : null}
		</section>
	);
}
