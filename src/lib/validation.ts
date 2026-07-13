import { z } from "zod";

export const int4IdSchema = z.coerce
	.number()
	.int()
	.positive()
	.max(2_147_483_647);

export const taskTitleSchema = z
	.string()
	.trim()
	.min(1, "A title is required.")
	.max(200);

export const taskDescriptionSchema = z.string().trim().max(2000).optional();

export const optionalDateSchema = z.preprocess(
	(value) =>
		value === "" || value === null || value === undefined ? undefined : value,
	z.coerce.date().optional(),
);

export function optionalPositiveInt(max: number) {
	return z.preprocess(
		(value) =>
			value === "" || value === null || value === undefined ? undefined : value,
		z.coerce.number().int().positive().max(max).optional(),
	);
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export function actionError(error: unknown, fallback: string): ActionResult {
	if (error instanceof z.ZodError) {
		return { ok: false, error: error.issues[0]?.message ?? fallback };
	}
	return { ok: false, error: fallback };
}
