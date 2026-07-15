"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { formatHours, logVariance } from "~/lib/format";
import { deleteLog } from "~/server/actions/logs";
import { LocalizedTime } from "./localized-time";
import { UserAvatar } from "./user-avatar";
import { WorkLogForm } from "./work-log-form";

type LogImage = {
	id: number;
	fileName: string;
};

type LogAuthor = {
	id: string;
	name: string;
	image: string | null;
};

type Log = {
	id: number;
	note: string;
	details: string | null;
	hoursSpent: number | null;
	estimatedHours: number | null;
	subtask: { title: string } | null;
	createdAt: string;
	author: LogAuthor | null;
	images: LogImage[];
};

export function WorkLog({ logs, taskId }: { logs: Log[]; taskId: number }) {
	const [error, setError] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<number | null>(null);

	async function remove(log: Log) {
		if (!window.confirm(`Delete the work log entry “${log.note}”?`)) return;
		setError(null);
		setDeletingId(log.id);
		try {
			const result = await deleteLog(log.id);
			if (!result.ok) setError(result.error);
		} catch {
			setError("The work log entry could not be deleted.");
		} finally {
			setDeletingId(null);
		}
	}

	return (
		<section className="space-y-5">
			<div>
				<h2 className="font-bold text-2xl">Work log</h2>
				<p className="mt-1 text-sm text-stone-600">
					Capture what changed, the time it took, and the context you will need
					later.
				</p>
			</div>
			<WorkLogForm taskId={taskId} />
			{error ? (
				<p
					className="rounded-md bg-red-100 p-3 text-red-900 text-sm"
					role="alert"
				>
					{error}
				</p>
			) : null}

			<div className="space-y-3">
				{logs.length === 0 ? (
					<p className="rounded-xl border-2 border-stone-500 border-dashed bg-white/40 p-8 text-center text-sm text-stone-600">
						No work logged yet.
					</p>
				) : null}
				{logs.map((log) => {
					const variance = logVariance(log);
					return (
						<article
							className="rounded-xl border-2 border-stone-900 bg-[#fffdf6] p-4 shadow-[3px_3px_0_#1c1917] sm:p-5"
							key={log.id}
						>
							<header className="flex items-start justify-between gap-4">
								<div>
									<p className="flex flex-wrap items-center gap-1.5 text-stone-500 text-xs">
										{log.author ? (
											<>
												<UserAvatar
													size="sm"
													user={{
														userId: log.author.id,
														name: log.author.name,
														image: log.author.image,
													}}
												/>
												<span className="font-semibold text-stone-700">
													{log.author.name}
												</span>
												<span aria-hidden="true">·</span>
											</>
										) : null}
										<LocalizedTime iso={log.createdAt} />
										{log.hoursSpent ? (
											<span>
												· {formatHours(log.hoursSpent)} · est.{" "}
												{log.estimatedHours !== null
													? formatHours(log.estimatedHours)
													: "N/A"}
											</span>
										) : null}
										{variance ? (
											<span
												className={`rounded-full border px-1.5 py-0.5 font-semibold ${
													variance === "on estimate"
														? "border-stone-400 text-stone-600"
														: variance.endsWith("over")
															? "border-red-300 bg-red-50 text-red-800"
															: "border-emerald-300 bg-emerald-50 text-emerald-800"
												}`}
											>
												{variance}
											</span>
										) : null}
									</p>
									<h3 className="mt-1 font-bold text-lg">{log.note}</h3>
									{log.subtask ? (
										<p className="mt-0.5 text-stone-500 text-xs">
											From subtask: {log.subtask.title}
										</p>
									) : null}
								</div>
								<button
									aria-label={`Delete work log: ${log.note}`}
									className="ghost-icon-button shrink-0 text-red-700 hover:bg-red-100"
									disabled={deletingId === log.id}
									onClick={() => remove(log)}
									title="Delete work log"
									type="button"
								>
									<Trash2 aria-hidden="true" size={17} />
								</button>
							</header>
							{log.details ? (
								<p className="mt-4 whitespace-pre-wrap border-stone-300 border-t pt-4 text-sm leading-relaxed">
									{log.details}
								</p>
							) : null}
							{log.images.length > 0 ? (
								<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									{log.images.map((image) => (
										<a
											className="overflow-hidden rounded-lg border border-stone-900 bg-stone-100"
											href={`/api/work-log-images/${image.id}`}
											key={image.id}
											rel="noreferrer"
											target="_blank"
										>
											<Image
												alt={image.fileName}
												className="h-48 w-full object-cover"
												height={600}
												src={`/api/work-log-images/${image.id}`}
												unoptimized
												width={800}
											/>
											<span className="block truncate border-stone-900 border-t bg-white px-2 py-1 text-xs">
												{image.fileName}
											</span>
										</a>
									))}
								</div>
							) : null}
						</article>
					);
				})}
			</div>
		</section>
	);
}
