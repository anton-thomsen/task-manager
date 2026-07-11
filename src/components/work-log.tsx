"use client";

import { useState } from "react";

import { addLog } from "~/server/actions/logs";
import { LocalizedTime } from "./localized-time";

type Log = {
	id: number;
	note: string;
	minutesSpent: number | null;
	createdAt: string;
};

type FinishedSubtask = {
	id: number;
	title: string;
	createdAt: string;
};

export function WorkLog({
	logs,
	finishedSubtasks,
	taskId,
}: {
	logs: Log[];
	finishedSubtasks: FinishedSubtask[];
	taskId: number;
}) {
	const [error, setError] = useState<string | null>(null);
	const feed = [
		...logs.map((log) => ({
			kind: "log" as const,
			id: log.id,
			text: log.note,
			minutesSpent: log.minutesSpent,
			createdAt: log.createdAt,
		})),
		...finishedSubtasks.map((subtask) => ({
			kind: "subtask" as const,
			id: subtask.id,
			text: subtask.title,
			minutesSpent: null,
			createdAt: subtask.createdAt,
		})),
	].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

	async function submit(formData: FormData) {
		setError(null);
		try {
			await addLog(formData);
		} catch {
			setError("The work log entry could not be added.");
		}
	}

	return (
		<section className="rounded-2xl border-2 border-stone-900 bg-[#f0d7b5] p-4 shadow-[4px_4px_0_#1c1917]">
			<h2 className="mb-3 font-bold text-xl">Work log</h2>
			<form
				action={submit}
				className="mb-4 grid grid-cols-[1fr_5rem_auto] gap-2"
			>
				<input name="taskId" type="hidden" value={taskId} />
				<input
					aria-label="Work log note"
					className="min-w-0 rounded-md border border-stone-900 bg-white px-2 py-1.5 text-sm"
					maxLength={2000}
					name="note"
					placeholder="What did you just do?"
					required
				/>
				<input
					aria-label="Minutes spent"
					className="min-w-0 rounded-md border border-stone-900 bg-white px-2 py-1.5 text-sm"
					max={1440}
					min={1}
					name="minutesSpent"
					placeholder="min"
					type="number"
				/>
				<button
					className="rounded-md bg-emerald-700 px-3 font-semibold text-sm text-white"
					type="submit"
				>
					Log
				</button>
			</form>
			{error ? (
				<p className="mb-3 text-red-800 text-sm" role="alert">
					{error}
				</p>
			) : null}
			<div className="space-y-2">
				{feed.length === 0 ? (
					<p className="rounded-lg border border-stone-500 border-dashed bg-white/40 p-4 text-center text-sm text-stone-600">
						No work logged yet.
					</p>
				) : null}
				{feed.map((item) => (
					<article
						className={`rounded-lg border border-stone-900 p-3 ${item.kind === "subtask" ? "bg-emerald-50" : "bg-[#fffdf6]"}`}
						key={`${item.kind}-${item.id}`}
					>
						<p className="mb-1 text-stone-500 text-xs">
							<LocalizedTime iso={item.createdAt} />
							{item.minutesSpent ? ` · ${item.minutesSpent}m` : ""}
						</p>
						<p className="whitespace-pre-wrap text-sm">
							{item.kind === "subtask" ? "✓ Subtask finished · " : ""}
							{item.text}
						</p>
					</article>
				))}
			</div>
		</section>
	);
}
