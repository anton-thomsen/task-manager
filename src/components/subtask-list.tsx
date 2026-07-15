"use client";

import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { startTransition, useOptimistic, useState } from "react";

import { formatHours } from "~/lib/format";
import type { TaskStatus } from "~/lib/tasks";
import { taskStatuses } from "~/lib/tasks";
import {
	createSubtask,
	deleteSubtask,
	moveSubtask,
	updateSubtaskStatus,
} from "~/server/actions/subtasks";
import { DropLane, SortableItem } from "./sortable-lane";

type Subtask = {
	id: number;
	title: string;
	status: TaskStatus;
	estimatedHours: number | null;
};

type Move = { id: number; status: TaskStatus; beforeId: number | null };

function applyMove(subtasks: Subtask[], move: Move): Subtask[] {
	const moving = subtasks.find(({ id }) => id === move.id);
	if (!moving) return subtasks;
	const next = subtasks.filter(({ id }) => id !== move.id);
	const beforeIndex = move.beforeId
		? next.findIndex(({ id }) => id === move.beforeId)
		: -1;
	next.splice(beforeIndex >= 0 ? beforeIndex : next.length, 0, {
		...moving,
		status: move.status,
	});
	return next;
}

export function SubtaskList({
	subtasks,
	taskId,
}: {
	subtasks: Subtask[];
	taskId: number;
}) {
	const [error, setError] = useState<string | null>(null);
	const [optimisticSubtasks, moveOptimistic] = useOptimistic(
		subtasks,
		applyMove,
	);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);
	const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
	const [statusOverrides, setStatusOverrides] = useState<
		Record<number, TaskStatus>
	>({});
	const completed = subtasks.filter(
		({ status }) => status === "Finished",
	).length;
	const remainingHours = subtasks.reduce(
		(total, subtask) =>
			subtask.status === "Finished"
				? total
				: total + (subtask.estimatedHours ?? 0),
		0,
	);
	const activeStatuses = taskStatuses.filter(
		(status): status is Exclude<TaskStatus, "Finished"> =>
			status !== "Finished",
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
			setStatusOverrides((current) => {
				const next = { ...current };
				delete next[subtask.id];
				return next;
			});
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

	function handleDragEnd(event: DragEndEvent) {
		const moving = optimisticSubtasks.find(
			({ id }) => `subtask-${id}` === event.active.id,
		);
		if (!moving || !event.over) return;
		const status = event.over.data.current?.status as TaskStatus | undefined;
		if (!status || status === "Finished") return;
		let beforeId =
			event.over.data.current?.type === "subtask"
				? Number(String(event.over.id).replace("subtask-", ""))
				: null;
		if (beforeId === moving.id) return;
		const lane = optimisticSubtasks.filter((item) => item.status === status);
		const currentIndex = lane.findIndex(({ id }) => id === moving.id);
		const targetIndex = beforeId
			? lane.findIndex(({ id }) => id === beforeId)
			: lane.length - 1;
		if (moving.status === status && currentIndex === targetIndex) return;
		if (moving.status === status && currentIndex >= 0) {
			const reordered = arrayMove(lane, currentIndex, targetIndex);
			beforeId = reordered[targetIndex + 1]?.id ?? null;
		}
		const move = { id: moving.id, status, beforeId };
		setError(null);
		startTransition(async () => {
			moveOptimistic(move);
			try {
				await moveSubtask(move.id, move.status, move.beforeId);
			} catch {
				setError("The subtask could not be moved.");
			}
		});
	}

	return (
		<section className="space-y-4">
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<h2 className="font-bold text-xl">Subtasks</h2>
				<p className="text-stone-600 text-xs">
					{completed}/{subtasks.length} done · {formatHours(remainingHours)}{" "}
					left
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
					aria-label="Estimated hours"
					className="min-w-0 rounded-md border border-stone-900 bg-white px-2 py-1.5 text-sm"
					max={5}
					min={0.25}
					name="estimatedHours"
					placeholder="hours"
					step={0.25}
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
			<DndContext
				collisionDetection={closestCorners}
				onDragEnd={handleDragEnd}
				sensors={sensors}
			>
				<div className="grid items-start gap-4 lg:grid-cols-3">
					{activeStatuses.map((status) => {
						const sectionTasks = optimisticSubtasks.filter(
							(subtask) => subtask.status === status,
						);
						return (
							<DropLane
								className="rounded-2xl border-2 border-stone-900 bg-[#dfe5cc] p-3 shadow-[4px_4px_0_#1c1917]"
								data={{ type: "lane", status }}
								id={`subtask-lane-${status}`}
								items={sectionTasks.map(({ id }) => `subtask-${id}`)}
								key={status}
							>
								<div className="mb-3 flex items-center justify-between border-stone-900 border-b pb-2">
									<h3 className="display-font font-bold text-lg">{status}</h3>
									<span className="rounded-full bg-stone-900 px-2 py-0.5 font-bold text-white text-xs">
										{sectionTasks.length}
									</span>
								</div>
								<div className="space-y-2">
									{sectionTasks.map((subtask) => (
										<SortableItem
											data={{ type: "subtask", status }}
											id={`subtask-${subtask.id}`}
											key={subtask.id}
										>
											<div className="flex items-center gap-2 rounded-lg border border-stone-900 bg-[#fffdf6] p-2">
												<select
													aria-label={`Status for ${subtask.title}`}
													className="rounded border border-stone-900 bg-white p-1 text-xs"
													disabled={pendingIds.has(subtask.id)}
													onChange={(event) =>
														changeStatus(
															subtask,
															event.target.value as TaskStatus,
														)
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
												{subtask.estimatedHours ? (
													<span className="text-stone-600 text-xs">
														{formatHours(subtask.estimatedHours)}
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
										</SortableItem>
									))}
									{sectionTasks.length === 0 ? (
										<p className="rounded-lg border border-stone-500 border-dashed p-4 text-center text-stone-600 text-xs">
											Nothing here
										</p>
									) : null}
								</div>
							</DropLane>
						);
					})}
				</div>
			</DndContext>
		</section>
	);
}
