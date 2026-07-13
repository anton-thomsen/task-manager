import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		background_color: "#f5f0e6",
		description: "A client-aware task manager for focused agency work.",
		display: "standalone",
		icons: [
			{ sizes: "192x192", src: "/icon-192.png", type: "image/png" },
			{ sizes: "512x512", src: "/icon-512.png", type: "image/png" },
		],
		name: "Task Manager",
		short_name: "Tasks",
		shortcuts: [
			{
				icons: [{ sizes: "192x192", src: "/icon-192.png" }],
				name: "Add task",
				short_name: "Add task",
				url: "/quick-add",
			},
		],
		start_url: "/",
		theme_color: "#047857",
	};
}
