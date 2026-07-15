"use client";

import { ArchiveRestore, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { formatHours } from "~/lib/format";
import type { LabelOption, TaskOption } from "~/lib/tasks";
import { deleteTask, setArchived } from "~/server/actions/tasks";

export type ArchivedTaskValue = {
	id: number;
	title: string;
	archivedAt: string;
	archivedLabel: string;
	client: TaskOption | null;
	label: LabelOption | null;
	logCount: number;
	totalLogged: number;
	subtaskCount: number;
};

export function ArchivedTaskRow({ task }: { task: ArchivedTaskValue }) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function restore() {
		setPending(true);
		const result = await setArchived(task.id, false);
		if (!result.ok) setError(result.error);
		setPending(false);
	}

	async function remove() {
		setPending(true);
		const result = await deleteTask(task.id);
		if (!result.ok) {
			setError(result.error);
			setPending(false);
			return;
		}
		dialogRef.current?.close();
	}

	return (
		<article className="rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_#1c1917]">
			<div className="flex items-start gap-4">
				<div className="min-w-0 flex-1">
					<Link
						className="display-font font-bold text-xl underline decoration-emerald-700 underline-offset-4"
						href={`/tasks/${task.id}`}
					>
						{task.title}
					</Link>
					<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-stone-600 text-xs">
						<span>Archived {task.archivedLabel}</span>
						{task.client ? <span>{task.client.name}</span> : null}
						{task.label ? (
							<span
								className="rounded-full border border-stone-700 px-2"
								style={{ backgroundColor: task.label.color }}
							>
								{task.label.name}
							</span>
						) : null}
						<span>
							{task.logCount} logs · {formatHours(task.totalLogged)}
						</span>
					</div>
				</div>
				<button
					aria-label="Restore task"
					className="ghost-icon-button"
					disabled={pending}
					onClick={restore}
					title="Restore task"
					type="button"
				>
					<ArchiveRestore aria-hidden="true" size={17} />
				</button>
				<button
					aria-label="Delete task"
					className="ghost-icon-button text-red-700 hover:bg-red-100"
					disabled={pending}
					onClick={() => dialogRef.current?.showModal()}
					title="Delete task"
					type="button"
				>
					<Trash2 aria-hidden="true" size={17} />
				</button>
			</div>
			{error ? (
				<p className="mt-2 text-red-800 text-sm" role="alert">
					{error}
				</p>
			) : null}
			<dialog
				aria-labelledby={`archived-delete-${task.id}`}
				className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[8px_8px_0_#1c1917] backdrop:bg-black/50"
				ref={dialogRef}
			>
				<h2 className="font-bold text-xl" id={`archived-delete-${task.id}`}>
					Delete “{task.title}”?
				</h2>
				<p className="mt-2 text-sm text-stone-600">
					This permanently removes its {task.subtaskCount} subtasks and{" "}
					{task.logCount} logs.
				</p>
				<div className="mt-5 flex justify-end gap-2">
					<button
						className="rounded-lg border border-stone-900 bg-white px-3 py-2 text-sm"
						onClick={() => dialogRef.current?.close()}
						type="button"
					>
						Cancel
					</button>
					<button
						className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-sm text-white"
						disabled={pending}
						onClick={remove}
						type="button"
					>
						Delete permanently
					</button>
				</div>
			</dialog>
		</article>
	);
}
