"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { hoursInputValue } from "~/lib/format";
import type { TaskStatus } from "~/lib/tasks";
import { taskStatuses } from "~/lib/tasks";
import { createSubtask, updateSubtask } from "~/server/actions/subtasks";
import {
	type AnimationCenter,
	CreateSuccessAnimation,
} from "./create-success-animation";

export type SubtaskFormValue = {
	id: number;
	title: string;
	description: string | null;
	referenceLinks: string[];
	status: TaskStatus;
	estimatedHours: number | null;
};

type ReferenceLinkField = {
	id: string;
	value: string;
};

const inputClass =
	"w-full rounded-md border border-stone-900 bg-white px-3 py-2 text-sm";

function initialReferenceLinks(
	subtask?: SubtaskFormValue,
): ReferenceLinkField[] {
	const links = subtask?.referenceLinks.length ? subtask.referenceLinks : [""];
	return links.map((value, index) => ({ id: `initial-${index}`, value }));
}

export function SubtaskForm({
	taskId,
	subtask,
}: {
	taskId: number;
	subtask?: SubtaskFormValue;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const nextLinkId = useRef(1);
	const [estimatedHours, setEstimatedHours] = useState(
		hoursInputValue(subtask?.estimatedHours),
	);
	const [referenceLinks, setReferenceLinks] = useState<ReferenceLinkField[]>(
		() => initialReferenceLinks(subtask),
	);
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [animationCenter, setAnimationCenter] =
		useState<AnimationCenter | null>(null);
	const isEditing = subtask !== undefined;
	const dialogId = `subtask-dialog-title-${subtask?.id ?? `new-${taskId}`}`;

	useEffect(() => {
		if (!animationCenter) return;
		const timer = window.setTimeout(() => setAnimationCenter(null), 1400);
		return () => window.clearTimeout(timer);
	}, [animationCenter]);

	function addReferenceLink() {
		if (referenceLinks.length >= 10) return;
		const id = `added-${nextLinkId.current}`;
		nextLinkId.current += 1;
		setReferenceLinks((current) => [...current, { id, value: "" }]);
	}

	function updateReferenceLink(id: string, value: string) {
		setReferenceLinks((current) =>
			current.map((link) => (link.id === id ? { ...link, value } : link)),
		);
	}

	function removeReferenceLink(id: string) {
		setReferenceLinks((current) => {
			const next = current.filter((link) => link.id !== id);
			return next.length > 0 ? next : [{ id: "empty-0", value: "" }];
		});
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSaving(true);
		setError(null);
		const form = event.currentTarget;
		try {
			const formData = new FormData(form);
			formData.set("estimatedHours", estimatedHours);
			const result = await (isEditing
				? updateSubtask(formData)
				: createSubtask(formData));
			if (!result.ok) {
				setError(result.error);
				return;
			}
			if (!isEditing) {
				const rect = dialogRef.current?.getBoundingClientRect();
				form.reset();
				setEstimatedHours("");
				setReferenceLinks([{ id: "reset-0", value: "" }]);
				if (
					rect &&
					!window.matchMedia("(prefers-reduced-motion: reduce)").matches
				) {
					setAnimationCenter({
						x: rect.left + rect.width / 2,
						y: rect.top + rect.height / 2,
					});
				}
			}
			dialogRef.current?.close();
		} catch {
			setError(
				"The subtask could not be saved. Check the fields and try again.",
			);
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<>
			<button
				aria-label={isEditing ? `Edit ${subtask.title}` : undefined}
				className={
					isEditing
						? "ghost-icon-button"
						: "rounded-lg border border-emerald-950 bg-emerald-700 px-4 py-2 font-bold text-sm text-white shadow-[2px_2px_0_#052e16] hover:bg-emerald-800"
				}
				onClick={() => dialogRef.current?.showModal()}
				title={isEditing ? "Edit subtask" : undefined}
				type="button"
			>
				{isEditing ? (
					<Pencil aria-hidden="true" size={16} strokeWidth={2} />
				) : (
					"Create subtask"
				)}
			</button>

			<dialog
				aria-labelledby={dialogId}
				className="m-auto max-h-[90vh] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border-2 border-stone-900 bg-[#f5f0e6] p-0 shadow-[8px_8px_0_#1c1917] backdrop:bg-black/50"
				ref={dialogRef}
			>
				<form className="space-y-5 p-5 sm:p-7" onSubmit={handleSubmit}>
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="pixel-accent text-[0.55rem] text-emerald-800 uppercase">
								Subtask editor
							</p>
							<h2 className="font-bold text-2xl" id={dialogId}>
								{isEditing ? "Edit subtask" : "Create a subtask"}
							</h2>
						</div>
						<button
							aria-label="Close subtask editor"
							className="rounded-full border border-stone-900 bg-white px-2.5 py-1 font-bold"
							onClick={() => dialogRef.current?.close()}
							type="button"
						>
							×
						</button>
					</div>

					<input name="taskId" type="hidden" value={taskId} />
					{subtask ? (
						<input name="id" type="hidden" value={subtask.id} />
					) : null}
					<label className="block space-y-1 font-semibold text-sm">
						<span>Title</span>
						<input
							className={inputClass}
							defaultValue={subtask?.title}
							maxLength={200}
							name="title"
							required
						/>
					</label>
					<label className="block space-y-1 font-semibold text-sm">
						<span>Description</span>
						<textarea
							className={inputClass}
							defaultValue={subtask?.description ?? ""}
							maxLength={2000}
							name="description"
							placeholder="Context, requirements, and anything needed to finish this subtask"
							rows={5}
						/>
					</label>

					<fieldset className="space-y-2 rounded-xl border border-stone-400 bg-white/60 p-3">
						<legend className="px-1 font-semibold text-sm">
							Reference links
						</legend>
						<div className="flex items-start justify-between gap-3">
							<p className="text-stone-600 text-xs">
								Add up to 10 Google Drive, Basecamp, Monday, or other web links.
							</p>
							<button
								className="interactive-field inline-flex items-center gap-1 rounded-md border border-stone-900 bg-white px-2 py-1 font-semibold text-xs disabled:opacity-50"
								disabled={referenceLinks.length >= 10}
								onClick={addReferenceLink}
								type="button"
							>
								<Plus aria-hidden="true" size={14} /> Add link
							</button>
						</div>
						{referenceLinks.map((link, index) => (
							<div className="flex gap-2" key={link.id}>
								<input
									aria-label={`Reference link ${index + 1}`}
									className={inputClass}
									maxLength={2048}
									name="referenceLinks"
									onChange={(event) =>
										updateReferenceLink(link.id, event.target.value)
									}
									placeholder="https://..."
									type="url"
									value={link.value}
								/>
								<button
									aria-label={`Remove reference link ${index + 1}`}
									className="ghost-icon-button shrink-0"
									onClick={() => removeReferenceLink(link.id)}
									type="button"
								>
									<X aria-hidden="true" size={16} />
								</button>
							</div>
						))}
					</fieldset>

					<div className="grid gap-4 sm:grid-cols-2">
						<label className="space-y-1 font-semibold text-sm">
							<span>Status</span>
							<select
								className={`${inputClass} interactive-field`}
								defaultValue={subtask?.status ?? "Inbox"}
								name="status"
							>
								{taskStatuses.map((status) => (
									<option key={status}>{status}</option>
								))}
							</select>
						</label>
						<label className="space-y-1 font-semibold text-sm">
							<span>Estimated hours</span>
							<input
								className={inputClass}
								max={5}
								min={0.25}
								name="estimatedHours"
								onChange={(event) => setEstimatedHours(event.target.value)}
								placeholder="Up to 5 hours"
								step={0.25}
								type="number"
								value={estimatedHours}
							/>
						</label>
					</div>

					{error ? (
						<p
							className="rounded-md border border-red-800 bg-red-100 p-2 text-red-900 text-sm"
							role="alert"
						>
							{error}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<button
							className="rounded-lg border border-stone-900 bg-white px-4 py-2 font-semibold text-sm"
							onClick={() => dialogRef.current?.close()}
							type="button"
						>
							Cancel
						</button>
						<button
							className="rounded-lg border border-emerald-950 bg-emerald-700 px-4 py-2 font-semibold text-sm text-white disabled:opacity-50"
							disabled={isSaving}
							type="submit"
						>
							{isSaving
								? "Saving…"
								: isEditing
									? "Save changes"
									: "Add subtask"}
						</button>
					</div>
				</form>
			</dialog>

			{animationCenter ? (
				<CreateSuccessAnimation
					center={animationCenter}
					onSkip={() => setAnimationCenter(null)}
				/>
			) : null}
		</>
	);
}
