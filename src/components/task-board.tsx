"use client";

import {
	type CollisionDetection,
	closestCorners,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { startTransition, useOptimistic, useState } from "react";

import type { LabelOption, TaskOption, TaskStatus } from "~/lib/tasks";
import { taskStatuses } from "~/lib/tasks";
import { moveTask } from "~/server/actions/tasks";
import { DropLane, SortableItem } from "./sortable-lane";
import { TaskCard, type TaskCardValue } from "./task-card";

type Move = { id: number; status: TaskStatus; beforeId: number | null };

const taskBoardCollisionDetection: CollisionDetection = (args) => {
	if (args.pointerCoordinates === null) return closestCorners(args);

	const taskCollisions = pointerWithin({
		...args,
		droppableContainers: args.droppableContainers.filter(
			({ data }) => data.current?.type === "task",
		),
	});
	if (taskCollisions.length > 0) return taskCollisions;

	return pointerWithin({
		...args,
		droppableContainers: args.droppableContainers.filter(
			({ data }) => data.current?.type === "lane",
		),
	});
};

function applyMove(tasks: TaskCardValue[], move: Move): TaskCardValue[] {
	const moving = tasks.find(({ id }) => id === move.id);
	if (!moving) return tasks;
	const next = tasks.filter(({ id }) => id !== move.id);
	const beforeIndex = move.beforeId
		? next.findIndex(({ id }) => id === move.beforeId)
		: -1;
	const moved = { ...moving, status: move.status };
	next.splice(beforeIndex >= 0 ? beforeIndex : next.length, 0, moved);
	return next;
}

export function TaskBoard({
	tasks,
	clients,
	labels,
}: {
	tasks: TaskCardValue[];
	clients: TaskOption[];
	labels: LabelOption[];
}) {
	const [error, setError] = useState<string | null>(null);
	const [optimisticTasks, moveOptimistic] = useOptimistic(tasks, applyMove);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	function handleDragEnd(event: DragEndEvent) {
		const activeTask = optimisticTasks.find(
			({ id }) => `task-${id}` === event.active.id,
		);
		if (!activeTask || !event.over) return;
		const status = event.over.data.current?.status as TaskStatus | undefined;
		if (!status) return;
		let beforeId =
			event.over.data.current?.type === "task"
				? Number(String(event.over.id).replace("task-", ""))
				: null;
		if (beforeId === activeTask.id) return;
		const currentLane = optimisticTasks.filter(
			(task) => task.status === status,
		);
		const currentIndex = currentLane.findIndex(
			({ id }) => id === activeTask.id,
		);
		const targetIndex = beforeId
			? currentLane.findIndex(({ id }) => id === beforeId)
			: currentLane.length - 1;
		if (activeTask.status === status && currentIndex === targetIndex) return;
		if (activeTask.status === status && currentIndex >= 0) {
			const reordered = arrayMove(currentLane, currentIndex, targetIndex);
			beforeId = reordered[targetIndex + 1]?.id ?? null;
		}
		const move = { id: activeTask.id, status, beforeId };
		setError(null);
		startTransition(async () => {
			moveOptimistic(move);
			const result = await moveTask(move.id, move.status, move.beforeId);
			if (!result.ok) setError(result.error);
		});
	}

	return (
		<>
			{error ? (
				<p
					className="mb-4 rounded-lg bg-red-100 p-3 text-red-900 text-sm"
					role="alert"
				>
					{error}
				</p>
			) : null}
			<DndContext
				collisionDetection={taskBoardCollisionDetection}
				onDragEnd={handleDragEnd}
				sensors={sensors}
			>
				<section className="flex gap-5 overflow-x-auto pb-7 lg:grid lg:grid-cols-4 lg:overflow-visible">
					{taskStatuses.map((status) => {
						const lane = optimisticTasks.filter(
							(task) => task.status === status,
						);
						return (
							<DropLane
								className="min-h-80 w-[19rem] shrink-0 rounded-2xl border-2 border-stone-900 bg-[#d8ddc2] p-3 shadow-[5px_5px_0_#1c1917] lg:w-auto"
								data={{ type: "lane", status }}
								id={`lane-${status}`}
								items={lane.map(({ id }) => `task-${id}`)}
								key={status}
							>
								<div className="mb-3 flex items-center justify-between border-stone-900 border-b pb-2">
									<h2 className="display-font font-bold text-xl">{status}</h2>
									<span className="pixel-accent rounded-full bg-stone-900 px-2 py-1 text-[0.55rem] text-white">
										{lane.length}
									</span>
								</div>
								<div className="space-y-3">
									{lane.map((task) => (
										<SortableItem
											data={{ type: "task", status }}
											disabled={Boolean(task.archivedAt)}
											id={`task-${task.id}`}
											key={task.id}
										>
											<TaskCard clients={clients} labels={labels} task={task} />
										</SortableItem>
									))}
									{lane.length === 0 ? (
										<p className="rounded-xl border border-stone-600 border-dashed p-5 text-center text-sm text-stone-600">
											Clear for now
										</p>
									) : null}
								</div>
							</DropLane>
						);
					})}
				</section>
			</DndContext>
		</>
	);
}
