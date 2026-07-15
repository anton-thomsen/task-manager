"use client";

import { useState } from "react";

import { updateProfile, uploadAvatar } from "~/server/actions/profile";

const inputClass =
	"w-full rounded-md border border-stone-900 bg-white px-3 py-2 text-base";
const buttonClass =
	"rounded-md border border-emerald-950 bg-emerald-700 px-4 py-2 font-bold text-sm text-white shadow-[2px_2px_0_#052e16] hover:bg-emerald-800 disabled:opacity-60";

type ProfileSettingsProps = {
	name: string;
	email: string;
	image: string | null;
};

export function ProfileSettings({ name, email, image }: ProfileSettingsProps) {
	const [nameStatus, setNameStatus] = useState<string | null>(null);
	const [avatarStatus, setAvatarStatus] = useState<string | null>(null);
	const [isSavingName, setIsSavingName] = useState(false);
	const [isSavingAvatar, setIsSavingAvatar] = useState(false);
	const [avatarVersion, setAvatarVersion] = useState(0);

	async function handleName(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSavingName(true);
		setNameStatus(null);
		const result = await updateProfile(new FormData(event.currentTarget));
		setNameStatus(result.ok ? "Saved." : result.error);
		setIsSavingName(false);
	}

	async function handleAvatar(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		setIsSavingAvatar(true);
		setAvatarStatus(null);
		const result = await uploadAvatar(new FormData(form));
		setAvatarStatus(result.ok ? "Avatar updated." : result.error);
		setIsSavingAvatar(false);
		if (result.ok) {
			form.reset();
			setAvatarVersion((version) => version + 1);
		}
	}

	return (
		<div className="space-y-5">
			<section className="rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[4px_4px_0_#1c1917]">
				<h2 className="display-font font-black text-2xl">Profile</h2>
				<p className="mt-1 text-sm text-stone-600">
					Signed in as <span className="font-semibold">{email}</span>
				</p>
				<form className="mt-4 space-y-3" onSubmit={handleName}>
					<div>
						<label className="mb-1 block font-semibold text-sm" htmlFor="name">
							Display name
						</label>
						<input
							className={inputClass}
							defaultValue={name}
							id="name"
							maxLength={100}
							name="name"
							required
						/>
					</div>
					{nameStatus ? <p className="text-sm">{nameStatus}</p> : null}
					<button className={buttonClass} disabled={isSavingName} type="submit">
						{isSavingName ? "Saving..." : "Save name"}
					</button>
				</form>
			</section>

			<section className="rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[4px_4px_0_#1c1917]">
				<h2 className="display-font font-black text-2xl">Profile picture</h2>
				<div className="mt-4 flex items-center gap-4">
					{image ? (
						<img
							alt="Your avatar"
							className="size-16 rounded-full border-2 border-stone-900 object-cover"
							src={`${image}?v=${avatarVersion}`}
						/>
					) : (
						<div className="grid size-16 place-items-center rounded-full border-2 border-stone-900 bg-emerald-700 font-bold text-white text-xl">
							{name.slice(0, 1).toUpperCase()}
						</div>
					)}
					<form className="space-y-3" onSubmit={handleAvatar}>
						<input
							accept="image/png,image/jpeg,image/gif,image/webp"
							className="block text-sm"
							name="avatar"
							required
							type="file"
						/>
						{avatarStatus ? <p className="text-sm">{avatarStatus}</p> : null}
						<button
							className={buttonClass}
							disabled={isSavingAvatar}
							type="submit"
						>
							{isSavingAvatar ? "Uploading..." : "Upload avatar"}
						</button>
					</form>
				</div>
			</section>
		</div>
	);
}
