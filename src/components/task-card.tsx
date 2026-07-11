"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { formatDeadline, formatEstimateRange } from "~/lib/format";
import type { LabelOption, TaskOption } from "~/lib/tasks";
import { deleteTask, setArchived } from "~/server/actions/tasks";
import { TaskForm, type TaskFormValue } from "./task-form";

export type TaskCardValue = TaskFormValue & {
	client: TaskOption | null;
	label: LabelOption | null;
	archivedAt: string | null;
	subtaskCount: number;
	finishedSubtaskCount: number;
	logCount: number;
	overdue: boolean;
};

type TaskCardProps = {
	clients: TaskOption[];
	labels: LabelOption[];
	task: TaskCardValue;
};

export function TaskCard({ clients, labels, task }: TaskCardProps) {
	const deleteDialogRef = useRef<HTMLDialogElement>(null);
	const [isWorking, setIsWorking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const estimate = formatEstimateRange(
		task.estimateMinMinutes,
		task.estimateMaxMinutes,
	);

	async function archive(archived: boolean): Promise<boolean> {
		setIsWorking(true);
		setError(null);
		try {
			const result = await setArchived(task.id, archived);
			if (!result.ok) {
				setError(result.error);
				return false;
			}
			return true;
		} finally {
			setIsWorking(false);
		}
	}

	async function remove() {
		setIsWorking(true);
		setError(null);
		try {
			const result = await deleteTask(task.id);
			if (!result.ok) {
				setError(result.error);
				return;
			}
			deleteDialogRef.current?.close();
		} finally {
			setIsWorking(false);
		}
	}

	return (
		<article
			className={`space-y-2 rounded-xl border-2 border-stone-900 p-3 shadow-[3px_3px_0_#1c1917] ${task.archivedAt ? "bg-stone-200 opacity-70" : "bg-[#fffdf6]"}`}
		>
			<div className="flex items-start justify-between gap-2">
				<Link
					className="font-bold leading-tight underline decoration-2 decoration-emerald-700 underline-offset-4"
					href={`/tasks/${task.id}`}
				>
					{task.title}
				</Link>
				{task.label ? (
					<span
						className="rounded-full border border-stone-900 px-2 py-0.5 font-bold text-[0.68rem]"
						style={{ backgroundColor: task.label.color }}
					>
						{task.label.name}
					</span>
				) : null}
			</div>
			{task.client ? (
				<p className="font-semibold text-stone-600 text-xs">
					{task.client.name}
				</p>
			) : null}
			<div className="flex flex-wrap gap-x-3 gap-y-1 text-stone-600 text-xs">
				{task.deadline ? (
					<span className={task.overdue ? "font-bold text-red-700" : ""}>
						Due {formatDeadline(task.deadline)}
					</span>
				) : null}
				{estimate ? <span>{estimate} est.</span> : null}
				{task.subtaskCount > 0 ? (
					<span>
						{task.finishedSubtaskCount}/{task.subtaskCount} subtasks
					</span>
				) : null}
			</div>
			<div className="flex flex-wrap gap-1.5 pt-1">
				<TaskForm clients={clients} labels={labels} task={task} />
				<button
					className="rounded border border-stone-900 bg-white px-2 py-1 font-semibold text-xs hover:bg-stone-100"
					disabled={isWorking}
					onClick={() => archive(!task.archivedAt)}
					type="button"
				>
					{task.archivedAt ? "Restore" : "Archive"}
				</button>
				<button
					className="rounded border border-red-950 bg-red-600 px-2 py-1 font-semibold text-white text-xs hover:bg-red-700"
					disabled={isWorking}
					onClick={() => deleteDialogRef.current?.showModal()}
					type="button"
				>
					Delete
				</button>
			</div>
			{error ? (
				<p className="text-red-800 text-xs" role="alert">
					{error}
				</p>
			) : null}

			<dialog
				aria-labelledby={`delete-title-${task.id}`}
				className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[8px_8px_0_#1c1917] backdrop:bg-black/50"
				ref={deleteDialogRef}
			>
				<h2 className="font-bold text-xl" id={`delete-title-${task.id}`}>
					Delete “{task.title}”?
				</h2>
				<p className="mt-2 text-sm text-stone-700">
					This permanently removes the task, its {task.subtaskCount} subtasks,
					and {task.logCount} log entries. Archiving hides it instead.
				</p>
				<div className="mt-5 flex flex-wrap gap-2">
					<button
						className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-sm text-white"
						disabled={isWorking}
						onClick={remove}
						type="button"
					>
						Delete permanently
					</button>
					<button
						className="rounded-lg border border-stone-900 bg-white px-3 py-2 font-semibold text-sm"
						disabled={isWorking}
						onClick={() =>
							archive(true).then((success) => {
								if (success) deleteDialogRef.current?.close();
							})
						}
						type="button"
					>
						Archive instead
					</button>
					<button
						className="ml-auto rounded-lg border border-stone-900 bg-white px-3 py-2 text-sm"
						onClick={() => deleteDialogRef.current?.close()}
						type="button"
					>
						Cancel
					</button>
				</div>
			</dialog>
		</article>
	);
}
