"use client";

import { useState } from "react";

import { regenerateToken } from "~/server/actions/profile";

const buttonClass =
	"rounded-md border border-stone-900 bg-white px-3 py-1.5 font-bold text-sm hover:bg-stone-900 hover:text-white disabled:opacity-60";

type TokenSettingsProps = {
	calendarUrl: string | null;
	apiToken: string | null;
};

export function TokenSettings({ calendarUrl, apiToken }: TokenSettingsProps) {
	const [status, setStatus] = useState<string | null>(null);
	const [busyKind, setBusyKind] = useState<"calendar" | "api" | null>(null);

	async function regenerate(kind: "calendar" | "api") {
		setBusyKind(kind);
		setStatus(null);
		const result = await regenerateToken(kind);
		if (!result.ok) setStatus(result.error);
		setBusyKind(null);
	}

	return (
		<div className="space-y-5">
			<section className="rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[4px_4px_0_#1c1917]">
				<h2 className="display-font font-black text-2xl">Calendar feed</h2>
				<p className="mt-1 text-sm text-stone-600">
					Subscribe to this URL from Google Calendar ("Add calendar from URL")
					to see deadlines for tasks you participate in. Regenerating breaks the
					old URL.
				</p>
				{calendarUrl ? (
					<code className="mt-3 block overflow-x-auto rounded-md border border-stone-300 bg-white p-2 text-xs">
						{calendarUrl}
					</code>
				) : (
					<p className="mt-3 text-sm">No feed token yet. Generate one below.</p>
				)}
				<button
					className={`${buttonClass} mt-3`}
					disabled={busyKind === "calendar"}
					onClick={() => regenerate("calendar")}
					type="button"
				>
					{busyKind === "calendar"
						? "Working..."
						: calendarUrl
							? "Regenerate feed URL"
							: "Generate feed URL"}
				</button>
			</section>

			<section className="rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[4px_4px_0_#1c1917]">
				<h2 className="display-font font-black text-2xl">
					Quick-add API token
				</h2>
				<p className="mt-1 text-sm text-stone-600">
					Use as a Bearer token with <code>POST /api/tasks</code> (phone
					shortcuts, automations). Tasks are created as you.
				</p>
				{apiToken ? (
					<code className="mt-3 block overflow-x-auto rounded-md border border-stone-300 bg-white p-2 text-xs">
						{apiToken}
					</code>
				) : (
					<p className="mt-3 text-sm">No API token yet. Generate one below.</p>
				)}
				<button
					className={`${buttonClass} mt-3`}
					disabled={busyKind === "api"}
					onClick={() => regenerate("api")}
					type="button"
				>
					{busyKind === "api"
						? "Working..."
						: apiToken
							? "Regenerate token"
							: "Generate token"}
				</button>
			</section>
			{status ? <p className="text-sm">{status}</p> : null}
		</div>
	);
}
