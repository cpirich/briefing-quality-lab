import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
	estimateOpenAIUsd,
	pricingForOpenAIModel,
} from "~/genie/openai-pricing";
import { defaultOpenAIModel } from "~/genie/variants";
import {
	type BriefingOutput,
	BriefingOutputSchema,
	type EvalCase,
	type EvaluatorOutput,
	EvaluatorOutputSchema,
	type GenerationTrace,
	GenerationTraceSchema,
	type SourcePacket,
} from "~/schemas";

export type EvaluatorMode = "deterministic" | "hybrid";

type HardCheckStatus = "pass" | "warn" | "fail";

interface EvaluateBriefingInput {
	runId: string;
	evalCase: EvalCase;
	sourcePacket: SourcePacket;
	briefing: BriefingOutput;
	trace?: GenerationTrace;
	mode: EvaluatorMode;
	judgeModel?: string;
	judge?: HybridJudge;
}

interface HardCheck {
	id: string;
	label: string;
	status: HardCheckStatus;
	value: string;
	threshold?: string;
	expectation?: string;
	note?: string;
}

type HybridJudge = (input: HybridJudgeInput) => Promise<HybridJudgeResult>;

interface HybridJudgeInput {
	sourcePacket: SourcePacket;
	userTask: string;
	briefing: BriefingOutput;
	citedSourceIds: string[];
	hardChecks: HardCheck[];
	judgeModel: string;
}

const HybridJudgeResultSchema = z.object({
	claimJudgments: z.array(
		z.object({
			claimText: z.string().min(1),
			citedSourceIds: z.array(z.string().min(1)),
			supportStatus: z.enum([
				"supported",
				"partially-supported",
				"unsupported",
			]),
			supportingEvidenceIds: z.array(z.string().min(1)),
			missingEvidence: z.array(z.string().min(1)),
			explanation: z.string().min(1),
			failureTags: z.array(z.string().min(1)),
		}),
	),
	recommendationJudgment: z.object({
		taskAnswerStatus: z.enum([
			"answers-task",
			"partially-answers-task",
			"misses-task",
		]),
		overconfidenceStatus: z.enum([
			"calibrated",
			"somewhat-overconfident",
			"overconfident",
		]),
		missingImportantEvidence: z.array(z.string().min(1)),
		explanation: z.string().min(1),
		failureTags: z.array(z.string().min(1)),
	}),
});

export type HybridJudgeResult = z.infer<typeof HybridJudgeResultSchema>;
type ClaimJudgment = HybridJudgeResult["claimJudgments"][number];

const evaluatorCalibration = {
	coverageFloor: 0.25,
	failureRiskCap: 0.18,
	failureRiskPerTag: 0.025,
	localExtractiveCoveragePenalty: 0.18,
	localExtractiveCoverageCap: 0.72,
	localExtractiveCoverageFloor: 0.35,
	localExtractiveCitationSupportPenalty: 0.34,
	localExtractiveCitationCoverageWeight: 0.12,
	localExtractiveCitationSupportCap: 0.76,
	localExtractiveCitationSupportFloor: 0.45,
	groundingFloor: 0.35,
	groundingCap: 0.95,
	groundingCitationWeight: 0.72,
	groundingCoverageWeight: 0.2,
	overallFloor: 0.35,
	overallCap: 0.95,
	overallCoverageWeight: 0.34,
	overallCitationWeight: 0.32,
	overallGroundingWeight: 0.34,
	coverageGapThreshold: 0.65,
	citationGroundingThreshold: 0.72,
	groundingRiskThreshold: 0.65,
	hybridHardCheckFailCap: 0.4,
	hybridHardCheckWarnCap: 0.85,
	hybridPartialSupportScore: 0.55,
	hybridPartialTaskAnswerScore: 0.6,
	hybridMissedTaskAnswerScore: 0.2,
	hybridOverconfidentPenalty: 0.35,
	hybridSomewhatOverconfidentPenalty: 0.15,
	hybridMissingEvidencePenaltyCap: 0.25,
	hybridMissingEvidencePenaltyPerItem: 0.08,
	hybridGroundingClaimSupportWeight: 0.88,
	hybridGroundingMissingEvidencePenaltyWeight: 0.35,
	hybridOverallGroundingWeight: 0.42,
	hybridOverallCoverageWeight: 0.28,
	hybridOverallCitationWeight: 0.2,
	hybridOverallRecommendationWeight: 0.1,
} as const;
const coverageTermMinimumLength = 5;
const coverageTermsPerPoint = 5;
const judgePromptVersion = "hybrid-judge-v1";
const hybridStructuredOutputName = "hybrid_evaluator_output";
const openAIApiKey = process.env.OPENAI_API_KEY;

