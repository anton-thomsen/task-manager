import type { TaskStatus } from "~/lib/tasks";

export function hoursInputValue(hours: number | null | undefined): string {
	if (!hours) return "";
	return String(Number(hours.toFixed(2)));
}

export function formatHours(hours: number): string {
	return `${hoursInputValue(hours) || "0"}h`;
}

export function formatEstimateRange(
	min: number | null,
	max: number | null,
): string | null {
	if (min !== null && max !== null) {
		return min === max
			? formatHours(min)
			: `${hoursInputValue(min)}-${formatHours(max)}`;
	}
	if (max !== null) return `up to ${formatHours(max)}`;
	if (min !== null) return `${formatHours(min)}+`;
	return null;
}

export function formatDeadline(deadline: string): string {
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${deadline}T00:00:00Z`));
}

export function isOverdue(
	deadline: string | null,
	status: TaskStatus,
	now = new Date(),
): boolean {
	if (!deadline || status === "Finished") return false;
	return now.toISOString().slice(0, 10) > deadline;
}
