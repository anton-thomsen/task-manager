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

function isBidiControl(code: number): boolean {
	return (
		code === 0x061c ||
		code === 0x200e ||
		code === 0x200f ||
		(code >= 0x202a && code <= 0x202e) ||
		(code >= 0x2066 && code <= 0x2069)
	);
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
		else if (
			!(code <= 0x1f || (code >= 0x7f && code <= 0x9f)) &&
			!isBidiControl(code)
		) {
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

const graphemeSegmenter = new Intl.Segmenter(undefined, {
	granularity: "grapheme",
});
const combiningMark = /\p{Mark}/u;
const emojiPresentation = /\p{Emoji_Presentation}/u;
const emojiZwjSequence =
	/\p{Extended_Pictographic}(?:\p{Mark}|\p{Emoji_Modifier})*\u200d\p{Extended_Pictographic}/u;
const regionalIndicator = /\p{Regional_Indicator}/u;

function isZeroWidth(character: string, codePoint: number): boolean {
	return (
		combiningMark.test(character) ||
		(codePoint >= 0x200b && codePoint <= 0x200d) ||
		(codePoint >= 0x2060 && codePoint <= 0x2065) ||
		(codePoint >= 0x206a && codePoint <= 0x206f) ||
		codePoint === 0xfeff
	);
}

function isWide(codePoint: number): boolean {
	return (
		(codePoint >= 0x1100 && codePoint <= 0x115f) ||
		codePoint === 0x2329 ||
		codePoint === 0x232a ||
		(codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
		(codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
		(codePoint >= 0xf900 && codePoint <= 0xfaff) ||
		(codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
		(codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
		(codePoint >= 0xff00 && codePoint <= 0xff60) ||
		(codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
		(codePoint >= 0x1b000 && codePoint <= 0x1b2ff) ||
		(codePoint >= 0x20000 && codePoint <= 0x3fffd)
	);
}

function displayWidth(text: string): number {
	let width = 0;
	for (const { segment } of graphemeSegmenter.segment(text)) {
		const emojiWide =
			segment.includes("\ufe0f") ||
			segment.includes("\u20e3") ||
			regionalIndicator.test(segment) ||
			emojiZwjSequence.test(segment) ||
			(!segment.includes("\ufe0e") && emojiPresentation.test(segment));
		if (emojiWide) {
			width += 2;
			continue;
		}
		let segmentWidth = 0;
		for (const character of segment) {
			const codePoint = character.codePointAt(0);
			if (codePoint === undefined || isZeroWidth(character, codePoint))
				continue;
			segmentWidth = Math.max(segmentWidth, isWide(codePoint) ? 2 : 1);
		}
		width += segmentWidth;
	}
	return width;
}

function padDisplayEnd(text: string, width: number): string {
	return `${text}${" ".repeat(Math.max(0, width - displayWidth(text)))}`;
}

export function renderTable(rows: string[][], header: string[]): string {
	const all = [header, ...rows].map((row) => row.map(sanitizeSingleLine));
	const widths = header.map((_, column) =>
		Math.max(...all.map((row) => displayWidth(row[column] ?? ""))),
	);
	return all
		.map((row) =>
			row
				.map((cell, column) => padDisplayEnd(cell, widths[column] ?? 0))
				.join("  ")
				.trimEnd(),
		)
		.join("\n");
}
