import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
	BriefingClaimSchema,
	type BriefingOutput,
	BriefingOutputSchema,
	type GenerationTrace,
	GenerationTraceSchema,
	type GenerationVariant,
	type SourcePacket,
} from "~/schemas";
import { localExtractiveVariant, openAIResponsesVariant } from "./variants";

interface GenerateBriefingInput {
	sourcePacket: SourcePacket;
	userRequest: string;
	runId?: string;
	variant?: GenerationVariant;
	provider?: "auto" | "local" | "openai";
	now?: Date;
}

interface GenerateBriefingResult {
	briefing: BriefingOutput;
	trace: GenerationTrace;
}

const GeneratedBriefingContentSchema = z.object({
	title: z.string().min(1),
	summary: z.string().min(1),
	claims: z.array(BriefingClaimSchema).min(1).max(5),
	openQuestions: z.array(z.string().min(1)).max(4),
	recommendation: z.string().min(1),
});

type GeneratedBriefingContent = z.infer<typeof GeneratedBriefingContentSchema>;

const sentenceBoundaryPattern = /(?<=[.!?])\s+/;
const defaultOpenAIModel = "gpt-5.2";
const openAIApiKey = process.env.OPENAI_API_KEY;
const openAIModel = process.env.OPENAI_MODEL ?? defaultOpenAIModel;

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

function buildPrompt(sourcePacket: SourcePacket, userRequest: string) {
	const sourceText = sourcePacket.sources
		.map((source) =>
			[
				`[${source.id}] ${source.title}`,
				source.documentType ? `Type: ${source.documentType}` : undefined,
				source.body,
			]
				.filter(Boolean)
				.join("\n"),
		)
		.join("\n\n");

	return [
		`User request: ${compactWhitespace(userRequest)}`,
		`Source packet: ${sourcePacket.title}`,
		`Packet summary: ${sourcePacket.summary}`,
		"Sources:",
		sourceText,
	].join("\n\n");
}

function assertCitationsBelongToPacket(
	content: GeneratedBriefingContent,
	sourcePacket: SourcePacket,
) {
	const sourceIds = new Set(sourcePacket.sources.map((source) => source.id));

	for (const claim of content.claims) {
		for (const citation of claim.citations) {
			if (!sourceIds.has(citation)) {
				throw new Error(
					`Generated briefing cited ${citation}, which is not present in source packet ${sourcePacket.id}`,
				);
			}
		}
	}
}

function briefingFromContent({
	content,
	sourcePacket,
	runId,
	variant,
}: {
	content: GeneratedBriefingContent;
	sourcePacket: SourcePacket;
	runId: string;
	variant: GenerationVariant;
}) {
	assertCitationsBelongToPacket(content, sourcePacket);
	return BriefingOutputSchema.parse({
		id: `${sourcePacket.caseId}-${variant.id}`,
		sourcePacketId: sourcePacket.id,
		caseId: sourcePacket.caseId,
		title: content.title,
		summary: content.summary,
		claims: content.claims,
		openQuestions: content.openQuestions,
		recommendation: content.recommendation,
		metadata: {
			variant: variant.label,
			runId,
			model: variant.model,
		},
	});
}

function traceFromBriefing({
	briefing,
	sourcePacket,
	userRequest,
	runId,
	variant,
	prompt,
	startedAt,
	inputTokens,
	outputTokens,
}: {
	briefing: BriefingOutput;
	sourcePacket: SourcePacket;
	userRequest: string;
	runId: string;
	variant: GenerationVariant;
	prompt: string;
	startedAt: number;
	inputTokens: number;
	outputTokens: number;
}) {
	return GenerationTraceSchema.parse({
		id: `${briefing.id}-trace`,
		runId,
		caseId: sourcePacket.caseId,
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
		},
		output: briefing,
		toolCalls: [],
		cost: {
			inputTokens,
			outputTokens,
			estimatedUsd: 0,
		},
		latencyMs: Math.max(1, Date.now() - startedAt),
		artifactPaths: [`data/source-packets/${sourcePacket.id}.json`],
	});
}

