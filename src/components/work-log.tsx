"use client";

import { ImageIcon, Trash2 } from "lucide-react";
import Image from "next/image";
import { type FormEvent, useRef, useState } from "react";

import { formatHours } from "~/lib/format";
import { addLog, deleteLog } from "~/server/actions/logs";
import { LocalizedTime } from "./localized-time";

type LogImage = {
	id: number;
	fileName: string;
};

type Log = {
	id: number;
	note: string;
	details: string | null;
	hoursSpent: number | null;
	createdAt: string;
	images: LogImage[];
};

export function WorkLog({ logs, taskId }: { logs: Log[]; taskId: number }) {
	const formRef = useRef<HTMLFormElement>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [deletingId, setDeletingId] = useState<number | null>(null);

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
		} catch {
			setError("The work log entry could not be added.");
		} finally {
			setIsSubmitting(false);
		}
	}

	async function remove(log: Log) {
		if (!window.confirm(`Delete the work log entry “${log.note}”?`)) return;
		setError(null);
		setDeletingId(log.id);
		try {
			const result = await deleteLog(log.id);
			if (!result.ok) setError(result.error);
		} catch {
			setError("The work log entry could not be deleted.");
		} finally {
			setDeletingId(null);
		}
	}

	return (
		<section className="space-y-5">
			<div>
				<h2 className="font-bold text-2xl">Work log</h2>
				<p className="mt-1 text-sm text-stone-600">
					Capture what changed, the time it took, and the context you will need
					later.
				</p>
			</div>
			<form
				className="space-y-4 rounded-2xl border-2 border-stone-900 bg-[#f0d7b5] p-4 shadow-[4px_4px_0_#1c1917] sm:p-6"
				onSubmit={submit}
				ref={formRef}
			>
				<input name="taskId" type="hidden" value={taskId} />
				<div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
					<label className="space-y-1 font-semibold text-sm">
						<span>What did you do?</span>
						<input
							className="w-full rounded-md border border-stone-900 bg-white px-3 py-2"
							maxLength={240}
							name="note"
							placeholder="A short description of the work"
							required
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
				<div className="flex justify-end">
					<button
						className="rounded-md bg-emerald-700 px-5 py-2 font-semibold text-sm text-white disabled:opacity-50"
						disabled={isSubmitting}
						type="submit"
					>
						{isSubmitting ? "Saving..." : "Add work log"}
					</button>
				</div>
			</form>

			<div className="space-y-3">
				{logs.length === 0 ? (
					<p className="rounded-xl border-2 border-stone-500 border-dashed bg-white/40 p-8 text-center text-sm text-stone-600">
						No work logged yet.
					</p>
				) : null}
				{logs.map((log) => (
					<article
						className="rounded-xl border-2 border-stone-900 bg-[#fffdf6] p-4 shadow-[3px_3px_0_#1c1917] sm:p-5"
						key={log.id}
					>
						<header className="flex items-start justify-between gap-4">
							<div>
								<p className="text-stone-500 text-xs">
									<LocalizedTime iso={log.createdAt} />
									{log.hoursSpent ? ` · ${formatHours(log.hoursSpent)}` : ""}
								</p>
								<h3 className="mt-1 font-bold text-lg">{log.note}</h3>
							</div>
							<button
								aria-label={`Delete work log: ${log.note}`}
								className="ghost-icon-button shrink-0 text-red-700 hover:bg-red-100"
								disabled={deletingId === log.id}
								onClick={() => remove(log)}
								title="Delete work log"
								type="button"
							>
								<Trash2 aria-hidden="true" size={17} />
							</button>
						</header>
						{log.details ? (
							<p className="mt-4 whitespace-pre-wrap border-stone-300 border-t pt-4 text-sm leading-relaxed">
								{log.details}
							</p>
						) : null}
						{log.images.length > 0 ? (
							<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								{log.images.map((image) => (
									<a
										className="overflow-hidden rounded-lg border border-stone-900 bg-stone-100"
										href={`/api/work-log-images/${image.id}`}
										key={image.id}
										rel="noreferrer"
										target="_blank"
									>
										<Image
											alt={image.fileName}
											className="h-48 w-full object-cover"
											height={600}
											src={`/api/work-log-images/${image.id}`}
											unoptimized
											width={800}
										/>
										<span className="block truncate border-stone-900 border-t bg-white px-2 py-1 text-xs">
											{image.fileName}
										</span>
									</a>
								))}
							</div>
						) : null}
					</article>
				))}
			</div>
		</section>
	);
}