function roundMetric(value: number) {
	return Math.round(value * 100) / 100;
}

function clampScore(value: number) {
	return Math.max(0, Math.min(1, value));
}

function estimateTokens(value: string) {
	return Math.ceil(value.length / 4);
}

function coverageScore(evalCase: EvalCase, briefing: BriefingOutput) {
	const briefingText = [
		briefing.title,
		briefing.summary,
		...briefing.claims.map((claim) => claim.text),
		briefing.recommendation,
	]
		.join(" ")
		.toLowerCase();
	const hits = evalCase.expectedCoverage.filter((coveragePoint) => {
		const terms = coveragePoint
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((term) => term.length >= coverageTermMinimumLength)
			.slice(0, coverageTermsPerPoint);

		return terms.some((term) => briefingText.includes(term));
	}).length;

	return Math.max(
		evaluatorCalibration.coverageFloor,
		hits / evalCase.expectedCoverage.length,
	);
}

function citationSupportScore(evalCase: EvalCase, briefing: BriefingOutput) {
	const acceptedCitations = new Set(evalCase.acceptedCitations);
	const claimScores = briefing.claims.map((claim) => {
		if (claim.citations.length === 0) {
			return 0;
		}

		const acceptedCount = claim.citations.filter((citation) =>
			acceptedCitations.has(citation),
		).length;
		return acceptedCount / claim.citations.length;
	});

	return (
		claimScores.reduce((total, score) => total + score, 0) /
		Math.max(1, claimScores.length)
	);
}

function deterministicScores(evalCase: EvalCase, briefing: BriefingOutput) {
	let coverage = coverageScore(evalCase, briefing);
	let citationSupport = citationSupportScore(evalCase, briefing);
	const failureRisk = Math.min(
		evaluatorCalibration.failureRiskCap,
		evalCase.failureTags.length * evaluatorCalibration.failureRiskPerTag,
	);
	const isLocalExtractive =
		briefing.metadata.model === "deterministic-extractive";

	if (isLocalExtractive) {
		coverage = Math.min(
			evaluatorCalibration.localExtractiveCoverageCap,
			Math.max(
				evaluatorCalibration.localExtractiveCoverageFloor,
				coverage - evaluatorCalibration.localExtractiveCoveragePenalty,
			),
		);
		citationSupport = Math.min(
			evaluatorCalibration.localExtractiveCitationSupportCap,
			Math.max(
				evaluatorCalibration.localExtractiveCitationSupportFloor,
				citationSupport -
					evaluatorCalibration.localExtractiveCitationSupportPenalty +
					coverage *
						evaluatorCalibration.localExtractiveCitationCoverageWeight -
					failureRisk,
			),
		);
	}

	const grounding = Math.max(
		evaluatorCalibration.groundingFloor,
		Math.min(
			evaluatorCalibration.groundingCap,
			citationSupport * evaluatorCalibration.groundingCitationWeight +
				coverage * evaluatorCalibration.groundingCoverageWeight -
				failureRisk,
		),
	);
	const overall = Math.max(
		evaluatorCalibration.overallFloor,
		Math.min(
			evaluatorCalibration.overallCap,
			coverage * evaluatorCalibration.overallCoverageWeight +
				citationSupport * evaluatorCalibration.overallCitationWeight +
				grounding * evaluatorCalibration.overallGroundingWeight,
		),
	);

	return {
		overall: roundMetric(overall),
		grounding: roundMetric(grounding),
		coverage: roundMetric(coverage),
		citationSupport: roundMetric(citationSupport),
	};
}

function deterministicFailureTags(scores: EvaluatorOutput["scores"]) {
	const tags = new Set<string>();

	if (scores.coverage < evaluatorCalibration.coverageGapThreshold) {
		tags.add("coverage-gap");
	}
	if (
		scores.citationSupport < evaluatorCalibration.citationGroundingThreshold
	) {
		tags.add("citation-grounding");
	}
	if (scores.grounding < evaluatorCalibration.groundingRiskThreshold) {
		tags.add("grounding-risk");
	}

	return [...tags];
}

