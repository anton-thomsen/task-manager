import { TaskCard, type TaskCardValue } from "~/components/task-card";
import { TaskForm } from "~/components/task-form";
import { isOverdue } from "~/lib/format";
import { type TaskStatus, taskStatuses } from "~/lib/tasks";
import { int4IdSchema } from "~/lib/validation";
import { db } from "~/server/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function selectedId(value: string | string[] | undefined): number | undefined {
	const raw = Array.isArray(value) ? value[0] : value;
	const parsed = int4IdSchema.safeParse(raw);
	return parsed.success ? parsed.data : undefined;
}

function TaskColumn({
	status,
	tasks,
	clients,
	labels,
}: {
	status: TaskStatus;
	tasks: TaskCardValue[];
	clients: { id: number; name: string }[];
	labels: { id: number; name: string; color: string }[];
}) {
	const columnTasks = tasks.filter((task) => task.status === status);
	return (
		<section className="min-h-80 w-[19rem] shrink-0 rounded-2xl border-2 border-stone-900 bg-[#d8ddc2] p-3 shadow-[5px_5px_0_#1c1917] lg:w-auto">
			<div className="mb-3 flex items-center justify-between border-stone-900 border-b pb-2">
				<h2 className="display-font font-bold text-xl">{status}</h2>
				<span className="rounded-full bg-stone-900 px-2 py-0.5 font-bold text-white text-xs">
					{columnTasks.length}
				</span>
			</div>
			<div className="space-y-3">
				{columnTasks.map((task) => (
					<TaskCard
						clients={clients}
						key={task.id}
						labels={labels}
						task={task}
					/>
				))}
				{columnTasks.length === 0 ? (
					<p className="rounded-xl border border-stone-600 border-dashed p-5 text-center text-sm text-stone-600">
						Clear for now
					</p>
				) : null}
			</div>
		</section>
	);
}

export default async function HomePage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const filters = await searchParams;
	const clientId = selectedId(filters.client);
	const labelId = selectedId(filters.label);
	const showArchived = filters.archived === "1";

	const [tasks, clients, labels] = await Promise.all([
		db.task.findMany({
			where: {
				archivedAt: showArchived ? undefined : null,
				clientId,
				labelId,
			},
			orderBy: [
				{ deadline: { sort: "asc", nulls: "last" } },
				{ createdAt: "desc" },
			],
			include: {
				client: true,
				label: true,
				subtasks: { select: { status: true } },
				_count: { select: { logs: true } },
			},
		}),
		db.client.findMany({ orderBy: { name: "asc" } }),
		db.label.findMany({ orderBy: { name: "asc" } }),
	]);

	const taskValues: TaskCardValue[] = tasks.map((task) => {
		const deadline = task.deadline?.toISOString().slice(0, 10) ?? null;
		return {
			id: task.id,
			title: task.title,
			description: task.description,
			status: task.status,
			deadline,
			estimateMinMinutes: task.estimateMinMinutes,
			estimateMaxMinutes: task.estimateMaxMinutes,
			clientId: task.clientId,
			labelId: task.labelId,
			client: task.client,
			label: task.label,
			archivedAt: task.archivedAt?.toISOString() ?? null,
			subtaskCount: task.subtasks.length,
			finishedSubtaskCount: task.subtasks.filter(
				({ status }) => status === "Finished",
			).length,
			logCount: task._count.logs,
			overdue: isOverdue(deadline, task.status),
		};
	});

	return (
		<main className="mx-auto max-w-[100rem] p-4 sm:p-7">
			<header className="mb-7 border-stone-900 border-b-2 pb-5">
				<p className="mb-1 font-bold text-emerald-800 text-xs uppercase tracking-[0.22em]">
					Agency workbench
				</p>
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<h1 className="display-font font-black text-4xl sm:text-6xl">
							Task Manager
						</h1>
						<p className="mt-1 max-w-xl text-sm text-stone-600">
							Keep client work small, visible, and moving.
						</p>
					</div>
					<TaskForm clients={clients} labels={labels} />
				</div>
			</header>

			<form
				className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-3 shadow-[4px_4px_0_#1c1917]"
				method="get"
			>
				<label className="space-y-1 font-bold text-xs uppercase tracking-wide">
					<span className="block">Client</span>
					<select
						className="min-w-40 rounded-md border border-stone-900 bg-white px-2 py-1.5 font-normal text-sm normal-case tracking-normal"
						defaultValue={clientId ?? ""}
						name="client"
					>
						<option value="">All clients</option>
						{clients.map((client) => (
							<option key={client.id} value={client.id}>
								{client.name}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1 font-bold text-xs uppercase tracking-wide">
					<span className="block">Label</span>
					<select
						className="min-w-36 rounded-md border border-stone-900 bg-white px-2 py-1.5 font-normal text-sm normal-case tracking-normal"
						defaultValue={labelId ?? ""}
						name="label"
					>
						<option value="">All labels</option>
						{labels.map((label) => (
							<option key={label.id} value={label.id}>
								{label.name}
							</option>
						))}
					</select>
				</label>
				<label className="flex items-center gap-2 px-1 pb-1.5 text-sm">
					<input
						className="size-4 accent-emerald-700"
						defaultChecked={showArchived}
						name="archived"
						type="checkbox"
						value="1"
					/>
					Show archived
				</label>
				<button
					className="rounded-md border border-stone-900 bg-stone-900 px-4 py-1.5 font-bold text-sm text-white"
					type="submit"
				>
					Apply filters
				</button>
				{clientId || labelId || showArchived ? (
					<a
						className="pb-1.5 font-semibold text-sm text-stone-600 underline"
						href="/"
					>
						Clear
					</a>
				) : null}
			</form>

			<section className="flex gap-5 overflow-x-auto pb-7 lg:grid lg:grid-cols-4 lg:overflow-visible">
				{taskStatuses.map((status) => (
					<TaskColumn
						clients={clients}
						key={status}
						labels={labels}
						status={status}
						tasks={taskValues}
					/>
				))}
			</section>
		</main>
	);
}
