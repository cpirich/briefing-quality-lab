import type { Metadata } from "next";

import { GeniePageClient } from "./genie-page-client";

export const metadata: Metadata = {
	title: "Briefing Genie",
};

export default function GeniePage() {
	return <GeniePageClient />;
}
