"use client";

import { useEffect, useRef, useState } from "react";

import { minutesAsHours } from "~/lib/format";
import type { LabelOption, TaskOption, TaskStatus } from "~/lib/tasks";
import { taskStatuses } from "~/lib/tasks";
import { createClient } from "~/server/actions/clients";
import { createLabel } from "~/server/actions/labels";
import { createTask, updateTask } from "~/server/actions/tasks";

export type TaskFormValue = {
	id: number;
	title: string;
	description: string | null;
	status: TaskStatus;
	deadline: string | null;
	estimateMinMinutes: number | null;
	estimateMaxMinutes: number | null;
	clientId: number | null;
	labelId: number | null;
};

type TaskFormProps = {
	clients: TaskOption[];
	labels: LabelOption[];
	task?: TaskFormValue;
	triggerLabel?: string;
};

const inputClass =
	"w-full rounded-md border border-stone-900 bg-white px-3 py-2 text-sm";

function mergeById<T extends { id: number }>(server: T[], local: T[]): T[] {
	const merged = new Map(server.map((option) => [option.id, option]));
	for (const option of local) merged.set(option.id, option);
	return [...merged.values()];
}

export function TaskForm({
	clients,
	labels,
	task,
	triggerLabel,
}: TaskFormProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [locallyAddedClients, setLocallyAddedClients] = useState<TaskOption[]>(
		[],
	);
	const [locallyAddedLabels, setLocallyAddedLabels] = useState<LabelOption[]>(
		[],
	);
	const [newClient, setNewClient] = useState("");
	const [newLabel, setNewLabel] = useState("");
	const [newLabelColor, setNewLabelColor] = useState("#fecaca");
	const [minHours, setMinHours] = useState(
		minutesAsHours(task?.estimateMinMinutes),
	);
	const [maxHours, setMaxHours] = useState(
		minutesAsHours(task?.estimateMaxMinutes),
	);
	const [minEstimateChanged, setMinEstimateChanged] = useState(false);
	const [maxEstimateChanged, setMaxEstimateChanged] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [isAddingClient, setIsAddingClient] = useState(false);
	const [isAddingLabel, setIsAddingLabel] = useState(false);
	const clientOptions = mergeById(clients, locallyAddedClients);
	const labelOptions = mergeById(labels, locallyAddedLabels);

	useEffect(() => {
		setLocallyAddedClients((current) =>
			current.filter(
				(local) => !clients.some((server) => server.id === local.id),
			),
		);
	}, [clients]);

	useEffect(() => {
		setLocallyAddedLabels((current) =>
			current.filter((local) => {
				const server = labels.find(({ id }) => id === local.id);
				return !server || server.color !== local.color;
			}),
		);
	}, [labels]);

	const isEditing = task !== undefined;
	const maxEstimate = Number(maxHours);
	const minEstimate = Number(minHours);
	const estimateIsInvalid =
		maxEstimate > 5 ||
		(minHours !== "" && maxHours !== "" && minEstimate > maxEstimate);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (estimateIsInvalid) return;
		setIsSaving(true);
		setError(null);
		const form = event.currentTarget;
		try {
			const formData = new FormData(form);
			formData.set(
				"estimateMinMinutes",
				isEditing && !minEstimateChanged
					? String(task.estimateMinMinutes ?? "")
					: minHours === ""
						? ""
						: String(Math.round(Number(minHours) * 60)),
			);
			formData.set(
				"estimateMaxMinutes",
				isEditing && !maxEstimateChanged
					? String(task.estimateMaxMinutes ?? "")
					: maxHours === ""
						? ""
						: String(Math.round(Number(maxHours) * 60)),
			);
			const result = await (isEditing
				? updateTask(formData)
				: createTask(formData));
			if (!result.ok) {
				setError(result.error);
				return;
			}
			if (!isEditing) {
				form.reset();
				setMinHours("");
				setMaxHours("");
				setMinEstimateChanged(false);
				setMaxEstimateChanged(false);
			}
			dialogRef.current?.close();
		} catch {
			setError("The task could not be saved. Check the fields and try again.");
		} finally {
			setIsSaving(false);
		}
	}

	async function addClient() {
		if (!newClient.trim() || isAddingClient) return;
		setError(null);
		setIsAddingClient(true);
		try {
			const client = await createClient(newClient);
			setLocallyAddedClients((current) => mergeById(current, [client]));
			setNewClient("");
		} catch {
			setError("The client could not be created.");
		} finally {
			setIsAddingClient(false);
		}
	}

	async function addLabel() {
		if (!newLabel.trim() || isAddingLabel) return;
		setError(null);
		setIsAddingLabel(true);
		try {
			const label = await createLabel(newLabel, newLabelColor);
			setLocallyAddedLabels((current) => mergeById(current, [label]));
			setNewLabel("");
		} catch {
			setError("The label could not be created.");
		} finally {
			setIsAddingLabel(false);
		}
	}

	return (
		<>
			<button
				className={
					isEditing
						? "rounded border border-stone-900 bg-white px-2 py-1 font-semibold text-xs hover:bg-stone-100"
						: "rounded-lg border border-emerald-950 bg-emerald-700 px-4 py-2 font-bold text-sm text-white shadow-[2px_2px_0_#052e16] hover:bg-emerald-800"
				}
				onClick={() => dialogRef.current?.showModal()}
				type="button"
			>
				{triggerLabel ?? (isEditing ? "Edit" : "Create task")}
			</button>

			<dialog
				aria-labelledby={`task-dialog-title-${task?.id ?? "new"}`}
				className="m-auto max-h-[90vh] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border-2 border-stone-900 bg-[#f5f0e6] p-0 shadow-[8px_8px_0_#1c1917] backdrop:bg-black/50"
				ref={dialogRef}
			>
				<form className="space-y-5 p-5 sm:p-7" onSubmit={handleSubmit}>
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="font-bold text-emerald-800 text-xs uppercase tracking-[0.18em]">
								Task editor
							</p>
							<h2
								className="font-bold text-2xl"
								id={`task-dialog-title-${task?.id ?? "new"}`}
							>
								{isEditing ? "Edit task" : "Create a task"}
							</h2>
						</div>
						<button
							aria-label="Close task editor"
							className="rounded-full border border-stone-900 bg-white px-2.5 py-1 font-bold"
							onClick={() => dialogRef.current?.close()}
							type="button"
						>
							×
						</button>
					</div>

					{task ? <input name="id" type="hidden" value={task.id} /> : null}
					<label className="block space-y-1 font-semibold text-sm">
						<span>Title</span>
						<input
							className={inputClass}
							defaultValue={task?.title}
							maxLength={200}
							name="title"
							required
						/>
					</label>
					<label className="block space-y-1 font-semibold text-sm">
						<span>Description</span>
						<textarea
							className={inputClass}
							defaultValue={task?.description ?? ""}
							maxLength={2000}
							name="description"
							rows={3}
						/>
					</label>

					<div className="grid gap-4 sm:grid-cols-2">
						<label className="space-y-1 font-semibold text-sm">
							<span>Status</span>
							<select
								className={inputClass}
								defaultValue={task?.status ?? "Inbox"}
								name="status"
							>
								{taskStatuses.map((status) => (
									<option key={status}>{status}</option>
								))}
							</select>
						</label>
						<label className="space-y-1 font-semibold text-sm">
							<span>Deadline</span>
							<input
								className={inputClass}
								defaultValue={task?.deadline ?? ""}
								name="deadline"
								type="date"
							/>
						</label>
						<label className="space-y-1 font-semibold text-sm">
							<span>Client</span>
							<select
								className={inputClass}
								defaultValue={task?.clientId ?? ""}
								name="clientId"
							>
								<option value="">No client</option>
								{clientOptions.map((client) => (
									<option key={client.id} value={client.id}>
										{client.name}
									</option>
								))}
							</select>
						</label>
						<label className="space-y-1 font-semibold text-sm">
							<span>Label</span>
							<select
								className={inputClass}
								defaultValue={task?.labelId ?? ""}
								name="labelId"
							>
								<option value="">No label</option>
								{labelOptions.map((label) => (
									<option
										key={label.id}
										style={{ backgroundColor: label.color }}
										value={label.id}
									>
										{label.name}
									</option>
								))}
							</select>
						</label>
					</div>

					<div className="rounded-xl border border-stone-400 bg-white/60 p-3">
						<p className="mb-2 font-semibold text-sm">Estimate range (hours)</p>
						<div className="flex items-center gap-2">
							<input
								aria-label="Minimum estimate in hours"
								className={`${inputClass} w-24`}
								max="5"
								min="0.25"
								onChange={(event) => {
									setMinHours(event.target.value);
									setMinEstimateChanged(true);
								}}
								step="0.25"
								type="number"
								value={minHours}
							/>
							<span>to</span>
							<input
								aria-label="Maximum estimate in hours"
								className={`${inputClass} w-24`}
								max="5"
								min="0.25"
								onChange={(event) => {
									setMaxHours(event.target.value);
									setMaxEstimateChanged(true);
								}}
								step="0.25"
								type="number"
								value={maxHours}
							/>
							<span>hours</span>
						</div>
						{maxEstimate > 5 ? (
							<p className="mt-2 rounded-md bg-red-100 p-2 font-semibold text-red-900 text-xs">
								Over 5 hours - split this into smaller tasks.
							</p>
						) : null}
						{minHours !== "" && maxHours !== "" && minEstimate > maxEstimate ? (
							<p className="mt-2 text-red-800 text-xs">
								The minimum must not exceed the maximum.
							</p>
						) : null}
						{maxEstimate >= 3 && maxEstimate <= 5 ? (
							<p className="mt-2 text-amber-800 text-xs">
								This is a big block. Consider splitting it.
							</p>
						) : null}
					</div>

					<details className="rounded-xl border border-stone-400 bg-white/60 p-3">
						<summary className="cursor-pointer font-semibold text-sm">
							Create client or label inline
						</summary>
						<div className="mt-3 grid gap-3 sm:grid-cols-2">
							<div className="flex gap-2">
								<input
									aria-label="New client name"
									className={inputClass}
									maxLength={50}
									onChange={(event) => setNewClient(event.target.value)}
									placeholder="New client"
									value={newClient}
								/>
								<button
									className="rounded-md border border-stone-900 bg-white px-3 font-semibold text-xs"
									disabled={isAddingClient}
									onClick={addClient}
									type="button"
								>
									{isAddingClient ? "Adding…" : "Add"}
								</button>
							</div>
							<div className="flex gap-2">
								<input
									aria-label="New label name"
									className={inputClass}
									maxLength={50}
									onChange={(event) => setNewLabel(event.target.value)}
									placeholder="New label"
									value={newLabel}
								/>
								<input
									aria-label="New label color"
									className="h-9 w-12"
									onChange={(event) => setNewLabelColor(event.target.value)}
									type="color"
									value={newLabelColor}
								/>
								<button
									className="rounded-md border border-stone-900 bg-white px-3 font-semibold text-xs"
									disabled={isAddingLabel}
									onClick={addLabel}
									type="button"
								>
									{isAddingLabel ? "Adding…" : "Add"}
								</button>
							</div>
						</div>
					</details>

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
							disabled={estimateIsInvalid || isSaving}
							type="submit"
						>
							{isSaving ? "Saving…" : isEditing ? "Save changes" : "Add task"}
						</button>
					</div>
				</form>
			</dialog>
		</>
	);
}
