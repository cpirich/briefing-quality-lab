import { listBriefingOutputs, listSourcePackets } from "~/run-store";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const genieRouter = createTRPCRouter({
	listSourcePackets: publicProcedure.query(() => {
		return listSourcePackets();
	}),

	listSeededBriefingOutputs: publicProcedure.query(() => {
		return listBriefingOutputs();
	}),
});
