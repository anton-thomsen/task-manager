import Link from "next/link";
import { notFound } from "next/navigation";

import { SubtaskList } from "~/components/subtask-list";
import { TaskForm } from "~/components/task-form";
import { WorkLog } from "~/components/work-log";
import { formatDeadline, formatEstimateRange, formatHours } from "~/lib/format";
import { int4IdSchema } from "~/lib/validation";
import { requireMember } from "~/server/auth";
import { db } from "~/server/db";
import { taskWhereFor } from "~/server/task-access";

const hourComparisonTolerance = 1e-9;

export default async function TaskDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const member = await requireMember();
	const { id: rawId } = await params;
	const parsedId = int4IdSchema.safeParse(rawId);
	if (!parsedId.success) notFound();
	const id = parsedId.data;
	const query = await searchParams;
	const tab = query.tab === "log" ? "log" : "tasks";

	const [task, clients, labels] = await Promise.all([
		db.task.findFirst({
			where: { id, AND: taskWhereFor(member) },
			include: {
				client: true,
				label: true,
				subtasks: {
					orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
				},
				logs: {
					orderBy: { createdAt: "desc" },
					include: {
						images: { select: { id: true, fileName: true } },
					},
				},
			},
		}),
		db.client.findMany({
			where: { organizationId: member.orgId },
			orderBy: { name: "asc" },
		}),
		db.label.findMany({
			where: { organizationId: member.orgId },
			orderBy: { name: "asc" },
		}),
	]);
	if (!task) notFound();

	const totalLogged = task.logs.reduce(
		(total, log) => total + (log.hoursSpent ?? 0),
		0,
	);
	const deadline = task.deadline?.toISOString().slice(0, 10) ?? null;
	const estimate = formatEstimateRange(
		task.estimateMinHours,
		task.estimateMaxHours,
	);
	const formTask = {
		id: task.id,
		title: task.title,
		description: task.description,
		status: task.status,
		deadline,
		estimateMinHours: task.estimateMinHours,
		estimateMaxHours: task.estimateMaxHours,
		clientId: task.clientId,
		labelId: task.labelId,
	};
	const estimateComparison = (() => {
		if (
			task.estimateMinHours !== null &&
			totalLogged < task.estimateMinHours - hourComparisonTolerance
		) {
			return `${formatHours(task.estimateMinHours - totalLogged)} below the estimate range`;
		}
		if (
			task.estimateMaxHours !== null &&
			totalLogged > task.estimateMaxHours + hourComparisonTolerance
		) {
			return `${formatHours(totalLogged - task.estimateMaxHours)} over the estimate range`;
		}
		if (task.estimateMinHours !== null || task.estimateMaxHours !== null) {
			return "Within the estimate range";
		}
		return null;
	})();
	const feedCount = task.logs.length;

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
					<span>{formatHours(totalLogged)} logged</span>
				</div>
				{estimateComparison ? (
					<div className="mt-4 rounded-xl border border-stone-900 bg-white/60 p-3">
						<p className="font-bold text-sm">Estimate vs. logged time</p>
						<p className="mt-1 text-sm text-stone-700">
							{estimate ?? "No estimate"} estimated · {formatHours(totalLogged)}{" "}
							logged · {estimateComparison}
						</p>
					</div>
				) : null}
			</header>

			<nav
				aria-label="Task detail views"
				className="mt-7 flex border-stone-900 border-b-2"
			>
				<Link
					className={`px-5 py-2 font-bold text-sm ${tab === "tasks" ? "bg-stone-900 text-white" : "hover:bg-stone-200"}`}
					href={`/tasks/${task.id}`}
				>
					Tasks
				</Link>
				<Link
					className={`flex items-center gap-2 px-5 py-2 font-bold text-sm ${tab === "log" ? "bg-stone-900 text-white" : "hover:bg-stone-200"}`}
					href={`/tasks/${task.id}?tab=log`}
				>
					Work log{" "}
					<span className="rounded-full bg-emerald-700 px-2 py-0.5 text-white text-xs">
						{feedCount}
					</span>
				</Link>
			</nav>

			<div className="mt-6">
				{tab === "tasks" ? (
					<SubtaskList subtasks={task.subtasks} taskId={task.id} />
				) : (
					<WorkLog
						logs={task.logs.map((log) => ({
							...log,
							createdAt: log.createdAt.toISOString(),
						}))}
						taskId={task.id}
					/>
				)}
			</div>
		</main>
	);
}