function citedSourceIds(briefing: BriefingOutput) {
	return [
		...new Set(briefing.claims.flatMap((claim) => claim.citations)),
	].sort();
}

function hardCheck({
	id,
	label,
	status,
	value,
	threshold,
	expectation,
	note,
}: HardCheck): HardCheck {
	return {
		id,
		label,
		status,
		value,
		...(threshold ? { threshold } : {}),
		...(expectation ? { expectation } : {}),
		...(note ? { note } : {}),
	};
}

const forbiddenJudgePromptKeys = new Set([
	"expectedCoverage",
	"traps",
	"acceptedCitations",
	"holdout",
	"demoHighlight",
	"failureTags",
]);

function leakedJudgePromptKeyPaths(
	value: unknown,
	path: string[] = [],
): string[] {
	if (Array.isArray(value)) {
		return value.flatMap((item, index) =>
			leakedJudgePromptKeyPaths(item, [...path, String(index)]),
		);
	}

	if (!value || typeof value !== "object") {
		return [];
	}

	return Object.entries(value).flatMap(([key, child]) => {
		const nextPath = [...path, key];
		const keyLeak = forbiddenJudgePromptKeys.has(key)
			? [nextPath.join(".")]
			: [];

		return [...keyLeak, ...leakedJudgePromptKeyPaths(child, nextPath)];
	});
}

function leakedEvalFieldKeysFromJudgePrompt(judgePromptText?: string) {
	if (!judgePromptText) {
		return [];
	}

	try {
		return leakedJudgePromptKeyPaths(JSON.parse(judgePromptText));
	} catch {
		return ["<invalid-json>"];
	}
}

export function deterministicHardChecks({
	briefing,
	sourcePacket,
	trace,
	judgePromptText,
}: {
	briefing: BriefingOutput;
	sourcePacket: SourcePacket;
	trace?: GenerationTrace;
	judgePromptText?: string;
}): HardCheck[] {
	const sourceIds = new Set(sourcePacket.sources.map((source) => source.id));
	const citedIds = citedSourceIds(briefing);
	const missingCitationIds = citedIds.filter(
		(citationId) => !sourceIds.has(citationId),
	);
	const briefingValidation = BriefingOutputSchema.safeParse(briefing);
	const traceValidation = trace
		? GenerationTraceSchema.safeParse(trace)
		: undefined;
	const tokenMetadataValid = trace
		? trace.cost.inputTokens >= 0 &&
			trace.cost.outputTokens >= 0 &&
			(trace.cost.cachedInputTokens ?? 0) <= trace.cost.inputTokens
		: false;
	const leakedPromptKeyPaths =
		leakedEvalFieldKeysFromJudgePrompt(judgePromptText);

	return [
		hardCheck({
			id: "briefing-schema",
			label: "Briefing schema",
			status: briefingValidation.success ? "pass" : "fail",
			value: briefingValidation.success ? "valid" : "invalid",
			expectation: "BriefingOutput schema parses",
			note: briefingValidation.success
				? undefined
				: briefingValidation.error.issues
						.map((issue) => issue.message)
						.join("; "),
		}),
		hardCheck({
			id: "citation-source-ids",
			label: "Citation source ids",
			status: missingCitationIds.length === 0 ? "pass" : "fail",
			value:
				missingCitationIds.length === 0
					? `${citedIds.length} cited ids exist`
					: `missing ${missingCitationIds.join(", ")}`,
			expectation: "Every cited source id exists in the source packet",
		}),
		hardCheck({
			id: "trace-schema",
			label: "Trace schema",
			status: traceValidation?.success ? "pass" : "warn",
			value: traceValidation
				? traceValidation.success
					? "valid"
					: "invalid"
				: "not provided",
			expectation: "GenerationTrace schema parses",
			note:
				traceValidation && !traceValidation.success
					? traceValidation.error.issues
							.map((issue) => issue.message)
							.join("; ")
					: undefined,
		}),
		hardCheck({
			id: "latency-metadata",
			label: "Latency metadata",
			status: trace && trace.latencyMs > 0 ? "pass" : "warn",
			value: trace ? `${trace.latencyMs}ms` : "not provided",
			threshold: "> 0ms",
		}),
		hardCheck({
			id: "cost-metadata",
			label: "Cost metadata",
			status:
				trace && typeof trace.cost.estimatedUsd === "number" ? "pass" : "warn",
			value:
				trace?.cost.estimatedUsd === null || trace === undefined
					? "unknown"
					: String(trace.cost.estimatedUsd),
			expectation: "estimatedUsd is present when pricing is configured",
		}),
		hardCheck({
			id: "token-metadata",
			label: "Token metadata",
			status: tokenMetadataValid ? "pass" : "warn",
			value: trace
				? `${trace.cost.inputTokens} in / ${trace.cost.cachedInputTokens ?? 0} cached / ${trace.cost.outputTokens} out`
				: "not provided",
			expectation: "Input, cached-input, and output token counts are coherent",
		}),
		hardCheck({
			id: "model-metadata",
			label: "Provider and model metadata",
			status:
				trace?.model.provider &&
				trace.model.name &&
				trace.model.settings.promptVersion
					? "pass"
					: "warn",
			value: trace
				? `${trace.model.provider} ${trace.model.name} ${trace.model.settings.promptVersion}`
				: "not provided",
			expectation: "Provider, model, and prompt version are present",
		}),
		hardCheck({
			id: "judge-input-boundary",
			label: "Judge input boundary",
			status:
				!judgePromptText || leakedPromptKeyPaths.length === 0 ? "pass" : "fail",
			value:
				!judgePromptText || leakedPromptKeyPaths.length === 0
					? "eval-only fields omitted"
					: `leaked keys ${leakedPromptKeyPaths.join(", ")}`,
			expectation:
				"Judge prompt omits eval-only object keys and holdout tuning fields",
		}),
	];
}

