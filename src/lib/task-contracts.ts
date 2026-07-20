import { z } from "zod";

import { taskStatuses } from "./tasks.ts";

export const taskStatusContract = z.enum(taskStatuses);

const estimateRangeContract = z
	.object({
		min_hours: z.number().positive().max(100_000),
		max_hours: z.number().positive().max(100_000),
	})
	.refine(
		(value) => value.min_hours <= value.max_hours,
		"min_hours cannot exceed max_hours.",
	);

export const estimateContract = z
	.union([z.literal("n/a"), estimateRangeContract])
	.describe(
		'Estimated effort as {"min_hours", "max_hours"} in decimal hours, or the literal "n/a" when the user explicitly has no estimate. If the user did not mention an estimate, ask them.',
	);

export type EstimateContract = z.infer<typeof estimateContract>;

const serializedEstimateRangeContract = z
	.object({
		min_hours: z.number().positive().nullable(),
		max_hours: z.number().positive().nullable(),
	})
	.refine(
		(value) => value.min_hours !== null || value.max_hours !== null,
		"At least one estimate bound is required.",
	)
	.refine(
		(value) =>
			value.min_hours === null ||
			value.max_hours === null ||
			value.min_hours <= value.max_hours,
		"min_hours cannot exceed max_hours.",
	);

export const serializedEstimateContract = z.union([
	z.literal("n/a"),
	serializedEstimateRangeContract,
]);

export type SerializedEstimate = z.infer<typeof serializedEstimateContract>;
