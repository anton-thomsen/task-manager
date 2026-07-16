import type { LabelOption, TaskOption } from "~/lib/tasks";
import { taskStatuses } from "~/lib/tasks";
import { TaskCard, type TaskCardValue } from "./task-card";
import type { UserRef } from "./user-avatar";

export function TaskBoard({
	tasks,
	clients,
	labels,
	members,
}: {
	tasks: TaskCardValue[];
	clients: TaskOption[];
	labels: LabelOption[];
	members?: UserRef[];
}) {
	return (
		<section className="flex gap-5 overflow-x-auto pb-7 lg:grid lg:grid-cols-4 lg:overflow-visible">
			{taskStatuses.map((status) => {
				const lane = tasks.filter((task) => task.status === status);
				return (
					<section
						className="min-h-80 w-[19rem] shrink-0 rounded-2xl border-2 border-stone-900 bg-[#d8ddc2] p-3 shadow-[5px_5px_0_#1c1917] lg:w-auto"
						data-testid={`lane-${status}`}
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
								<div data-testid={`task-${task.id}`} key={task.id}>
									<TaskCard
										clients={clients}
										labels={labels}
										members={members}
										task={task}
									/>
								</div>
							))}
							{lane.length === 0 ? (
								<p className="rounded-xl border border-stone-600 border-dashed p-5 text-center text-sm text-stone-600">
									Clear for now
								</p>
							) : null}
						</div>
					</section>
				);
			})}
		</section>
	);
}