function hardCheckScoreCap(hardChecks: HardCheck[]) {
	if (hardChecks.some((check) => check.status === "fail")) {
		return evaluatorCalibration.hybridHardCheckFailCap;
	}
	if (hardChecks.some((check) => check.status === "warn")) {
		return evaluatorCalibration.hybridHardCheckWarnCap;
	}

	return 1;
}

function supportScore(
	status: HybridJudgeResult["claimJudgments"][number]["supportStatus"],
) {
	if (status === "supported") {
		return 1;
	}
	if (status === "partially-supported") {
		return evaluatorCalibration.hybridPartialSupportScore;
	}
	return 0;
}

function taskAnswerScore(
	status: HybridJudgeResult["recommendationJudgment"]["taskAnswerStatus"],
) {
	if (status === "answers-task") {
		return 1;
	}
	if (status === "partially-answers-task") {
		return evaluatorCalibration.hybridPartialTaskAnswerScore;
	}
	return evaluatorCalibration.hybridMissedTaskAnswerScore;
}

function overconfidencePenalty(
	status: HybridJudgeResult["recommendationJudgment"]["overconfidenceStatus"],
) {
	if (status === "overconfident") {
		return evaluatorCalibration.hybridOverconfidentPenalty;
	}
	if (status === "somewhat-overconfident") {
		return evaluatorCalibration.hybridSomewhatOverconfidentPenalty;
	}
	return 0;
}

function average(values: number[]) {
	if (values.length === 0) {
		return 0;
	}

	return values.reduce((total, value) => total + value, 0) / values.length;
}

function normalizeClaimJudgments({
	briefing,
	judgment,
}: {
	briefing: BriefingOutput;
	judgment: HybridJudgeResult;
}) {
	const unmatchedJudgments = [...judgment.claimJudgments];
	const claimJudgments: ClaimJudgment[] = briefing.claims.map((claim) => {
		const matchingIndex = unmatchedJudgments.findIndex(
			(judgmentClaim) => judgmentClaim.claimText === claim.text,
		);
		if (matchingIndex >= 0) {
			const matchingJudgment = unmatchedJudgments[matchingIndex];
			unmatchedJudgments.splice(matchingIndex, 1);
			if (!matchingJudgment) {
				throw new Error("Matched claim judgment index was not available.");
			}
			return matchingJudgment;
		}

		return {
			claimText: claim.text,
			citedSourceIds: claim.citations,
			supportStatus: "unsupported" as const,
			supportingEvidenceIds: [],
			missingEvidence: ["Judge omitted this claim judgment."],
			explanation:
				"The evaluator did not return a judgment for this briefing claim, so it is treated as unsupported.",
			failureTags: ["judge-missing-claim-judgment"],
		};
	});

	return {
		...judgment,
		claimJudgments,
		claimCoverage: {
			expected: briefing.claims.length,
			missing: claimJudgments.filter((claim) =>
				claim.failureTags.includes("judge-missing-claim-judgment"),
			).length,
			extra: unmatchedJudgments.length,
		},
	};
}

