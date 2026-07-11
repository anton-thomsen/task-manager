"use client";

import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function DropLane({
	id,
	items,
	data,
	children,
	className,
}: {
	id: string;
	items: string[];
	data: Record<string, unknown>;
	children: React.ReactNode;
	className?: string;
}) {
	const { setNodeRef, isOver } = useDroppable({ id, data });
	return (
		<div
			className={`${className ?? ""} ${isOver ? "ring-2 ring-emerald-600 ring-offset-2" : ""}`}
			ref={setNodeRef}
		>
			<SortableContext items={items} strategy={verticalListSortingStrategy}>
				{children}
			</SortableContext>
		</div>
	);
}

export function SortableItem({
	id,
	data,
	disabled,
	children,
}: {
	id: string;
	data: Record<string, unknown>;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id, data, disabled });
	return (
		<div
			className={isDragging ? "dnd-lift z-10 opacity-60" : ""}
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			{...attributes}
			{...listeners}
		>
			{children}
		</div>
	);
}
