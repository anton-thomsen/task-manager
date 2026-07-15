import { SignOutButton } from "~/components/sign-out-button";
import { requireSession } from "~/server/auth";

export default async function NoAccessPage() {
	const session = await requireSession();
	return (
		<main className="mx-auto flex min-h-screen max-w-md items-start px-4 py-12 sm:items-center sm:py-8">
			<section className="w-full rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[6px_6px_0_#1c1917] sm:p-7">
				<p className="pixel-accent mb-2 text-[0.55rem] text-emerald-800 uppercase">
					Task Manager
				</p>
				<h1 className="display-font font-black text-3xl">No workspace yet</h1>
				<p className="mt-2 text-sm text-stone-600">
					{session.user.email} is signed in but does not belong to a workspace.
					Ask an owner to send you an invitation, then open the link from that
					email.
				</p>
				<div className="mt-6">
					<SignOutButton />
				</div>
			</section>
		</main>
	);
}
