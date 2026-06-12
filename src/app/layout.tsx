import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";

import { TRPCReactProvider } from "~/trpc/react";

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
		<html className={GeistSans.variable} lang="en">
			<body>
				<TRPCReactProvider>{children}</TRPCReactProvider>
			</body>
		</html>
	);
}
