import type { TaskStatus } from "~/lib/tasks";

export function formatMinutes(total: number): string {
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	if (hours === 0) return `${minutes}m`;
	if (minutes === 0) return `${hours}h`;
	return `${hours}h ${minutes}m`;
}

export function minutesAsHours(minutes: number | null | undefined): string {
	if (!minutes) return "";
	const hours = minutes / 60;
	return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function formatEstimateRange(
	min: number | null,
	max: number | null,
): string | null {
	if (min !== null && max !== null) {
		return min === max
			? `${minutesAsHours(min)}h`
			: `${minutesAsHours(min)}-${minutesAsHours(max)}h`;
	}
	if (max !== null) return `up to ${minutesAsHours(max)}h`;
	if (min !== null) return `${minutesAsHours(min)}h+`;
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
