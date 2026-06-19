import {
	type BriefingOutput,
	BriefingOutputSchema,
	type GenerationTrace,
	GenerationTraceSchema,
	type GenerationVariant,
	type SourcePacket,
} from "~/schemas";
import { localExtractiveVariant } from "./variants";

type GenerateBriefingInput = {
	sourcePacket: SourcePacket;
	userRequest: string;
	runId?: string;
	variant?: GenerationVariant;
	now?: Date;
};

type GenerateBriefingResult = {
	briefing: BriefingOutput;
	trace: GenerationTrace;
};

const sentenceBoundaryPattern = /(?<=[.!?])\s+/;

function compactWhitespace(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

function firstSentence(value: string) {
	return compactWhitespace(value).split(sentenceBoundaryPattern)[0] ?? "";
}

function truncate(value: string, maxLength: number) {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength - 1).trimEnd()}.`;
}

function buildClaimText(source: SourcePacket["sources"][number]) {
	const evidence = truncate(firstSentence(source.body), 210);
	return `${source.title}: ${evidence}`;
}

function buildSummary(sourcePacket: SourcePacket, userRequest: string) {
	return truncate(
		`${sourcePacket.summary} Briefing focus: ${compactWhitespace(userRequest)}`,
		360,
	);
}

function buildOpenQuestions(sourcePacket: SourcePacket) {
	const titles = sourcePacket.sources.slice(3, 5).map((source) => source.title);

	if (titles.length === 0) {
		return [
			"Confirm whether newer source material changes the recommendation.",
		];
	}

	return titles.map(
		(title) =>
			`Confirm whether ${title.toLowerCase()} has newer follow-up data.`,
	);
}

function estimateTokens(value: string) {
	return Math.ceil(value.length / 4);
}

export async function generateBriefing({
	sourcePacket,
	userRequest,
	runId = "interactive-local-extractive",
	variant = localExtractiveVariant,
	now = new Date(),
}: GenerateBriefingInput): Promise<GenerateBriefingResult> {
	const startedAt = now.getTime();
	const selectedSources = sourcePacket.sources.slice(0, 3);
	const caseId = sourcePacket.caseId;
	const briefing = BriefingOutputSchema.parse({
		id: `${caseId}-${variant.id}`,
		sourcePacketId: sourcePacket.id,
		caseId,
		title: `${sourcePacket.title} Briefing`,
		summary: buildSummary(sourcePacket, userRequest),
		claims: selectedSources.map((source) => ({
			text: buildClaimText(source),
			citations: [source.id],
		})),
		openQuestions: buildOpenQuestions(sourcePacket),
		recommendation: truncate(
			`Use this as a fast first pass, then inspect source tension and citation support in the lab before treating the recommendation as shippable.`,
			260,
		),
		metadata: {
			variant: variant.label,
			runId,
			model: variant.model,
		},
	});
	const prompt = [
		"Generate a concise, citation-aware strategy briefing from the provided synthetic source packet.",
		`User request: ${compactWhitespace(userRequest)}`,
		`Source packet: ${sourcePacket.title}`,
	].join("\n");
	const outputText = JSON.stringify(briefing);
	const trace = GenerationTraceSchema.parse({
		id: `${briefing.id}-trace`,
		runId,
		caseId,
		sourcePacketId: sourcePacket.id,
		input: {
			userRequest,
			sourcePacketPath: `data/source-packets/${sourcePacket.id}.json`,
		},
		messages: [
			{
				role: "system",
				content:
					"You are Briefing Genie. Return a short briefing with source citations.",
			},
			{
				role: "user",
				content: prompt,
			},
		],
		model: {
			provider: variant.provider,
			name: variant.model,
			temperature: variant.temperature,
		},
		output: briefing,
		toolCalls: [],
		cost: {
			inputTokens: estimateTokens(prompt),
			outputTokens: estimateTokens(outputText),
			estimatedUsd: 0,
		},
		latencyMs: Math.max(1, Date.now() - startedAt),
		artifactPaths: [`data/source-packets/${sourcePacket.id}.json`],
	});

	return {
		briefing,
		trace,
	};
}