function claimCoverageHardCheck({
	extra,
	expected,
	missing,
}: {
	extra: number;
	expected: number;
	missing: number;
}): HardCheck {
	const status = missing === 0 && extra === 0 ? "pass" : "fail";
	return hardCheck({
		id: "judge-claim-coverage",
		label: "Judge claim coverage",
		status,
		value: `${expected - missing}/${expected} claims judged, ${extra} extra`,
		expectation:
			"LLM judge returns exactly one judgment for every briefing claim",
		note:
			status === "pass"
				? undefined
				: "Missing claim judgments are treated as unsupported; extra judgments are ignored for scoring.",
	});
}

function hybridScores(judgment: HybridJudgeResult, hardChecks: HardCheck[]) {
	const claimSupport = average(
		judgment.claimJudgments.map((claim) => supportScore(claim.supportStatus)),
	);
	const missingEvidencePenalty = Math.min(
		evaluatorCalibration.hybridMissingEvidencePenaltyCap,
		judgment.recommendationJudgment.missingImportantEvidence.length *
			evaluatorCalibration.hybridMissingEvidencePenaltyPerItem,
	);
	const recommendationTaskScore = taskAnswerScore(
		judgment.recommendationJudgment.taskAnswerStatus,
	);
	const recommendationQuality = clampScore(
		recommendationTaskScore -
			overconfidencePenalty(
				judgment.recommendationJudgment.overconfidenceStatus,
			),
	);
	const grounding = clampScore(
		claimSupport * evaluatorCalibration.hybridGroundingClaimSupportWeight -
			missingEvidencePenalty *
				evaluatorCalibration.hybridGroundingMissingEvidencePenaltyWeight,
	);
	const coverage = clampScore(recommendationTaskScore - missingEvidencePenalty);
	const citationSupport = claimSupport;
	const cap = hardCheckScoreCap(hardChecks);
	const overall = Math.min(
		cap,
		clampScore(
			grounding * evaluatorCalibration.hybridOverallGroundingWeight +
				coverage * evaluatorCalibration.hybridOverallCoverageWeight +
				citationSupport * evaluatorCalibration.hybridOverallCitationWeight +
				recommendationQuality *
					evaluatorCalibration.hybridOverallRecommendationWeight,
		),
	);

	return {
		overall: roundMetric(overall),
		grounding: roundMetric(Math.min(cap, grounding)),
		coverage: roundMetric(Math.min(cap, coverage)),
		citationSupport: roundMetric(Math.min(cap, citationSupport)),
	};
}

function hybridFailureTags(
	judgment: HybridJudgeResult,
	hardChecks: HardCheck[],
	scores: EvaluatorOutput["scores"],
) {
	const tags = new Set<string>();

	for (const check of hardChecks) {
		if (check.status !== "pass") {
			tags.add(`hard-check-${check.status}`);
		}
	}
	for (const claim of judgment.claimJudgments) {
		for (const tag of claim.failureTags) {
			tags.add(tag);
		}
		if (claim.supportStatus === "partially-supported") {
			tags.add("partial-claim-support");
		}
		if (claim.supportStatus === "unsupported") {
			tags.add("unsupported-claim");
		}
	}
	for (const tag of judgment.recommendationJudgment.failureTags) {
		tags.add(tag);
	}
	if (judgment.recommendationJudgment.overconfidenceStatus !== "calibrated") {
		tags.add("overconfidence");
	}
	if (scores.coverage < evaluatorCalibration.coverageGapThreshold) {
		tags.add("coverage-gap");
	}
	if (
		scores.citationSupport < evaluatorCalibration.citationGroundingThreshold
	) {
		tags.add("citation-grounding");
	}

	return [...tags].sort();
}

function evaluatorCostMetadata({
	mode,
	model,
	prompt,
	output,
}: {
	mode: EvaluatorMode;
	model: string;
	prompt: string;
	output: unknown;
}) {
	const inputTokens = mode === "deterministic" ? 0 : estimateTokens(prompt);
	const outputTokens =
		mode === "deterministic" ? 0 : estimateTokens(JSON.stringify(output));
	const costEstimate =
		mode === "deterministic"
			? { estimatedUsd: 0, pricing: undefined }
			: estimateOpenAIUsd({
					modelName: model,
					inputTokens,
					cachedInputTokens: 0,
					outputTokens,
				});

	return {
		inputTokens,
		cachedInputTokens: 0,
		outputTokens,
		estimatedUsd: costEstimate.estimatedUsd,
		...(costEstimate.pricing ? { pricing: costEstimate.pricing } : {}),
	};
}

