import { z } from "zod";

import { compareRuns, listArtifacts, listEvalCases } from "~/run-store";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const labRouter = createTRPCRouter({
	listEvalCases: publicProcedure.query(() => {
		return listEvalCases();
	}),

	listArtifacts: publicProcedure.query(() => {
		return listArtifacts();
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
});
