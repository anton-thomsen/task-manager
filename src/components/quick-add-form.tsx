"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { createTask } from "~/server/actions/tasks";

export function QuickAddForm() {
	const titleRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		if (!saved) titleRef.current?.focus();
	}, [saved]);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSaving(true);
		const form = event.currentTarget;
		try {
			const result = await createTask(new FormData(form));
			if (!result.ok) {
				setError(result.error);
				return;
			}
			form.reset();
			setSaved(true);
		} catch {
			setError("The task could not be added. Try again.");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<main className="mx-auto flex min-h-screen max-w-lg items-start px-4 py-10 sm:items-center sm:py-8">
			<section className="w-full rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[6px_6px_0_#1c1917] sm:p-7">
				<p className="pixel-accent mb-2 text-[0.55rem] text-emerald-800 uppercase">
					Quick capture
				</p>
				<h1 className="display-font font-black text-3xl">Add task</h1>
				{saved ? (
					<div aria-live="polite" className="mt-6">
						<p className="rounded-lg bg-emerald-100 p-4 font-semibold text-emerald-950">
							Task added to Inbox.
						</p>
						<div className="mt-5 flex flex-wrap gap-3">
							<button
								className="rounded-md border border-emerald-950 bg-emerald-700 px-4 py-2 font-bold text-white"
								onClick={() => setSaved(false)}
								type="button"
							>
								Add another
							</button>
							<Link
								className="rounded-md border border-stone-900 bg-white px-4 py-2 font-bold"
								href="/"
							>
								Open board
							</Link>
						</div>
					</div>
				) : (
					<form className="mt-6 space-y-4" onSubmit={handleSubmit}>
						<div>
							<label
								className="mb-1 block font-semibold text-sm"
								htmlFor="quick-title"
							>
								Title
							</label>
							<input
								autoCapitalize="sentences"
								autoComplete="off"
								className="w-full rounded-md border border-stone-900 bg-white px-3 py-3 text-base"
								id="quick-title"
								maxLength={200}
								name="title"
								ref={titleRef}
								required
							/>
						</div>
						<div>
							<label
								className="mb-1 block font-semibold text-sm"
								htmlFor="quick-deadline"
							>
								Deadline{" "}
								<span className="font-normal text-stone-600">(optional)</span>
							</label>
							<input
								className="w-full rounded-md border border-stone-900 bg-white px-3 py-3 text-base"
								id="quick-deadline"
								name="deadline"
								type="date"
							/>
						</div>
						{error ? (
							<p
								className="rounded-md bg-red-100 p-3 text-red-900 text-sm"
								role="alert"
							>
								{error}
							</p>
						) : null}
						<button
							className="w-full rounded-md border border-emerald-950 bg-emerald-700 px-4 py-3 font-bold text-white shadow-[2px_2px_0_#052e16] hover:bg-emerald-800 disabled:opacity-60"
							disabled={isSaving}
							type="submit"
						>
							{isSaving ? "Adding..." : "Add to Inbox"}
						</button>
						<Link
							className="block text-center font-semibold text-sm underline"
							href="/"
						>
							Cancel
						</Link>
					</form>
				)}
			</section>
		</main>
	);
}
