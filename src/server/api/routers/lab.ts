import { z } from "zod";

import { getEvalRun, startEvalRun } from "~/lab/eval-runs";
import {
	compareRuns,
	listArtifacts,
	listCaseBreakdown,
	listEvalCases,
} from "~/run-store";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

async function listPublicEvalCases() {
	const evalCases = await listEvalCases();

	return evalCases.map((evalCase) => {
		if (!evalCase.holdout) {
			return evalCase;
		}

		return {
			id: evalCase.id,
			title: evalCase.title,
			sourcePacketId: evalCase.sourcePacketId,
			holdout: evalCase.holdout,
			demoHighlight: evalCase.demoHighlight,
			redacted: true,
			metadata: {
				synthetic: evalCase.metadata.synthetic,
				publicSafe: evalCase.metadata.publicSafe,
				notes: evalCase.metadata.notes,
			},
		};
	});
}

export const labRouter = createTRPCRouter({
	listEvalCases: publicProcedure.query(() => {
		return listPublicEvalCases();
	}),

	listArtifacts: publicProcedure.query(() => {
		return listArtifacts();
	}),

	listCaseBreakdown: publicProcedure
		.input(
			z
				.object({
					baselineRunId: z.string().min(1).optional(),
					candidateRunId: z.string().min(1).optional(),
				})
				.optional(),
		)
		.query(({ input }) => {
			return listCaseBreakdown(input);
		}),

	compareRuns: publicProcedure
		.input(
			z
				.object({
					baselineRunId: z.string().min(1).optional(),
					candidateRunId: z.string().min(1).optional(),
				})
				.optional(),
		)
		.query(({ input }) => {
			return compareRuns(input);
		}),

	startEvalRun: publicProcedure
		.input(
			z
				.object({
					caseIds: z.array(z.string().min(1)).optional(),
					includeHoldouts: z.boolean().optional(),
					provider: z.literal("local").optional(),
				})
				.optional(),
		)
		.mutation(({ input }) => {
			return startEvalRun(input);
		}),

	getEvalRun: publicProcedure
		.input(
			z.object({
				jobId: z.string().min(1),
			}),
		)
		.query(({ input }) => {
			return getEvalRun(input.jobId);
		}),
});
