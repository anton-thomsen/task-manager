import Link from "next/link";
import { SignOutButton } from "~/components/sign-out-button";
import { TaskBoard } from "~/components/task-board";
import type { TaskCardValue } from "~/components/task-card";
import { TaskForm } from "~/components/task-form";
import { isOverdue } from "~/lib/format";
import { int4IdSchema } from "~/lib/validation";
import { requireMember } from "~/server/auth";
import { db } from "~/server/db";
import { listOrgMembers } from "~/server/org-members";
import { taskWhereFor } from "~/server/task-access";
import type { Prisma } from "../../generated/prisma";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function selectedId(value: string | string[] | undefined): number | undefined {
	const raw = Array.isArray(value) ? value[0] : value;
	const parsed = int4IdSchema.safeParse(raw);
	return parsed.success ? parsed.data : undefined;
}

export default async function HomePage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const member = await requireMember();
	const filters = await searchParams;
	const clientId = selectedId(filters.client);
	const labelId = selectedId(filters.label);
	const showArchived = filters.archived === "1";
	const isManager = member.role === "owner" || member.role === "admin";
	const rawScope = Array.isArray(filters.scope)
		? filters.scope[0]
		: filters.scope;
	const scope =
		isManager && (rawScope === "mine" || rawScope === "delegated")
			? rawScope
			: undefined;
	const scopeWhere: Prisma.TaskWhereInput[] =
		scope === "mine"
			? [
					{
						OR: [
							{ createdById: member.userId },
							{ assignees: { some: { userId: member.userId } } },
						],
					},
				]
			: scope === "delegated"
				? [
						{
							assignees: {
								some: {
									assignedById: member.userId,
									userId: { not: member.userId },
								},
							},
						},
					]
				: [];

	const [tasks, clients, labels, members] = await Promise.all([
		db.task.findMany({
			where: {
				AND: [taskWhereFor(member), ...scopeWhere],
				archivedAt: showArchived ? undefined : null,
				clientId,
				labelId,
			},
			orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
			include: {
				client: true,
				label: true,
				subtasks: { select: { status: true } },
				assignees: {
					orderBy: { createdAt: "asc" },
					select: {
						userId: true,
						acceptedAt: true,
						user: { select: { name: true, image: true } },
						assignedBy: { select: { name: true } },
					},
				},
				_count: { select: { logs: true } },
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
		listOrgMembers(member.orgId),
	]);

	const taskValues: TaskCardValue[] = tasks.map((task) => {
		const deadline = task.deadline?.toISOString().slice(0, 10) ?? null;
		const myAssignment = task.assignees.find(
			({ userId }) => userId === member.userId,
		);
		return {
			id: task.id,
			title: task.title,
			description: task.description,
			status: task.status,
			deadline,
			estimateMinHours: task.estimateMinHours,
			estimateMaxHours: task.estimateMaxHours,
			clientId: task.clientId,
			labelId: task.labelId,
			assigneeIds: task.assignees.map(({ userId }) => userId),
			client: task.client,
			label: task.label,
			archivedAt: task.archivedAt?.toISOString() ?? null,
			subtaskCount: task.subtasks.length,
			finishedSubtaskCount: task.subtasks.filter(
				({ status }) => status === "Finished",
			).length,
			logCount: task._count.logs,
			overdue: isOverdue(deadline, task.status),
			// Only surface avatars when someone besides the viewer participates;
			// a solo task showing your own face is noise.
			participants: task.assignees.some(
				({ userId }) => userId !== member.userId,
			)
				? task.assignees.map(({ userId, user }) => ({
						userId,
						name: user.name,
						image: user.image,
					}))
				: undefined,
			pendingFrom:
				myAssignment && myAssignment.acceptedAt === null
					? (myAssignment.assignedBy?.name ?? "a teammate")
					: null,
		};
	});

	return (
		<main className="mx-auto max-w-[100rem] p-4 sm:p-7">
			<header className="mb-7 border-stone-900 border-b-2 pb-5">
				<p className="pixel-accent mb-2 text-[0.58rem] text-emerald-800 uppercase">
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
					<div className="flex items-center gap-3">
						<Link
							className="font-semibold text-sm underline underline-offset-4"
							href="/archived"
						>
							Archived
						</Link>
						<Link
							className="font-semibold text-sm underline underline-offset-4"
							href="/settings"
						>
							Settings
						</Link>
						<SignOutButton />
						<TaskForm clients={clients} labels={labels} members={members} />
					</div>
				</div>
				{isManager && members.length > 1 ? (
					<nav aria-label="Board scope" className="mt-4 flex flex-wrap gap-2">
						{(
							[
								["", "Everyone"],
								["mine", "Mine"],
								["delegated", "Delegated by me"],
							] as const
						).map(([value, label]) => {
							const params = new URLSearchParams();
							if (clientId) params.set("client", String(clientId));
							if (labelId) params.set("label", String(labelId));
							if (showArchived) params.set("archived", "1");
							if (value) params.set("scope", value);
							const query = params.toString();
							const active = (scope ?? "") === value;
							return (
								<Link
									className={`rounded-full border border-stone-900 px-3 py-1 font-bold text-xs ${active ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-100"}`}
									href={query ? `/?${query}` : "/"}
									key={label}
								>
									{label}
								</Link>
							);
						})}
					</nav>
				) : null}
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
				<div className="min-w-0 grow" />
				<div className="flex items-center gap-3 pb-1.5">
					<label className="flex items-center gap-2 text-sm">
						<input
							className="size-4 accent-emerald-700"
							defaultChecked={showArchived}
							name="archived"
							type="checkbox"
							value="1"
						/>
						Show archived
					</label>
					<Link
						className="font-semibold text-sm underline underline-offset-4"
						href="/archived"
					>
						View all →
					</Link>
				</div>
			</form>

			<TaskBoard
				clients={clients}
				labels={labels}
				members={members}
				tasks={taskValues}
			/>
		</main>
	);
}
