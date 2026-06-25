import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

const geistSans = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export const metadata: Metadata = {
	title: {
		default: "Briefing Genie Improvement Lab",
		template: "%s | Briefing Quality Lab",
	},
	description:
		"Evaluate and improve Briefing Genie with synthetic cases, run artifacts, and quality comparisons.",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html className={geistSans.variable} lang="en">
			<body>
				<TRPCReactProvider>{children}</TRPCReactProvider>
			</body>
		</html>
	);
}
