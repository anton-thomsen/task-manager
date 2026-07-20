import { z } from "zod";
import { estimateContract, taskStatusContract } from "~/lib/task-contracts";
import { taskDescriptionSchema, taskTitleSchema } from "~/lib/validation";

/**
 * Contract fields are required but never nullable: callers must pass either a
 * real value or the explicit opt-out literal ("none", "n/a", "no label"). The
 * tool schemas enforce that an AI caller cannot silently omit them.
 */

const isoDateSchema = z
	.string()
	.refine((value) => {
		const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
		const isDateTime = z
			.string()
			.datetime({ offset: true })
			.safeParse(value).success;
		return (isDateOnly || isDateTime) && !Number.isNaN(Date.parse(value));
	}, 'Deadline must be an ISO date (YYYY-MM-DD) or the literal "none".')
	.transform((value) => new Date(value));

export const deadlineContract = z
	.union([z.literal("none"), isoDateSchema])
	.describe(
		'Deadline as an ISO date (YYYY-MM-DD), or the literal "none" when the user explicitly wants no deadline. If the user did not mention a deadline, ask them instead of guessing.',
	);

export const clientContract = z
	.string()
	.trim()
	.min(1)
	.max(50)
	.describe(
		'Name of an existing client, or the literal "none" when the user explicitly wants no client. Use list_clients to see options; if the user did not mention a client, ask them.',
	);

export const labelContract = z
	.string()
	.trim()
	.min(1)
	.max(50)
	.describe(
		'Name of an existing label, or the literal "no label" when the user explicitly wants none. Use list_labels to see options; if the user did not mention a label, ask them.',
	);

export { estimateContract };

export const subtaskEstimateContract = z
	.union([
		z.literal("n/a"),
		z
			.number()
			.positive()
			.max(5)
			.refine(
				(value) => Number.isInteger(value * 4),
				"Subtask estimates use 15-minute increments (0.25 steps).",
			),
	])
	.describe(
		'Estimated hours in 15-minute increments (0.25 steps, max 5), or "n/a" when the user has no estimate.',
	);

export const detailsContract = z
	.string()
	.trim()
	.min(1)
	.max(20_000)
	.describe(
		'What actually happened during this work: blockers, surprises, why it took the time it took. Required for later estimate-vs-actual analysis. Pass the literal "nothing notable" only when the user explicitly has nothing to add.',
	);

export const createTaskShape = {
	title: taskTitleSchema.describe("Short task title."),
	description: taskDescriptionSchema.describe(
		"Optional longer description of the task.",
	),
	deadline: deadlineContract,
	client: clientContract,
	estimate: estimateContract,
	label: labelContract,
	status: taskStatusContract
		.default("Inbox")
		.describe("Board lane, defaults to Inbox."),
};

export const createTaskObject = z.object(createTaskShape);

export type CreateTaskInput = z.infer<typeof createTaskObject>;
