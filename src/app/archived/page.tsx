import Link from "next/link";

import {
	ArchivedTaskRow,
	type ArchivedTaskValue,
} from "~/components/archived-task-row";
import { int4IdSchema } from "~/lib/validation";
import { requireSession } from "~/server/auth";
import { db } from "~/server/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined): string {
	return typeof value === "string" ? value : "";
}

function selectedId(value: string | string[] | undefined): number | undefined {
	const parsed = int4IdSchema.safeParse(scalar(value));
	return parsed.success ? parsed.data : undefined;
}

export default async function ArchivedPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	await requireSession();
	const params = await searchParams;
	const q = scalar(params.q).trim().slice(0, 100);
	const clientId = selectedId(params.client);
	const labelId = selectedId(params.label);
	const parsedPage = int4IdSchema.safeParse(scalar(params.page));
	const page = parsedPage.success ? Math.min(parsedPage.data, 10_000) : 1;
	const take = 50;

	const [tasks, clients, labels] = await Promise.all([
		db.task.findMany({
			where: {
				archivedAt: { not: null },
				clientId,
				labelId,
				...(q
					? {
							OR: [
								{ title: { contains: q, mode: "insensitive" } },
								{ description: { contains: q, mode: "insensitive" } },
							],
						}
					: {}),
			},
			orderBy: { archivedAt: "desc" },
			skip: (page - 1) * take,
			take: take + 1,
			include: {
				client: true,
				label: true,
				subtasks: { select: { id: true } },
				logs: { select: { minutesSpent: true } },
			},
		}),
		db.client.findMany({ orderBy: { name: "asc" } }),
		db.label.findMany({ orderBy: { name: "asc" } }),
	]);
	const hasMore = tasks.length > take;
	const values: ArchivedTaskValue[] = tasks.slice(0, take).map((task) => ({
		id: task.id,
		title: task.title,
		archivedAt: task.archivedAt?.toISOString() ?? "",
		archivedLabel: new Intl.DateTimeFormat("en", {
			dateStyle: "medium",
			timeZone: "UTC",
		}).format(task.archivedAt ?? undefined),
		client: task.client,
		label: task.label,
		logCount: task.logs.length,
		totalLogged: task.logs.reduce(
			(total, log) => total + (log.minutesSpent ?? 0),
			0,
		),
		subtaskCount: task.subtasks.length,
	}));
	const pageHref = (nextPage: number) => {
		const next = new URLSearchParams();
		if (q) next.set("q", q);
		if (clientId) next.set("client", String(clientId));
		if (labelId) next.set("label", String(labelId));
		next.set("page", String(nextPage));
		return `/archived?${next.toString()}`;
	};

	return (
		<main className="mx-auto max-w-5xl p-4 sm:p-8">
			<header className="mb-6 border-stone-900 border-b-2 pb-5">
				<Link
					className="font-semibold text-sm underline underline-offset-4"
					href="/"
				>
					← Board
				</Link>
				<h1 className="display-font mt-3 font-black text-4xl sm:text-5xl">
					Archived work
				</h1>
				<p className="mt-1 text-stone-600">
					Search finished context without crowding the active board.
				</p>
			</header>
			<form
				className="mb-6 grid gap-3 rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-3 shadow-[4px_4px_0_#1c1917] sm:grid-cols-[1fr_auto_auto_auto]"
				method="get"
			>
				<label className="sr-only" htmlFor="archived-search">
					Search archived tasks
				</label>
				<input
					className="rounded-md border border-stone-900 bg-white px-3 py-2 text-sm"
					defaultValue={q}
					id="archived-search"
					maxLength={100}
					name="q"
					placeholder="Search title or description"
				/>
				<label className="sr-only" htmlFor="archived-client">
					Filter by client
				</label>
				<select
					className="rounded-md border border-stone-900 bg-white px-3 py-2 text-sm"
					defaultValue={clientId ?? ""}
					id="archived-client"
					name="client"
				>
					<option value="">All clients</option>
					{clients.map((client) => (
						<option key={client.id} value={client.id}>
							{client.name}
						</option>
					))}
				</select>
				<label className="sr-only" htmlFor="archived-label">
					Filter by label
				</label>
				<select
					className="rounded-md border border-stone-900 bg-white px-3 py-2 text-sm"
					defaultValue={labelId ?? ""}
					id="archived-label"
					name="label"
				>
					<option value="">All labels</option>
					{labels.map((label) => (
						<option key={label.id} value={label.id}>
							{label.name}
						</option>
					))}
				</select>
				<button
					className="rounded-md bg-stone-900 px-4 py-2 font-bold text-sm text-white"
					type="submit"
				>
					Search
				</button>
			</form>
			<div className="space-y-3">
				{values.map((task) => (
					<ArchivedTaskRow key={task.id} task={task} />
				))}
			</div>
			{values.length === 0 ? (
				<p className="rounded-2xl border-2 border-stone-400 border-dashed p-10 text-center text-stone-600">
					No archived tasks match this view.
				</p>
			) : null}
			<nav
				aria-label="Archived task pages"
				className="mt-6 flex justify-between"
			>
				{page > 1 ? (
					<Link className="font-semibold underline" href={pageHref(page - 1)}>
						← Previous
					</Link>
				) : (
					<span />
				)}
				{hasMore ? (
					<Link className="font-semibold underline" href={pageHref(page + 1)}>
						Next →
					</Link>
				) : null}
			</nav>
		</main>
	);
}
