"use client";

import { ImageIcon } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { hoursInputValue } from "~/lib/format";
import { addLog } from "~/server/actions/logs";

export type WorkLogPrefill = {
	note: string;
	estimatedHours: number | null;
	subtaskId: number;
};

export function WorkLogForm({
	taskId,
	prefill,
	onDone,
}: {
	taskId: number;
	prefill?: WorkLogPrefill;
	onDone?: () => void;
}) {
	const formRef = useRef<HTMLFormElement>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		setError(null);
		setIsSubmitting(true);
		try {
			const result = await addLog(formData);
			if (!result.ok) {
				setError(result.error);
				return;
			}
			formRef.current?.reset();
			onDone?.();
		} catch {
			setError("The work log entry could not be added.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form
			className="space-y-4 rounded-2xl border-2 border-stone-900 bg-[#f0d7b5] p-4 shadow-[4px_4px_0_#1c1917] sm:p-6"
			onSubmit={submit}
			ref={formRef}
		>
			<input name="taskId" type="hidden" value={taskId} />
			{prefill ? (
				<input name="subtaskId" type="hidden" value={prefill.subtaskId} />
			) : null}
			<div className="grid gap-4 sm:grid-cols-[1fr_8rem_8rem]">
				<label className="space-y-1 font-semibold text-sm">
					<span>What did you do?</span>
					<input
						className="w-full rounded-md border border-stone-900 bg-white px-3 py-2"
						defaultValue={prefill?.note}
						maxLength={240}
						name="note"
						placeholder="A short description of the work"
						required
					/>
				</label>
				<label className="space-y-1 font-semibold text-sm">
					<span>Estimated (hours)</span>
					<input
						className="w-full rounded-md border border-stone-900 bg-white px-3 py-2"
						defaultValue={hoursInputValue(prefill?.estimatedHours)}
						min={0.01}
						name="estimatedHours"
						placeholder="N/A"
						step={0.01}
						type="number"
					/>
				</label>
				<label className="space-y-1 font-semibold text-sm">
					<span>Time spent (hours)</span>
					<input
						className="w-full rounded-md border border-stone-900 bg-white px-3 py-2"
						min={0.01}
						name="hoursSpent"
						placeholder="e.g. 2.5"
						required
						step={0.01}
						type="number"
					/>
				</label>
			</div>
			<label className="block space-y-1 font-semibold text-sm">
				<span>Detailed notes</span>
				<textarea
					className="min-h-52 w-full resize-y rounded-md border border-stone-900 bg-white px-3 py-2 font-normal leading-relaxed"
					maxLength={20_000}
					name="details"
					placeholder="Decisions, implementation details, problems, results, and anything useful for picking this work up again..."
					rows={9}
				/>
			</label>
			<label className="block space-y-1 font-semibold text-sm">
				<span className="flex items-center gap-2">
					<ImageIcon aria-hidden="true" size={17} /> Pictures
				</span>
				<input
					accept="image/png,image/jpeg,image/gif,image/webp"
					className="block w-full rounded-md border border-stone-900 bg-white px-3 py-2 font-normal text-sm file:mr-3 file:rounded file:border-0 file:bg-stone-900 file:px-3 file:py-1 file:font-semibold file:text-white"
					multiple
					name="images"
					type="file"
				/>
				<span className="block font-normal text-stone-600 text-xs">
					Up to 5 PNG, JPEG, GIF, or WebP images. Maximum 5 MB each and 15 MB
					total. Maximum 8192 × 8192 pixels and 20 megapixels per image.
				</span>
			</label>
			{error ? (
				<p
					className="rounded-md bg-red-100 p-3 text-red-900 text-sm"
					role="alert"
				>
					{error}
				</p>
			) : null}
			<div className="flex justify-end gap-2">
				{prefill ? (
					<button
						className="rounded-md border border-stone-900 bg-white px-5 py-2 font-semibold text-sm"
						onClick={() => onDone?.()}
						type="button"
					>
						Skip
					</button>
				) : null}
				<button
					className="rounded-md bg-emerald-700 px-5 py-2 font-semibold text-sm text-white disabled:opacity-50"
					disabled={isSubmitting}
					type="submit"
				>
					{isSubmitting ? "Saving..." : "Add work log"}
				</button>
			</div>
		</form>
	);
}
