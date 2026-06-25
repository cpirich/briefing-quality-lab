import type { Metadata } from "next";

import { api } from "~/trpc/server";
import { GeniePageClient } from "./genie-page-client";

export const metadata: Metadata = {
	title: "Briefing Genie",
};

export default async function GeniePage() {
	const [sourcePackets, evalCases] = await Promise.all([
		api.genie.listSourcePackets(),
		api.lab.listEvalCases(),
	]);
	const caseTitlesBySourcePacketId = Object.fromEntries(
		evalCases.map((evalCase) => [evalCase.sourcePacketId, evalCase.title]),
	);

	return (
		<GeniePageClient
			caseTitlesBySourcePacketId={caseTitlesBySourcePacketId}
			sourcePackets={sourcePackets}
		/>
	);
}
