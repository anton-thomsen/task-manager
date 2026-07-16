"use client";

import type { CSSProperties } from "react";

export type AnimationCenter = {
	x: number;
	y: number;
};

const createPixels = [
	"north",
	"ember",
	"moss",
	"ivory",
	"west",
	"spark",
	"fern",
	"paper",
	"east",
	"flash",
	"leaf",
	"chalk",
	"south",
	"glint",
] as const;

export function CreateSuccessAnimation({
	center,
	onSkip,
}: {
	center: AnimationCenter;
	onSkip: () => void;
}) {
	return (
		<button
			aria-label="Skip create animation"
			className="pixel-create-overlay"
			onClick={onSkip}
			style={
				{
					"--star-x": `${center.x}px`,
					"--star-y": `${center.y}px`,
				} as CSSProperties
			}
			type="button"
		>
			{createPixels.map((pixel, index) => (
				<span
					className="create-pixel"
					key={pixel}
					style={
						{
							"--pixel-index": index,
							"--pixel-x": `${((index * 37) % 110) - 55}px`,
							"--pixel-y": `${((index * 53) % 90) - 45}px`,
						} as CSSProperties
					}
				/>
			))}
			<span className="pixel-star" />
		</button>
	);
}
