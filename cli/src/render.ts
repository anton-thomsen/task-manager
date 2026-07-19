export type Estimate = "n/a" | { min_hours: number; max_hours: number };

export type Participant = { name: string; email: string; accepted: boolean };

export function formatParticipants(participants: Participant[]): string {
	return (
		participants
			.map((participant) =>
				participant.accepted
					? participant.name
					: `${participant.name} (pending)`,
			)
			.join(", ") || "-"
	);
}

export function formatEstimate(estimate: Estimate): string {
	if (estimate === "n/a") return "-";
	return estimate.min_hours === estimate.max_hours
		? `${estimate.min_hours}h`
		: `${estimate.min_hours}-${estimate.max_hours}h`;
}

export function renderTable(rows: string[][], header: string[]): string {
	const all = [header, ...rows];
	const widths = header.map((_, column) =>
		Math.max(...all.map((row) => (row[column] ?? "").length)),
	);
	return all
		.map((row) =>
			row
				.map((cell, column) => cell.padEnd(widths[column] ?? 0))
				.join("  ")
				.trimEnd(),
		)
		.join("\n");
}
