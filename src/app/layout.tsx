import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { Geist, Press_Start_2P } from "next/font/google";

export const metadata: Metadata = {
	title: "Task Manager",
	description: "A client-aware task manager for focused agency work.",
	icons: {
		apple: [{ sizes: "192x192", type: "image/png", url: "/icon-192.png" }],
		icon: [{ sizes: "192x192", type: "image/png", url: "/icon-192.png" }],
	},
};

export const viewport: Viewport = {
	themeColor: "#047857",
	width: "device-width",
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

const pressStart = Press_Start_2P({
	display: "swap",
	subsets: ["latin"],
	variable: "--font-pixel",
	weight: "400",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html className={`${geist.variable} ${pressStart.variable}`} lang="en">
			<body className="pin-board-bg min-h-screen text-stone-950">
				{children}
			</body>
		</html>
	);
}
