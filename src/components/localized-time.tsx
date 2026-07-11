"use client";

import { useEffect, useState } from "react";

export function LocalizedTime({ iso }: { iso: string }) {
	const [label, setLabel] = useState(
		`${iso.slice(0, 16).replace("T", " ")} UTC`,
	);

	useEffect(() => {
		setLabel(
			new Intl.DateTimeFormat("en", {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(new Date(iso)),
		);
	}, [iso]);

	return <time dateTime={iso}>{label}</time>;
}
