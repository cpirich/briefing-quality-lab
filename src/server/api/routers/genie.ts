import {
	listBriefingOutputs,
	listEvalCases,
	listSourcePackets,
} from "~/run-store";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

async function listPublicSourcePackets() {
	const [sourcePackets, evalCases] = await Promise.all([
		listSourcePackets(),
		listEvalCases(),
	]);
	const visibleSourcePacketIds = new Set(
		evalCases
			.filter((evalCase) => !evalCase.holdout)
			.map((evalCase) => evalCase.sourcePacketId),
	);

	return sourcePackets.filter((packet) =>
		visibleSourcePacketIds.has(packet.id),
	);
}

async function listPublicBriefingOutputs() {
	const [briefingOutputs, evalCases] = await Promise.all([
		listBriefingOutputs(),
		listEvalCases(),
	]);
	const visibleCaseIds = new Set(
		evalCases
			.filter((evalCase) => !evalCase.holdout)
			.map((evalCase) => evalCase.id),
	);

	return briefingOutputs.filter((output) => visibleCaseIds.has(output.caseId));
}

export const genieRouter = createTRPCRouter({
	listSourcePackets: publicProcedure.query(() => {
		return listPublicSourcePackets();
	}),

	listSeededBriefingOutputs: publicProcedure.query(() => {
		return listPublicBriefingOutputs();
	}),
});