export function buildHybridJudgePrompt(
	input: Omit<HybridJudgeInput, "judgeModel">,
) {
	return JSON.stringify(
		{
			userTask: input.userTask,
			sourcePacket: {
				id: input.sourcePacket.id,
				title: input.sourcePacket.title,
				summary: input.sourcePacket.summary,
				sources: input.sourcePacket.sources,
			},
			generatedBriefing: {
				title: input.briefing.title,
				summary: input.briefing.summary,
				claims: input.briefing.claims,
				openQuestions: input.briefing.openQuestions,
				recommendation: input.briefing.recommendation,
			},
			citedSourceIds: input.citedSourceIds,
			hardChecks: input.hardChecks.map((check) => ({
				id: check.id,
				label: check.label,
				status: check.status,
				value: check.value,
				threshold: check.threshold,
			})),
		},
		null,
		2,
	);
}

async function openAIHybridJudge(input: HybridJudgeInput) {
	if (!openAIApiKey) {
		throw new Error("OPENAI_API_KEY is required for hybrid evaluator runs.");
	}
	if (!pricingForOpenAIModel(input.judgeModel)) {
		throw new Error(
			`OpenAI evaluator pricing is not configured for model "${input.judgeModel}". Add reviewed token rates before running live hybrid evals.`,
		);
	}

	const client = new OpenAI({ apiKey: openAIApiKey });
	const prompt = buildHybridJudgePrompt(input);
	const response = await client.responses.parse({
		model: input.judgeModel,
		instructions: [
			"You are the Briefing Genie Improvement Lab evaluator.",
			"Judge only whether the generated briefing is supported by the provided synthetic source packet.",
			"Do not reward citation id presence alone; inspect whether cited evidence supports each claim.",
			"Mark partial support when a citation supports part of a claim but misses scope, caveats, or certainty.",
			"Return concise explanations that a reviewer can inspect.",
		].join(" "),
		input: prompt,
		text: {
			format: zodTextFormat(
				HybridJudgeResultSchema,
				hybridStructuredOutputName,
			),
		},
	});

	if (!response.output_parsed) {
		throw new Error("OpenAI returned no parsed hybrid evaluator output.");
	}

	return HybridJudgeResultSchema.parse(response.output_parsed);
}

function citationSupportForDeterministic(
	evalCase: EvalCase,
	briefing: BriefingOutput,
) {
	const acceptedCitations = new Set(evalCase.acceptedCitations);

	return citedSourceIds(briefing).map((citation) => ({
		citation,
		supported: acceptedCitations.has(citation),
		note: acceptedCitations.has(citation)
			? `${citation} is accepted evidence for ${evalCase.id}.`
			: `${citation} is not listed as accepted evidence for ${evalCase.id}.`,
	}));
}

function citationSupportForHybrid(judgment: HybridJudgeResult) {
	const supportByCitation = new Map<string, boolean>();
	for (const claim of judgment.claimJudgments) {
		for (const citation of claim.citedSourceIds) {
			const isSupported = claim.supportStatus === "supported";
			supportByCitation.set(
				citation,
				(supportByCitation.get(citation) ?? true) && isSupported,
			);
		}
	}

	return [...supportByCitation.entries()].map(([citation, supported]) => ({
		citation,
		supported,
		note: supported
			? `${citation} appears in fully supported claim-level judgments.`
			: `${citation} appears in a partially supported or unsupported claim judgment.`,
	}));
}

