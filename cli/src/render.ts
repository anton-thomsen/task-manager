import type { SerializedEstimate } from "../../src/lib/task-contracts.ts";

export type Estimate = SerializedEstimate;

export type Participant = { name: string; email: string; accepted: boolean };

export function formatParticipants(participants: Participant[]): string {
	return (
		participants
			.map((participant) =>
				participant.accepted
					? sanitizeSingleLine(participant.name)
					: `${sanitizeSingleLine(participant.name)} (pending)`,
			)
			.join(", ") || "-"
	);
}

export function formatEstimate(estimate: Estimate): string {
	if (estimate === "n/a") return "-";
	if (estimate.min_hours === null && estimate.max_hours === null) return "-";
	if (estimate.min_hours === null) return `up to ${estimate.max_hours}h`;
	if (estimate.max_hours === null) return `${estimate.min_hours}h+`;
	return estimate.min_hours === estimate.max_hours
		? `${estimate.min_hours}h`
		: `${estimate.min_hours}-${estimate.max_hours}h`;
}

function controlStringEnd(text: string, start: number): number | null {
	for (let index = start; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		if (code === 0x07 || code === 0x9c) return index + 1;
		if (code === 0x1b && text.charCodeAt(index + 1) === 0x5c) return index + 2;
	}
	return null;
}

function skipCsi(text: string, start: number): number {
	for (let index = start; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		if (code >= 0x40 && code <= 0x7e) return index + 1;
	}
	return text.length;
}

function skipEscapeSequence(text: string, start: number): number {
	let index = start;
	while (index < text.length) {
		const code = text.charCodeAt(index);
		if (code >= 0x30 && code <= 0x7e) return index + 1;
		if (code < 0x20 || code > 0x2f) return index;
		index += 1;
	}
	return text.length;
}

function sanitizeTerminalText(
	text: string,
	preserveLineFeeds: boolean,
): string {
	let clean = "";
	for (let index = 0; index < text.length; ) {
		const code = text.charCodeAt(index);
		if (code === 0x1b) {
			const next = text.charCodeAt(index + 1);
			if (next === 0x5b) {
				index = skipCsi(text, index + 2);
				continue;
			}
			if ([0x50, 0x58, 0x5d, 0x5e, 0x5f].includes(next)) {
				index = controlStringEnd(text, index + 2) ?? index + 2;
				continue;
			}
			index = skipEscapeSequence(text, index + 1);
			continue;
		}
		if (code === 0x9b) {
			index = skipCsi(text, index + 1);
			continue;
		}
		if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(code)) {
			index = controlStringEnd(text, index + 1) ?? index + 1;
			continue;
		}
		if (code === 0x0a && preserveLineFeeds) clean += "\n";
		else if (!(code <= 0x1f || (code >= 0x7f && code <= 0x9f))) {
			clean += text[index];
		}
		index += 1;
	}
	return clean;
}

export function sanitizeSingleLine(text: string): string {
	return sanitizeTerminalText(text, false);
}

export function sanitizeMultiline(text: string): string {
	return sanitizeTerminalText(text, true);
}

export function printHuman(text: string): void {
	console.log(sanitizeMultiline(text));
}

export function renderTable(rows: string[][], header: string[]): string {
	const all = [header, ...rows].map((row) => row.map(sanitizeSingleLine));
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