function generateLocalBriefing({
	sourcePacket,
	userRequest,
	runId,
	variant,
	startedAt,
}: {
	sourcePacket: SourcePacket;
	userRequest: string;
	runId: string;
	variant: GenerationVariant;
	startedAt: number;
}): GenerateBriefingResult {
	const selectedSources = sourcePacket.sources.slice(0, 3);
	const content = GeneratedBriefingContentSchema.parse({
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
	});
	const briefing = briefingFromContent({
		content,
		sourcePacket,
		runId,
		variant,
	});
	const prompt = buildPrompt(sourcePacket, userRequest);
	const outputText = JSON.stringify(briefing);
	const trace = traceFromBriefing({
		briefing,
		sourcePacket,
		userRequest,
		runId,
		variant,
		prompt,
		startedAt,
		inputTokens: estimateTokens(prompt),
		outputTokens: estimateTokens(outputText),
	});

	return {
		briefing,
		trace,
	};
}

async function generateOpenAIResponsesBriefing({
	sourcePacket,
	userRequest,
	runId,
	variant,
	startedAt,
}: {
	sourcePacket: SourcePacket;
	userRequest: string;
	runId: string;
	variant: GenerationVariant;
	startedAt: number;
}): Promise<GenerateBriefingResult> {
	if (!openAIApiKey) {
		throw new Error("OPENAI_API_KEY is required for OpenAI generation.");
	}

	const client = new OpenAI({ apiKey: openAIApiKey });
	const prompt = buildPrompt(sourcePacket, userRequest);
	const response = await client.responses.parse({
		model: variant.model,
		instructions: [
			"You are Briefing Genie, a concise research briefing generator.",
			"Use only the provided synthetic source packet.",
			"Cite claims with source ids exactly as shown, such as A1 or B2.",
			"Do not invent citation ids, facts, or private data.",
			"Return a concise briefing suitable for a strategy review.",
		].join(" "),
		input: prompt,
		text: {
			format: zodTextFormat(
				GeneratedBriefingContentSchema,
				"briefing_genie_output",
			),
		},
		...(variant.maxOutputTokens
			? { max_output_tokens: variant.maxOutputTokens }
			: {}),
	});
	const content = response.output_parsed;

	if (!content) {
		throw new Error("OpenAI returned no parsed briefing output.");
	}

	const briefing = briefingFromContent({
		content,
		sourcePacket,
		runId,
		variant,
	});
	const trace = traceFromBriefing({
		briefing,
		sourcePacket,
		userRequest,
		runId,
		variant,
		prompt,
		startedAt,
		inputTokens: response.usage?.input_tokens ?? estimateTokens(prompt),
		outputTokens:
			response.usage?.output_tokens ?? estimateTokens(JSON.stringify(briefing)),
	});

	return {
		briefing,
		trace,
	};
}

function resolveVariant(provider: GenerateBriefingInput["provider"]) {
	if (provider === "local") {
		return localExtractiveVariant;
	}

	if (provider === "openai" || openAIApiKey) {
		return openAIResponsesVariant(openAIModel);
	}

	return localExtractiveVariant;
}

export async function generateBriefing({
	sourcePacket,
	userRequest,
	runId,
	variant,
	provider = "auto",
	now = new Date(),
}: GenerateBriefingInput): Promise<GenerateBriefingResult> {
	const startedAt = now.getTime();
	const selectedVariant = variant ?? resolveVariant(provider);
	const selectedRunId =
		runId ??
		(selectedVariant.provider === "openai"
			? "interactive-openai-responses"
			: "interactive-local-extractive");

	if (selectedVariant.provider === "openai") {
		return generateOpenAIResponsesBriefing({
			sourcePacket,
			userRequest,
			runId: selectedRunId,
			variant: selectedVariant,
			startedAt,
		});
	}

	return generateLocalBriefing({
		sourcePacket,
		userRequest,
		runId: selectedRunId,
		variant: selectedVariant,
		startedAt,
	});
}
