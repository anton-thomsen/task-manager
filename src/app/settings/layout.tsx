import Link from "next/link";

import { requireMember } from "~/server/auth";

export default async function SettingsLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	await requireMember();
	return (
		<main className="mx-auto max-w-3xl p-4 sm:p-8">
			<Link
				className="font-semibold text-sm underline underline-offset-4"
				href="/"
			>
				← Back to board
			</Link>
			<header className="mt-3 mb-6 border-stone-900 border-b-2 pb-5">
				<p className="pixel-accent mb-2 text-[0.58rem] text-emerald-800 uppercase">
					Workspace settings
				</p>
				<h1 className="display-font font-black text-4xl sm:text-5xl">
					Settings
				</h1>
			</header>
			<nav aria-label="Settings sections" className="mb-6 flex flex-wrap gap-2">
				<Link
					className="rounded-full border border-stone-900 bg-white px-4 py-1.5 font-bold text-sm hover:bg-stone-900 hover:text-white"
					href="/settings/profile"
				>
					Profile
				</Link>
				<Link
					className="rounded-full border border-stone-900 bg-white px-4 py-1.5 font-bold text-sm hover:bg-stone-900 hover:text-white"
					href="/settings/members"
				>
					Members
				</Link>
				<Link
					className="rounded-full border border-stone-900 bg-white px-4 py-1.5 font-bold text-sm hover:bg-stone-900 hover:text-white"
					href="/settings/tokens"
				>
					Tokens
				</Link>
			</nav>
			{children}
		</main>
	);
}