export async function evaluateBriefing({
	runId,
	evalCase,
	sourcePacket,
	briefing,
	trace,
	mode,
	judgeModel = process.env.OPENAI_EVAL_MODEL ?? defaultOpenAIModel,
	judge = openAIHybridJudge,
}: EvaluateBriefingInput): Promise<EvaluatorOutput> {
	if (mode === "deterministic") {
		const startedAt = Date.now();
		const hardChecks = deterministicHardChecks({
			briefing,
			sourcePacket,
			trace,
		});
		const scores = deterministicScores(evalCase, briefing);
		const output = {
			scores,
			hardChecks,
		};

		return EvaluatorOutputSchema.parse({
			id: `evaluation-${runId}-${evalCase.id}`,
			runId,
			caseId: evalCase.id,
			evaluator: {
				mode,
				provider: "local",
				model: "deterministic-heuristic",
				promptVersion: "deterministic-v1",
				settings: {
					coverageTermsPerPoint,
					coverageTermMinimumLength,
				},
				latencyMs: Math.max(0, Date.now() - startedAt),
				cost: evaluatorCostMetadata({
					mode,
					model: "deterministic-heuristic",
					prompt: "",
					output,
				}),
			},
			hardChecks,
			scores,
			failureTags: deterministicFailureTags(scores),
			rubricEvidence: [
				`Coverage heuristic score: ${scores.coverage.toFixed(2)}.`,
				`Citation support heuristic score: ${scores.citationSupport.toFixed(2)}.`,
				`Hard checks: ${hardChecks.filter((check) => check.status === "pass").length}/${hardChecks.length} passing.`,
			],
			citationSupport: citationSupportForDeterministic(evalCase, briefing),
			notes:
				"Legacy deterministic heuristic evaluator. Use for offline rehearsal and artifact integrity checks; use hybrid LLM judge artifacts for live-provider quality claims.",
			artifactPaths: [
				`runs/${runId}/evaluations/${evalCase.id}.json`,
				`runs/${runId}/briefings/${evalCase.id}.json`,
			],
		});
	}

	const startedAt = Date.now();
	const initialHardChecks = deterministicHardChecks({
		briefing,
		sourcePacket,
		trace,
	});
	const prompt = buildHybridJudgePrompt({
		sourcePacket,
		userTask: evalCase.task,
		briefing,
		citedSourceIds: citedSourceIds(briefing),
		hardChecks: initialHardChecks,
	});
	const hardChecks = deterministicHardChecks({
		briefing,
		sourcePacket,
		trace,
		judgePromptText: prompt,
	});
	const judgment = HybridJudgeResultSchema.parse(
		await judge({
			sourcePacket,
			userTask: evalCase.task,
			briefing,
			citedSourceIds: citedSourceIds(briefing),
			hardChecks,
			judgeModel,
		}),
	);
	const normalizedJudgment = normalizeClaimJudgments({
		briefing,
		judgment,
	});
	const completedHardChecks = [
		...hardChecks,
		claimCoverageHardCheck(normalizedJudgment.claimCoverage),
	];
	const latencyMs = Math.max(1, Date.now() - startedAt);
	const scores = hybridScores(normalizedJudgment, completedHardChecks);

	return EvaluatorOutputSchema.parse({
		id: `evaluation-${runId}-${evalCase.id}`,
		runId,
		caseId: evalCase.id,
		evaluator: {
			mode,
			provider: "openai",
			model: judgeModel,
			promptVersion: judgePromptVersion,
			settings: {
				structuredOutputName: hybridStructuredOutputName,
			},
			latencyMs,
			cost: evaluatorCostMetadata({
				mode,
				model: judgeModel,
				prompt,
				output: normalizedJudgment,
			}),
		},
		hardChecks: completedHardChecks,
		claimJudgments: normalizedJudgment.claimJudgments,
		recommendationJudgment: normalizedJudgment.recommendationJudgment,
		scores,
		failureTags: hybridFailureTags(
			normalizedJudgment,
			completedHardChecks,
			scores,
		),
		rubricEvidence: [
			`Hybrid claim support score: ${scores.citationSupport.toFixed(2)}.`,
			`Recommendation task fit: ${normalizedJudgment.recommendationJudgment.taskAnswerStatus}.`,
			`Overconfidence: ${normalizedJudgment.recommendationJudgment.overconfidenceStatus}.`,
			`Hard-check cap: ${hardCheckScoreCap(completedHardChecks).toFixed(2)}.`,
		],
		citationSupport: citationSupportForHybrid(normalizedJudgment),
		notes:
			"Hybrid evaluator output: deterministic hard checks plus structured LLM judge evidence. Manual spot checks are still required before claiming product improvement.",
		artifactPaths: [
			`runs/${runId}/evaluations/${evalCase.id}.json`,
			`runs/${runId}/briefings/${evalCase.id}.json`,
		],
	});
}
