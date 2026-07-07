import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
	BriefingClaimSchema,
	type BriefingOutput,
	BriefingOutputSchema,
	type GenerationModelSettings,
	type GenerationTrace,
	GenerationTraceSchema,
	type GenerationVariant,
	type SourcePacket,
} from "~/schemas";
import { estimateOpenAIUsd, type OpenAIPricing } from "./openai-pricing";
import {
	defaultOpenAIModel,
	localExtractiveVariant,
	openAIResponsesVariant,
} from "./variants";

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
const structuredOutputName = "briefing_genie_output";
const openAIApiKey = process.env.OPENAI_API_KEY;
const openAIModel = process.env.OPENAI_MODEL ?? defaultOpenAIModel;
const openAIRequestTimeoutMs = Number(
	process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 90_000,
);

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

function modelSettingsForVariant(
	variant: GenerationVariant,
	overrides: Partial<GenerationModelSettings> = {},
): GenerationModelSettings {
	return {
		promptVersion: variant.promptVersion,
		maxOutputTokens: variant.maxOutputTokens ?? null,
		structuredOutputName: null,
		textVerbosity: null,
		reasoningEffort: null,
		reasoningSummary: null,
		temperature: null,
		topP: null,
		truncation: null,
		toolChoice: null,
		parallelToolCalls: null,
		...overrides,
	};
}

function traceFromBriefing({
	briefing,
	sourcePacket,
	userRequest,
	runId,
	variant,
	settings,
	prompt,
	systemInstructions = "You are Briefing Genie. Return a short briefing with source citations.",
	startedAt,
	inputTokens,
	cachedInputTokens,
	outputTokens,
	estimatedUsd,
	pricing,
}: {
	briefing: BriefingOutput;
	sourcePacket: SourcePacket;
	userRequest: string;
	runId: string;
	variant: GenerationVariant;
	settings: GenerationModelSettings;
	prompt: string;
	systemInstructions?: string;
	startedAt: number;
	inputTokens: number;
	cachedInputTokens?: number;
	outputTokens: number;
	estimatedUsd: number | null;
	pricing?: OpenAIPricing;
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
				content: systemInstructions,
			},
			{
				role: "user",
				content: prompt,
			},
		],
		model: {
			provider: variant.provider,
			name: variant.model,
			...(settings.temperature !== null
				? { temperature: settings.temperature }
				: {}),
			settings,
		},
		output: briefing,
		toolCalls: [],
		cost: {
			inputTokens,
			...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
			outputTokens,
			estimatedUsd,
			...(pricing ? { pricing } : {}),
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
		settings: modelSettingsForVariant(variant, {
			structuredOutputName: null,
			temperature: 0,
			toolChoice: "none",
			parallelToolCalls: false,
		}),
		prompt,
		startedAt,
		inputTokens: estimateTokens(prompt),
		cachedInputTokens: 0,
		outputTokens: estimateTokens(outputText),
		estimatedUsd: 0,
	});

	return {
		briefing,
		trace,
	};
}

function openAIInstructionsForVariant(variant: GenerationVariant) {
	const baseInstructions = [
		"You are Briefing Genie, a concise research briefing generator.",
		"Use only the provided synthetic source packet.",
		"Cite claims with source ids exactly as shown, such as A1 or B2.",
		"Do not invent citation ids, facts, or private data.",
		"Return a concise briefing suitable for a strategy review.",
	];

	if (variant.promptVersion === "openai-loop-v3-claim-planning") {
		return [
			...baseInstructions,
			"Before writing each claim, verify that its full sentence is directly supported by its citations.",
			"Prefer the strongest direct citation for the decision point over a merely related citation.",
			"If a detail is only partially supported, narrow the claim or move the uncertainty to open questions.",
			"Avoid broad quantifiers, causal claims, and rollout recommendations unless the cited source directly supports them.",
		].join(" ");
	}

	if (variant.promptVersion === "openai-loop-v4-coverage-anchors") {
		return [
			...baseInstructions,
			"First identify the distinct decision dimensions requested by the user, including risks, recommendations, tradeoffs, and approval boundaries.",
			"Use up to five claims to cover the highest-value dimensions before optimizing for brevity.",
			"When the packet contains multiple important risk types, include at least one claim for each type instead of collapsing to a single theme.",
			"Pair each claim with the strongest direct citation and narrow only the unsupported part, not the whole coverage area.",
			"Make the recommendation name the primary action plus the most important caveat or dependency from the sources.",
		].join(" ");
	}

	if (variant.promptVersion === "openai-loop-v5-citation-pairing") {
		return [
			...baseInstructions,
			"First identify the distinct decision dimensions requested by the user, including risks, recommendations, tradeoffs, and approval boundaries.",
			"Use up to five claims to cover the highest-value dimensions before optimizing for brevity.",
			"When a claim combines facts from more than one source, cite every source needed to support the combined sentence.",
			"Do not rely on an uncited source to support any part of a claim or recommendation.",
			"Before finalizing, audit each claim: every quoted status, environment caveat, approval gate, old-flow warning, and recommended action must be directly supported by the cited source ids.",
			"Use cautious wording for inferred priority: say a source-supported action is recommended, not primary or required, unless the source explicitly says so.",
			"Make the recommendation name the main action plus the most important caveat or dependency, with citations represented in the claims.",
		].join(" ");
	}

	return baseInstructions.join(" ");
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

	const client = new OpenAI({
		apiKey: openAIApiKey,
		timeout: openAIRequestTimeoutMs,
	});
	const prompt = buildPrompt(sourcePacket, userRequest);
	const settings = modelSettingsForVariant(variant, {
		structuredOutputName,
	});
	const instructions = openAIInstructionsForVariant(variant);
	const response = await client.responses.parse({
		model: variant.model,
		instructions,
		input: prompt,
		text: {
			format: zodTextFormat(
				GeneratedBriefingContentSchema,
				structuredOutputName,
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
	const inputTokens = response.usage?.input_tokens ?? estimateTokens(prompt);
	const outputTokens =
		response.usage?.output_tokens ?? estimateTokens(JSON.stringify(briefing));
	const cachedInputTokens =
		response.usage?.input_tokens_details?.cached_tokens ?? 0;
	const costEstimate = estimateOpenAIUsd({
		modelName: variant.model,
		inputTokens,
		cachedInputTokens,
		outputTokens,
	});
	const trace = traceFromBriefing({
		briefing,
		sourcePacket,
		userRequest,
		runId,
		variant,
		settings,
		prompt,
		systemInstructions: instructions,
		startedAt,
		inputTokens,
		cachedInputTokens,
		outputTokens,
		estimatedUsd: costEstimate.estimatedUsd,
		pricing: costEstimate.pricing,
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
