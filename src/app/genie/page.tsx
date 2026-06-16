import type { Metadata } from "next";

import { api } from "~/trpc/server";
import { GeniePageClient } from "./genie-page-client";

export const metadata: Metadata = {
	title: "Briefing Genie",
};

export default async function GeniePage() {
	const [sourcePackets, briefingOutputs] = await Promise.all([
		api.genie.listSourcePackets(),
		api.genie.listSeededBriefingOutputs(),
	]);

	return (
		<GeniePageClient
			briefingOutputs={briefingOutputs}
			sourcePackets={sourcePackets}
		/>
	);
}
