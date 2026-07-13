import { timingSafeEqual } from "node:crypto";

export function tokensMatch(candidate: string, expected: string): boolean {
	const candidateBuffer = Buffer.from(candidate);
	const expectedBuffer = Buffer.from(expected);
	return (
		candidateBuffer.length === expectedBuffer.length &&
		timingSafeEqual(candidateBuffer, expectedBuffer)
	);
}
