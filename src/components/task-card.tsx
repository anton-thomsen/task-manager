"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { formatDeadline, formatEstimateRange } from "~/lib/format";
import type { LabelOption, TaskOption } from "~/lib/tasks";
import { acceptTask } from "~/server/actions/assignments";
import { deleteTask, setArchived } from "~/server/actions/tasks";
import { TaskForm, type TaskFormValue } from "./task-form";
import { UserAvatar, type UserRef } from "./user-avatar";

export type TaskCardValue = TaskFormValue & {
	client: TaskOption | null;
	label: LabelOption | null;
	archivedAt: string | null;
	subtaskCount: number;
	finishedSubtaskCount: number;
	logCount: number;
	overdue: boolean;
	participants?: UserRef[];
	pendingFrom?: string | null;
};

type TaskCardProps = {
	clients: TaskOption[];
	labels: LabelOption[];
	members?: UserRef[];
	task: TaskCardValue;
};

const maxAvatars = 3;

export function TaskCard({ clients, labels, members, task }: TaskCardProps) {
	const deleteDialogRef = useRef<HTMLDialogElement>(null);
	const [isWorking, setIsWorking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [exitAnimation, setExitAnimation] = useState<
		"archive" | "delete" | null
	>(null);
	const estimate = formatEstimateRange(
		task.estimateMinHours,
		task.estimateMaxHours,
	);

	async function archive(archived: boolean): Promise<boolean> {
		setIsWorking(true);
		setError(null);
		if (archived) setExitAnimation("archive");
		try {
			const result = await setArchived(task.id, archived);
			if (!result.ok) {
				setError(result.error);
				setExitAnimation(null);
				return false;
			}
			return true;
		} finally {
			setIsWorking(false);
		}
	}

	async function accept() {
		setIsWorking(true);
		setError(null);
		try {
			const result = await acceptTask(task.id);
			if (!result.ok) setError(result.error);
		} finally {
			setIsWorking(false);
		}
	}

	async function remove() {
		setIsWorking(true);
		setError(null);
		setExitAnimation("delete");
		try {
			const result = await deleteTask(task.id);
			if (!result.ok) {
				setError(result.error);
				setExitAnimation(null);
				return;
			}
			deleteDialogRef.current?.close();
		} finally {
			setIsWorking(false);
		}
	}

	return (
		<article
			className={`space-y-2 rounded-xl border-2 border-stone-900 p-3 shadow-[3px_3px_0_#1c1917] ${task.pendingFrom ? "border-l-4 border-l-emerald-700" : ""} ${task.archivedAt ? "bg-stone-200 opacity-70" : "bg-[#fffdf6]"} ${exitAnimation === "archive" ? "pixel-archive" : ""} ${exitAnimation === "delete" ? "pixel-delete" : ""}`}
		>
			{task.pendingFrom ? (
				<div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-2 py-1.5">
					<p className="font-semibold text-emerald-900 text-xs">
						From {task.pendingFrom}
					</p>
					<button
						className="rounded border border-emerald-950 bg-emerald-700 px-2.5 py-1 font-bold text-white text-xs hover:bg-emerald-800"
						disabled={isWorking}
						onClick={accept}
						type="button"
					>
						Accept
					</button>
				</div>
			) : null}
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
			{task.participants && task.participants.length > 0 ? (
				<div className="flex items-center gap-1">
					<span className="flex -space-x-1.5">
						{task.participants.slice(0, maxAvatars).map((person) => (
							<UserAvatar key={person.userId} size="sm" user={person} />
						))}
					</span>
					{task.participants.length > maxAvatars ? (
						<span className="font-semibold text-stone-600 text-xs">
							+{task.participants.length - maxAvatars}
						</span>
					) : null}
				</div>
			) : null}
			<div className="flex flex-wrap gap-1.5 pt-1">
				<TaskForm
					clients={clients}
					labels={labels}
					members={members}
					task={task}
					triggerVariant="card"
				/>
				<button
					aria-label={task.archivedAt ? "Restore task" : "Archive task"}
					className="ghost-icon-button"
					disabled={isWorking}
					onClick={() => archive(!task.archivedAt)}
					title={task.archivedAt ? "Restore task" : "Archive task"}
					type="button"
				>
					{task.archivedAt ? (
						<ArchiveRestore aria-hidden="true" size={16} />
					) : (
						<Archive aria-hidden="true" size={16} />
					)}
				</button>
				<button
					aria-label="Delete task"
					className="ghost-icon-button text-red-700 hover:bg-red-100 hover:text-red-800"
					disabled={isWorking}
					onClick={() => deleteDialogRef.current?.showModal()}
					title="Delete task"
					type="button"
				>
					<Trash2 aria-hidden="true" size={16} />
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
