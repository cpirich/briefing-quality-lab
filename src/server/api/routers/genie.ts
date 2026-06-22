import { z } from "zod";

import { generateBriefing } from "~/genie/generate-briefing";
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

	generateBriefing: publicProcedure
		.input(
			z.object({
				sourcePacketId: z.string().min(1),
				userRequest: z.string().min(1).optional(),
				// This demo app is scoped to local dev-mode runs. If this endpoint is
				// exposed in a deployed environment, OpenAI-backed generation must move
				// behind authentication and usage controls before accepting this input.
				provider: z.enum(["auto", "local", "openai"]).optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const sourcePackets = await listPublicSourcePackets();
			const sourcePacket = sourcePackets.find(
				(packet) => packet.id === input.sourcePacketId,
			);

			if (!sourcePacket) {
				throw new Error(`Unknown public source packet ${input.sourcePacketId}`);
			}

			return generateBriefing({
				sourcePacket,
				userRequest:
					input.userRequest ??
					`Generate a concise strategy briefing for ${sourcePacket.title}.`,
				provider: input.provider,
			});
		}),
});
