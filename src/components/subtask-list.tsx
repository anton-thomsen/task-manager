"use client";

import { useState } from "react";

import type { TaskStatus } from "~/lib/tasks";
import { taskStatuses } from "~/lib/tasks";
import {
	createSubtask,
	deleteSubtask,
	updateSubtaskStatus,
} from "~/server/actions/subtasks";

type Subtask = {
	id: number;
	title: string;
	status: TaskStatus;
	estimatedMinutes: number | null;
};

export function SubtaskList({
	subtasks,
	taskId,
}: {
	subtasks: Subtask[];
	taskId: number;
}) {
	const [error, setError] = useState<string | null>(null);
	const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
	const [statusOverrides, setStatusOverrides] = useState<
		Record<number, TaskStatus>
	>({});
	const completed = subtasks.filter(
		({ status }) => status === "Finished",
	).length;
	const remainingMinutes = subtasks.reduce(
		(total, subtask) =>
			subtask.status === "Finished"
				? total
				: total + (subtask.estimatedMinutes ?? 0),
		0,
	);

	async function submit(formData: FormData) {
		setError(null);
		try {
			await createSubtask(formData);
		} catch {
			setError("The subtask could not be added.");
		}
	}

	async function changeStatus(subtask: Subtask, status: TaskStatus) {
		setError(null);
		setStatusOverrides((current) => ({ ...current, [subtask.id]: status }));
		setPendingIds((current) => new Set(current).add(subtask.id));
		try {
			await updateSubtaskStatus(subtask.id, status);
		} catch {
			setStatusOverrides((current) => {
				const next = { ...current };
				delete next[subtask.id];
				return next;
			});
			setError("The subtask status could not be updated.");
		} finally {
			setPendingIds((current) => {
				const next = new Set(current);
				next.delete(subtask.id);
				return next;
			});
		}
	}

	async function removeSubtask(subtask: Subtask) {
		setError(null);
		setPendingIds((current) => new Set(current).add(subtask.id));
		try {
			await deleteSubtask(subtask.id);
		} catch {
			setError("The subtask could not be deleted.");
		} finally {
			setPendingIds((current) => {
				const next = new Set(current);
				next.delete(subtask.id);
				return next;
			});
		}
	}

	return (
		<section className="rounded-2xl border-2 border-stone-900 bg-[#dfe5cc] p-4 shadow-[4px_4px_0_#1c1917]">
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<h2 className="font-bold text-xl">Subtasks</h2>
				<p className="text-stone-600 text-xs">
					{completed}/{subtasks.length} done · {remainingMinutes}m left
				</p>
			</div>
			<form
				action={submit}
				className="mb-4 grid grid-cols-[1fr_5rem_auto] gap-2"
			>
				<input name="taskId" type="hidden" value={taskId} />
				<input
					aria-label="Subtask title"
					className="min-w-0 rounded-md border border-stone-900 bg-white px-2 py-1.5 text-sm"
					maxLength={200}
					name="title"
					placeholder="Next small step"
					required
				/>
				<input
					aria-label="Estimated minutes"
					className="min-w-0 rounded-md border border-stone-900 bg-white px-2 py-1.5 text-sm"
					max={300}
					min={1}
					name="estimatedMinutes"
					placeholder="min"
					type="number"
				/>
				<button
					className="rounded-md bg-emerald-700 px-3 font-semibold text-sm text-white"
					type="submit"
				>
					Add
				</button>
			</form>
			{error ? (
				<p className="mb-3 text-red-800 text-sm" role="alert">
					{error}
				</p>
			) : null}
			<div className="space-y-2">
				{subtasks.length === 0 ? (
					<p className="rounded-lg border border-stone-500 border-dashed bg-white/40 p-4 text-center text-sm text-stone-600">
						Break the task into 30-45 minute steps.
					</p>
				) : null}
				{subtasks.map((subtask) => (
					<div
						className="flex items-center gap-2 rounded-lg border border-stone-900 bg-[#fffdf6] p-2"
						key={subtask.id}
					>
						<select
							aria-label={`Status for ${subtask.title}`}
							className="rounded border border-stone-900 bg-white p-1 text-xs"
							disabled={pendingIds.has(subtask.id)}
							onChange={(event) =>
								changeStatus(subtask, event.target.value as TaskStatus)
							}
							value={statusOverrides[subtask.id] ?? subtask.status}
						>
							{taskStatuses.map((status) => (
								<option key={status}>{status}</option>
							))}
						</select>
						<span
							className={`min-w-0 flex-1 text-sm ${subtask.status === "Finished" ? "line-through opacity-50" : ""}`}
						>
							{subtask.title}
						</span>
						{subtask.estimatedMinutes ? (
							<span className="text-stone-600 text-xs">
								{subtask.estimatedMinutes}m
							</span>
						) : null}
						<button
							aria-label={`Delete ${subtask.title}`}
							className="px-1 font-bold text-red-700"
							disabled={pendingIds.has(subtask.id)}
							onClick={() => removeSubtask(subtask)}
							type="button"
						>
							×
						</button>
					</div>
				))}
			</div>
		</section>
	);
}
