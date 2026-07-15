"use client";

import { useState } from "react";

import { cancelInvitation, inviteMember } from "~/server/actions/members";

const inputClass =
	"w-full rounded-md border border-stone-900 bg-white px-3 py-2 text-base";
const buttonClass =
	"rounded-md border border-emerald-950 bg-emerald-700 px-4 py-2 font-bold text-sm text-white shadow-[2px_2px_0_#052e16] hover:bg-emerald-800 disabled:opacity-60";

export type MemberRow = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	role: string;
};

export type InvitationRow = {
	id: string;
	email: string;
	expiresAt: string;
};

type MembersSettingsProps = {
	members: MemberRow[];
	invitations: InvitationRow[];
	canInvite: boolean;
};

export function MembersSettings({
	members,
	invitations,
	canInvite,
}: MembersSettingsProps) {
	const [status, setStatus] = useState<string | null>(null);
	const [isInviting, setIsInviting] = useState(false);
	const [cancelingId, setCancelingId] = useState<string | null>(null);

	async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		setIsInviting(true);
		setStatus(null);
		const result = await inviteMember(new FormData(form));
		setStatus(result.ok ? "Invitation sent." : result.error);
		setIsInviting(false);
		if (result.ok) form.reset();
	}

	async function handleCancel(id: string) {
		setCancelingId(id);
		setStatus(null);
		const result = await cancelInvitation(id);
		if (!result.ok) setStatus(result.error);
		setCancelingId(null);
	}

	return (
		<div className="space-y-5">
			<section className="rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[4px_4px_0_#1c1917]">
				<h2 className="display-font font-black text-2xl">Members</h2>
				<ul className="mt-4 space-y-3">
					{members.map((member) => (
						<li className="flex items-center gap-3" key={member.id}>
							{member.image ? (
								<img
									alt=""
									className="size-10 rounded-full border-2 border-stone-900 object-cover"
									src={member.image}
								/>
							) : (
								<div className="grid size-10 place-items-center rounded-full border-2 border-stone-900 bg-emerald-700 font-bold text-white">
									{member.name.slice(0, 1).toUpperCase()}
								</div>
							)}
							<div className="min-w-0">
								<p className="font-semibold">{member.name}</p>
								<p className="truncate text-sm text-stone-600">
									{member.email}
								</p>
							</div>
							<span className="ml-auto rounded-full bg-stone-900 px-2 py-1 font-bold text-white text-xs uppercase">
								{member.role}
							</span>
						</li>
					))}
				</ul>
			</section>

			{canInvite ? (
				<section className="rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[4px_4px_0_#1c1917]">
					<h2 className="display-font font-black text-2xl">Invite someone</h2>
					<p className="mt-1 text-sm text-stone-600">
						They get an email with a link; the magic-link sign-in creates their
						account when they accept.
					</p>
					<form
						className="mt-4 flex flex-wrap items-end gap-3"
						onSubmit={handleInvite}
					>
						<div className="min-w-0 grow">
							<label
								className="mb-1 block font-semibold text-sm"
								htmlFor="invite-email"
							>
								Email
							</label>
							<input
								className={inputClass}
								id="invite-email"
								inputMode="email"
								maxLength={200}
								name="email"
								required
								type="email"
							/>
						</div>
						<button className={buttonClass} disabled={isInviting} type="submit">
							{isInviting ? "Sending..." : "Send invite"}
						</button>
					</form>
					{status ? <p className="mt-3 text-sm">{status}</p> : null}
					{invitations.length > 0 ? (
						<ul className="mt-4 space-y-2 border-stone-300 border-t pt-4">
							{invitations.map((invitation) => (
								<li
									className="flex flex-wrap items-center gap-3"
									key={invitation.id}
								>
									<span className="min-w-0 truncate font-semibold text-sm">
										{invitation.email}
									</span>
									<span className="text-stone-600 text-xs">
										expires {invitation.expiresAt}
									</span>
									<button
										className="ml-auto font-semibold text-red-800 text-sm underline underline-offset-4 disabled:opacity-60"
										disabled={cancelingId === invitation.id}
										onClick={() => handleCancel(invitation.id)}
										type="button"
									>
										{cancelingId === invitation.id ? "Canceling..." : "Cancel"}
									</button>
								</li>
							))}
						</ul>
					) : null}
				</section>
			) : null}
		</div>
	);
}
