import Link from "next/link";
import { notFound } from "next/navigation";

import { SubtaskList } from "~/components/subtask-list";
import { TaskForm } from "~/components/task-form";
import { WorkLog } from "~/components/work-log";
import {
	formatDeadline,
	formatEstimateRange,
	formatMinutes,
} from "~/lib/format";
import { int4IdSchema } from "~/lib/validation";
import { db } from "~/server/db";

export default async function TaskDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id: rawId } = await params;
	const parsedId = int4IdSchema.safeParse(rawId);
	if (!parsedId.success) notFound();
	const id = parsedId.data;

	const [task, clients, labels] = await Promise.all([
		db.task.findUnique({
			where: { id },
			include: {
				client: true,
				label: true,
				subtasks: { orderBy: { createdAt: "asc" } },
				logs: { orderBy: { createdAt: "desc" } },
			},
		}),
		db.client.findMany({ orderBy: { name: "asc" } }),
		db.label.findMany({ orderBy: { name: "asc" } }),
	]);
	if (!task) notFound();

	const totalLogged = task.logs.reduce(
		(total, log) => total + (log.minutesSpent ?? 0),
		0,
	);
	const deadline = task.deadline?.toISOString().slice(0, 10) ?? null;
	const estimate = formatEstimateRange(
		task.estimateMinMinutes,
		task.estimateMaxMinutes,
	);
	const formTask = {
		id: task.id,
		title: task.title,
		description: task.description,
		status: task.status,
		deadline,
		estimateMinMinutes: task.estimateMinMinutes,
		estimateMaxMinutes: task.estimateMaxMinutes,
		clientId: task.clientId,
		labelId: task.labelId,
	};

	return (
		<main className="mx-auto max-w-6xl p-4 sm:p-8">
			<Link
				className="font-semibold text-sm underline underline-offset-4"
				href="/"
			>
				← Back to board
			</Link>
			<header className="mt-5 rounded-2xl border-2 border-stone-900 bg-[#d8ddc2] p-5 shadow-[6px_6px_0_#1c1917] sm:p-7">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<div className="mb-2 flex flex-wrap items-center gap-2">
							<span className="rounded-full bg-stone-900 px-2 py-1 font-bold text-white text-xs">
								{task.status}
							</span>
							{task.label ? (
								<span
									className="rounded-full border border-stone-900 px-2 py-1 font-bold text-xs"
									style={{ backgroundColor: task.label.color }}
								>
									{task.label.name}
								</span>
							) : null}
							{task.client ? (
								<span className="rounded-full border border-stone-900 bg-white px-2 py-1 font-bold text-xs">
									{task.client.name}
								</span>
							) : null}
							{task.archivedAt ? (
								<span className="rounded-full bg-stone-500 px-2 py-1 font-bold text-white text-xs">
									Archived
								</span>
							) : null}
						</div>
						<h1 className="display-font font-black text-3xl sm:text-5xl">
							{task.title}
						</h1>
						{task.description ? (
							<p className="mt-3 max-w-3xl whitespace-pre-wrap text-stone-700">
								{task.description}
							</p>
						) : null}
					</div>
					<TaskForm clients={clients} labels={labels} task={formTask} />
				</div>
				<div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-stone-900 border-t pt-3 font-semibold text-sm">
					{deadline ? <span>Due {formatDeadline(deadline)}</span> : null}
					{estimate ? <span>{estimate} estimated</span> : null}
					<span>{formatMinutes(totalLogged)} logged</span>
				</div>
			</header>

			<div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
				<SubtaskList subtasks={task.subtasks} taskId={task.id} />
				<WorkLog
					logs={task.logs.map((log) => ({
						...log,
						createdAt: log.createdAt.toISOString(),
					}))}
					taskId={task.id}
				/>
			</div>
		</main>
	);
}
