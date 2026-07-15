import { notFound } from "next/navigation";

import { AcceptInvitationButton } from "~/components/accept-invitation-button";
import { requireSession } from "~/server/auth";
import { db } from "~/server/db";

export default async function AcceptInvitationPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await requireSession();
	const { id } = await params;
	if (!id || id.length > 100) notFound();

	const invitation = await db.invitation.findFirst({
		where: {
			id,
			email: { equals: session.user.email, mode: "insensitive" },
			status: "pending",
			expiresAt: { gt: new Date() },
		},
		select: {
			id: true,
			organization: { select: { name: true } },
			inviter: { select: { name: true } },
		},
	});
	if (!invitation) notFound();

	return (
		<main className="mx-auto flex min-h-screen max-w-md items-start px-4 py-12 sm:items-center sm:py-8">
			<section className="w-full rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[6px_6px_0_#1c1917] sm:p-7">
				<p className="pixel-accent mb-2 text-[0.55rem] text-emerald-800 uppercase">
					Task Manager
				</p>
				<h1 className="display-font font-black text-3xl">
					Join {invitation.organization.name}
				</h1>
				<p className="mt-2 text-sm text-stone-600">
					{invitation.inviter.name} invited you to collaborate in{" "}
					{invitation.organization.name}. Accepting gives you your own board and
					lets tasks be shared with you.
				</p>
				<div className="mt-6">
					<AcceptInvitationButton invitationId={invitation.id} />
				</div>
			</section>
		</main>
	);
}
