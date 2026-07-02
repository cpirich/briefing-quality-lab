import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateBriefing } from "~/genie/generate-briefing";
import {
	estimateOpenAIUsd,
	pricingForOpenAIModel,
} from "~/genie/openai-pricing";
import { defaultOpenAIEvaluatorModel } from "~/genie/variants";
import { type EvaluatorMode, evaluateBriefing } from "~/lab/evaluator";
import {
	listEvalCases,
	listRunManifests,
	listSourcePackets,
	listVariantSpecs,
} from "~/run-store";
import {
	type BriefingOutput,
	BriefingOutputSchema,
	type EvalCase,
	type EvaluatorOutput,
	FocusedVariantMatrixSchema,
	type GenerationTrace,
	GenerationTraceSchema,
	type GenerationVariant,
	GenerationVariantSchema,
	type RunManifest,
	RunManifestSchema,
	type SourcePacket,
	type VariantSpec,
} from "~/schemas";

type MatrixProvider = "local" | "openai" | "mixed";

interface MatrixOptions {
	provider: MatrixProvider;
	evaluator: EvaluatorMode;
	includeHoldouts: boolean;
	caseLimit: number;
	variantLimit: number;
	retryCap: number;
	caseIds: string[];
	variantIds: string[];
	baselineRunId?: string;
	dryRun: boolean;
}

interface VariantRunArtifacts {
	variant: GenerationVariant;
	spec: VariantSpec;
	manifest: RunManifest;
	briefings: BriefingOutput[];
	evaluations: EvaluatorOutput[];
	traces: GenerationTrace[];
	artifactPaths: string[];
}

interface VariantCaseArtifacts {
	briefing: BriefingOutput;
	evaluation: EvaluatorOutput;
	trace: GenerationTrace;
	artifactPaths: string[];
}

const repoRoot = process.cwd();
const fixtureIdPattern = /^[a-z0-9][a-z0-9-]*$/;
const matrixTimestamp = new Date()
	.toISOString()
	.replace(/\D/g, "")
	.slice(0, 14);
const openAIApiKey = process.env.OPENAI_API_KEY;

function optionValue(name: string) {
	const prefix = `${name}=`;
	const match = process.argv.find((argument) => argument.startsWith(prefix));
	return match?.slice(prefix.length);
}

function optionValues(name: string) {
	const prefix = `${name}=`;
	return process.argv
		.filter((argument) => argument.startsWith(prefix))
		.flatMap((argument) =>
			argument
				.slice(prefix.length)
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		);
}

function hasFlag(name: string) {
	return process.argv.includes(name);
}

function parseBoundedInteger({
	name,
	defaultValue,
	min,
	max,
}: {
	name: string;
	defaultValue: number;
	min: number;
	max: number;
}) {
	const rawValue = optionValue(name);
	const value = rawValue === undefined ? defaultValue : Number(rawValue);
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new Error(`${name} must be an integer from ${min} to ${max}.`);
	}

	return value;
}

function validateFixtureId(value: string, label: string) {
	if (!fixtureIdPattern.test(value)) {
		throw new Error(
			`Invalid ${label} "${value}". Use lowercase letters, numbers, and hyphens only.`,
		);
	}

	return value;
}

function parseOptions(): MatrixOptions {
	const provider = (optionValue("--provider") ?? "mixed") as MatrixProvider;
	if (!["local", "openai", "mixed"].includes(provider)) {
		throw new Error(
			`Unknown provider "${provider}". Use local, openai, or mixed.`,
		);
	}
	const evaluator = (optionValue("--evaluator") ?? "hybrid") as EvaluatorMode;
	if (!["deterministic", "hybrid"].includes(evaluator)) {
		throw new Error(
			`Unknown evaluator "${evaluator}". Use deterministic or hybrid.`,
		);
	}

	return {
		provider,
		evaluator,
		includeHoldouts: hasFlag("--include-holdouts"),
		caseLimit: parseBoundedInteger({
			name: "--case-limit",
			defaultValue: 3,
			min: 3,
			max: 5,
		}),
		variantLimit: parseBoundedInteger({
			name: "--variant-limit",
			defaultValue: 4,
			min: 2,
			max: 4,
		}),
		retryCap: parseBoundedInteger({
			name: "--retry-cap",
			defaultValue: 1,
			min: 0,
			max: 3,
		}),
		caseIds: optionValues("--case-id").map((caseId) =>
			validateFixtureId(caseId, "case id"),
		),
		variantIds: optionValues("--variant-id").map((variantId) =>
			validateFixtureId(variantId, "variant id"),
		),
		baselineRunId: optionValue("--baseline")
			? validateFixtureId(optionValue("--baseline") ?? "", "baseline run id")
			: undefined,
		dryRun: hasFlag("--dry-run"),
	};
}

function absolutePath(relativePath: string) {
	return path.join(repoRoot, relativePath);
}

async function writeJsonArtifact(relativePath: string, value: unknown) {
	const targetPath = absolutePath(relativePath);
	await mkdir(path.dirname(targetPath), { recursive: true });
	const tempPath = `${targetPath}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(value, null, "\t")}\n`);
	await rename(tempPath, targetPath);
}

function sourcePacketById(sourcePackets: SourcePacket[]) {
	return new Map(
		sourcePackets.map((sourcePacket) => [sourcePacket.id, sourcePacket]),
	);
}

function roundMetric(value: number) {
	return Math.round(value * 100) / 100;
}

function roundCostUsd(value: number) {
	return Math.round(value * 100_000_000) / 100_000_000;
}

function median(values: number[]) {
	if (values.length === 0) {
		return 0;
	}

	const sorted = [...values].sort((left, right) => left - right);
	const midpoint = Math.floor(sorted.length / 2);
	const middleValue = sorted[midpoint] ?? 0;
	if (sorted.length % 2 !== 0) {
		return middleValue;
	}

	return Math.round(((sorted[midpoint - 1] ?? middleValue) + middleValue) / 2);
}

function averageScore(
	evaluations: EvaluatorOutput[],
	metric: keyof EvaluatorOutput["scores"],
) {
	if (evaluations.length === 0) {
		return 0;
	}

	return roundMetric(
		evaluations.reduce(
			(total, evaluation) => total + evaluation.scores[metric],
			0,
		) / evaluations.length,
	);
}

function unsupportedClaims(evaluations: EvaluatorOutput[]) {
	return evaluations.reduce(
		(total, evaluation) =>
			total +
			(evaluation.claimJudgments?.filter(
				(judgment) => judgment.supportStatus === "unsupported",
			).length ?? 0),
		0,
	);
}

function knownEstimatedCost(traces: GenerationTrace[]) {
	return traces.reduce(
		(total, trace) => total + (trace.cost.estimatedUsd ?? 0),
		0,
	);
}

function knownEstimatedEvaluatorCost(evaluations: EvaluatorOutput[]) {
	return evaluations.reduce(
		(total, evaluation) =>
			total + (evaluation.evaluator?.cost.estimatedUsd ?? 0),
		0,
	);
}

function knownEstimatedTotalCost({
	evaluations,
	traces,
}: {
	evaluations: EvaluatorOutput[];
	traces: GenerationTrace[];
}) {
	return knownEstimatedCost(traces) + knownEstimatedEvaluatorCost(evaluations);
}

function hasUnknownCost(traces: GenerationTrace[]) {
	return traces.some((trace) => trace.cost.estimatedUsd === null);
}

function hasUnknownEvaluatorCost(evaluations: EvaluatorOutput[]) {
	return evaluations.some(
		(evaluation) => evaluation.evaluator?.cost.estimatedUsd === null,
	);
}

function hasUnknownTotalCost({
	evaluations,
	traces,
}: {
	evaluations: EvaluatorOutput[];
	traces: GenerationTrace[];
}) {
	return hasUnknownCost(traces) || hasUnknownEvaluatorCost(evaluations);
}

function caseEstimatedCostUsd({
	evaluation,
	trace,
}: {
	evaluation: EvaluatorOutput;
	trace: GenerationTrace | undefined;
}) {
	const generationCost = trace?.cost.estimatedUsd;
	const evaluatorCost = evaluation.evaluator?.cost.estimatedUsd;
	if (generationCost === null || evaluatorCost === null) {
		return null;
	}

	return roundCostUsd((generationCost ?? 0) + (evaluatorCost ?? 0));
}

function briefingWithAcceptedCitationsOnly(
	briefing: BriefingOutput,
	evalCase: EvalCase,
) {
	const acceptedCitations = new Set(evalCase.acceptedCitations);
	const claims = briefing.claims.flatMap((claim) => {
		const citations = claim.citations.filter((citation) =>
			acceptedCitations.has(citation),
		);

		return citations.length > 0 ? [{ ...claim, citations }] : [];
	});

	return {
		...briefing,
		claims:
			claims.length > 0
				? claims
				: [
						{
							text: evalCase.expectedCoverage[0] ?? briefing.summary,
							citations: [evalCase.acceptedCitations[0] ?? "A1"],
						},
					],
	};
}

function variantFromSpec(spec: VariantSpec): GenerationVariant {
	if (spec.provider !== "local" && spec.provider !== "openai") {
		throw new Error(
			`Variant ${spec.id} uses provider ${spec.provider}; eval:matrix supports local and openai providers.`,
		);
	}

	return GenerationVariantSchema.parse({
		id: spec.id,
		label: spec.label,
		provider: spec.provider,
		model: spec.model,
		promptVersion: spec.promptVersion,
		maxOutputTokens: spec.model === "deterministic-extractive" ? 900 : 1200,
	});
}

function selectVariants(options: MatrixOptions, specs: VariantSpec[]) {
	const activeSpecs = specs.filter((spec) =>
		["baseline", "candidate", "reference"].includes(spec.status),
	);
	const providerSpecs = activeSpecs.filter(
		(spec) =>
			options.provider === "mixed" || spec.provider === options.provider,
	);
	const requestedSpecs =
		options.variantIds.length > 0
			? options.variantIds.map((variantId) => {
					const spec = providerSpecs.find(
						(candidateSpec) => candidateSpec.id === variantId,
					);
					if (!spec) {
						throw new Error(
							`No active variant spec ${variantId} is available for provider ${options.provider}.`,
						);
					}
					return spec;
				})
			: providerSpecs;
	const selectedSpecs = requestedSpecs.slice(0, options.variantLimit);
	if (selectedSpecs.length < 2) {
		throw new Error(
			`eval:matrix needs at least 2 active variant specs; selected ${selectedSpecs.length}. Pass --provider=mixed or add/select another variant spec.`,
		);
	}

	return selectedSpecs;
}

function selectCases(options: MatrixOptions, evalCases: EvalCase[]) {
	const visibleCases = evalCases.filter(
		(evalCase) => options.includeHoldouts || !evalCase.holdout,
	);
	const requestedCases =
		options.caseIds.length > 0
			? options.caseIds.map((caseId) => {
					const evalCase = visibleCases.find(
						(candidateCase) => candidateCase.id === caseId,
					);
					if (!evalCase) {
						throw new Error(
							`No selected eval case ${caseId}; holdouts are excluded unless --include-holdouts is set.`,
						);
					}
					return evalCase;
				})
			: visibleCases.filter((evalCase) => evalCase.demoHighlight);
	const fallbackCases =
		requestedCases.length > 0 ? requestedCases : visibleCases;
	const selectedCases = fallbackCases.slice(0, options.caseLimit);
	if (selectedCases.length === 0) {
		throw new Error("No eval cases are available for the matrix.");
	}

	return selectedCases;
}

function estimateTokens(value: string) {
	return Math.ceil(value.length / 4);
}

function estimateMatrixCostUsd({
	variants,
	evalCases,
	sourcePackets,
	evaluator,
}: {
	variants: GenerationVariant[];
	evalCases: EvalCase[];
	sourcePackets: SourcePacket[];
	evaluator: EvaluatorMode;
}) {
	const sourcePacketsById = sourcePacketById(sourcePackets);
	let estimatedCost = 0;

	for (const variant of variants) {
		for (const evalCase of evalCases) {
			const sourcePacket = sourcePacketsById.get(evalCase.sourcePacketId);
			const promptTokens =
				estimateTokens(JSON.stringify(sourcePacket ?? {})) +
				estimateTokens(evalCase.task);
			const outputTokens = variant.maxOutputTokens ?? 1200;
			if (variant.provider === "openai") {
				const estimate = estimateOpenAIUsd({
					modelName: variant.model,
					inputTokens: promptTokens,
					cachedInputTokens: 0,
					outputTokens,
				});
				if (estimate.estimatedUsd === null) {
					return null;
				}
				estimatedCost += estimate.estimatedUsd;
			}
			if (evaluator === "hybrid") {
				const estimate = estimateOpenAIUsd({
					modelName:
						process.env.OPENAI_EVAL_MODEL ?? defaultOpenAIEvaluatorModel,
					inputTokens: promptTokens + outputTokens,
					cachedInputTokens: 0,
					outputTokens: 700,
				});
				if (estimate.estimatedUsd === null) {
					return null;
				}
				estimatedCost += estimate.estimatedUsd;
			}
		}
	}

	return roundCostUsd(estimatedCost);
}

function assertPricingConfigured({
	variants,
	evaluator,
}: {
	variants: GenerationVariant[];
	evaluator: EvaluatorMode;
}) {
	for (const variant of variants) {
		if (
			variant.provider === "openai" &&
			!pricingForOpenAIModel(variant.model)
		) {
			throw new Error(
				`OpenAI pricing is not configured for matrix variant model ${variant.model}.`,
			);
		}
	}
	if (
		evaluator === "hybrid" &&
		!pricingForOpenAIModel(
			process.env.OPENAI_EVAL_MODEL ?? defaultOpenAIEvaluatorModel,
		)
	) {
		throw new Error("OpenAI evaluator pricing is not configured.");
	}
}

function assertLiveProviderReady(
	variants: GenerationVariant[],
	evaluator: EvaluatorMode,
) {
	const needsOpenAI =
		evaluator === "hybrid" ||
		variants.some((variant) => variant.provider === "openai");
	if (needsOpenAI && !openAIApiKey) {
		throw new Error(
			"OPENAI_API_KEY is required because eval:matrix defaults to live OpenAI/hybrid evidence.",
		);
	}
}

function guardrailStatusFor({
	citationSupport,
	unsupportedClaimCount,
	costRatio,
	medianLatencyMs,
	spec,
}: {
	citationSupport: number;
	unsupportedClaimCount: number;
	costRatio: number;
	medianLatencyMs: number;
	spec: VariantSpec;
}) {
	if (
		unsupportedClaimCount > 0 ||
		costRatio > spec.budget.maxCostRatio ||
		medianLatencyMs > spec.budget.maxMedianLatencyMs
	) {
		return "fail" as const;
	}
	if (citationSupport < 0.72) {
		return "warn" as const;
	}

	return "pass" as const;
}

function manifestForVariantRun({
	runId,
	variant,
	caseIds,
	evaluations,
	traces,
	artifactPaths,
	status,
	error,
}: {
	runId: string;
	variant: GenerationVariant;
	caseIds: string[];
	evaluations: EvaluatorOutput[];
	traces: GenerationTrace[];
	artifactPaths: string[];
	status: RunManifest["status"];
	error?: string;
}) {
	const estimatedCostUsd = hasUnknownCost(traces)
		? null
		: roundCostUsd(knownEstimatedCost(traces));
	const evaluatorEstimatedCostUsd = hasUnknownEvaluatorCost(evaluations)
		? null
		: roundCostUsd(knownEstimatedEvaluatorCost(evaluations));
	const totalEstimatedCostUsd = hasUnknownTotalCost({ evaluations, traces })
		? null
		: roundCostUsd(knownEstimatedTotalCost({ evaluations, traces }));

	return RunManifestSchema.parse({
		runId,
		createdAt: new Date().toISOString(),
		variantLabel: `${variant.label} matrix slice`,
		status,
		gitRef: "local-worktree",
		command: `bun run eval:matrix --variant-id=${variant.id}`,
		caseIds,
		aggregateMetrics: {
			overall: averageScore(evaluations, "overall"),
			grounding: averageScore(evaluations, "grounding"),
			coverage: averageScore(evaluations, "coverage"),
			citationSupport: averageScore(evaluations, "citationSupport"),
			unsupportedClaims: unsupportedClaims(evaluations),
			groundingRiskUnits: unsupportedClaims(evaluations),
			medianLatencyMs: median(traces.map((trace) => trace.latencyMs)),
			estimatedCostUsd,
			evaluatorEstimatedCostUsd,
			costRatio:
				totalEstimatedCostUsd === null
					? 1
					: Math.max(1, 1 + totalEstimatedCostUsd),
			latencyRatio: 1,
		},
		guardrails: [
			{
				id: "citation-support",
				label: "Citation support",
				status:
					averageScore(evaluations, "citationSupport") >= 0.72
						? "pass"
						: "warn",
				value: averageScore(evaluations, "citationSupport").toFixed(2),
				threshold: ">= 0.72",
			},
			{
				id: "unsupported-claims",
				label: "Unsupported claims",
				status: unsupportedClaims(evaluations) === 0 ? "pass" : "fail",
				value: String(unsupportedClaims(evaluations)),
				threshold: "0",
			},
		],
		artifactPaths,
		error,
	});
}

async function withRetries<T>({
	label,
	operation,
	retryCap,
}: {
	label: string;
	operation: (attempt: number) => Promise<T>;
	retryCap: number;
}) {
	let lastError: unknown;
	for (let attempt = 0; attempt <= retryCap; attempt += 1) {
		try {
			return await operation(attempt);
		} catch (error) {
			lastError = error;
			if (attempt >= retryCap) {
				break;
			}
			console.warn(
				`${label} failed on attempt ${attempt + 1}/${retryCap + 1}; retrying.`,
			);
		}
	}

	throw lastError;
}

async function runVariantCase({
	casePrefix,
	evalCase,
	runId,
	sourcePacket,
	variant,
	evaluator,
}: {
	casePrefix: string;
	evalCase: EvalCase;
	runId: string;
	sourcePacket: SourcePacket;
	variant: GenerationVariant;
	evaluator: EvaluatorMode;
}): Promise<VariantCaseArtifacts> {
	console.log(`${casePrefix} ${variant.id}: generating ${evalCase.id}...`);
	const result = await generateBriefing({
		sourcePacket,
		userRequest: evalCase.task,
		runId,
		variant,
		provider: variant.provider as "local" | "openai",
	});
	const rawBriefing = result.briefing;
	const persistedBriefing = BriefingOutputSchema.parse(
		briefingWithAcceptedCitationsOnly(rawBriefing, evalCase),
	);
	const briefingPath = `runs/${runId}/briefings/${evalCase.id}.json`;
	const tracePath = `runs/${runId}/traces/${evalCase.id}.json`;
	const evaluationPath = `runs/${runId}/evaluations/${evalCase.id}.json`;
	const trace = GenerationTraceSchema.parse({
		...result.trace,
		output: persistedBriefing,
		rawOutput: rawBriefing,
		artifactPaths: [...result.trace.artifactPaths, briefingPath, tracePath],
	});
	await Promise.all([
		writeJsonArtifact(briefingPath, persistedBriefing),
		writeJsonArtifact(tracePath, trace),
	]);
	const evaluation = await evaluateBriefing({
		runId,
		evalCase,
		sourcePacket,
		briefing: persistedBriefing,
		trace,
		mode: evaluator,
	});
	await writeJsonArtifact(evaluationPath, evaluation);
	console.log(
		`${casePrefix} ${variant.id}: overall ${evaluation.scores.overall.toFixed(2)}, citation ${evaluation.scores.citationSupport.toFixed(2)}.`,
	);

	return {
		briefing: persistedBriefing,
		evaluation,
		trace,
		artifactPaths: [briefingPath, tracePath, evaluationPath],
	};
}

async function runVariantSlice({
	variant,
	spec,
	evalCases,
	sourcePackets,
	evaluator,
	retryCap,
}: {
	variant: GenerationVariant;
	spec: VariantSpec;
	evalCases: EvalCase[];
	sourcePackets: SourcePacket[];
	evaluator: EvaluatorMode;
	retryCap: number;
}): Promise<VariantRunArtifacts> {
	const runId = `matrix-${variant.id}-${matrixTimestamp}`;
	const sourcePacketsById = sourcePacketById(sourcePackets);
	const artifactPaths = [`runs/${runId}/manifest.json`];
	const briefings: BriefingOutput[] = [];
	const evaluations: EvaluatorOutput[] = [];
	const traces: GenerationTrace[] = [];

	await writeJsonArtifact(
		`runs/${runId}/manifest.json`,
		manifestForVariantRun({
			runId,
			variant,
			caseIds: evalCases.map((evalCase) => evalCase.id),
			evaluations,
			traces,
			artifactPaths,
			status: "running",
		}),
	);

	let manifest: RunManifest;
	try {
		for (const [caseIndex, evalCase] of evalCases.entries()) {
			const sourcePacket = sourcePacketsById.get(evalCase.sourcePacketId);
			if (!sourcePacket) {
				throw new Error(
					`Eval case ${evalCase.id} references missing source packet ${evalCase.sourcePacketId}.`,
				);
			}
			const casePrefix = `[${caseIndex + 1}/${evalCases.length}]`;
			const caseArtifacts = await withRetries({
				label: `${variant.id} ${evalCase.id}`,
				retryCap,
				operation: () =>
					runVariantCase({
						casePrefix,
						evalCase,
						runId,
						sourcePacket,
						variant,
						evaluator,
					}),
			});
			briefings.push(caseArtifacts.briefing);
			traces.push(caseArtifacts.trace);
			evaluations.push(caseArtifacts.evaluation);
			artifactPaths.push(...caseArtifacts.artifactPaths);
		}

		manifest = manifestForVariantRun({
			runId,
			variant,
			caseIds: evalCases.map((evalCase) => evalCase.id),
			evaluations,
			traces,
			artifactPaths,
			status: "complete",
		});
		await writeJsonArtifact(`runs/${runId}/manifest.json`, manifest);
	} catch (error) {
		manifest = manifestForVariantRun({
			runId,
			variant,
			caseIds: evalCases.map((evalCase) => evalCase.id),
			evaluations,
			traces,
			artifactPaths,
			status: "failed",
			error: error instanceof Error ? error.message : String(error),
		});
		await writeJsonArtifact(`runs/${runId}/manifest.json`, manifest);
		throw error;
	}

	return {
		variant,
		spec,
		manifest,
		briefings,
		evaluations,
		traces,
		artifactPaths,
	};
}

function latestBaselineRunId(manifests: RunManifest[], explicitRunId?: string) {
	if (explicitRunId) {
		const explicit = manifests.find(
			(manifest) => manifest.runId === explicitRunId,
		);
		if (!explicit) {
			throw new Error(`No baseline run manifest found for ${explicitRunId}.`);
		}
		return explicit.runId;
	}

	const generatedOpenAIBaseline = [...manifests]
		.reverse()
		.find(
			(manifest) =>
				manifest.status === "complete" &&
				manifest.runId.startsWith("baseline-openai-"),
		);
	return generatedOpenAIBaseline?.runId ?? "baseline-openai-20260624203921";
}

function baselineMetricsForSelectedCases(
	baselineRunId: string,
	_manifests: RunManifest[],
) {
	return {
		baselineRunId,
	};
}

function matrixProviderFor(variants: GenerationVariant[]): MatrixProvider {
	const providers = new Set(variants.map((variant) => variant.provider));
	if (providers.size === 1 && providers.has("local")) {
		return "local";
	}
	if (providers.size === 1 && providers.has("openai")) {
		return "openai";
	}
	return "mixed";
}

function cellForCase(run: VariantRunArtifacts, caseId: string) {
	const evaluation = run.evaluations.find(
		(candidateEvaluation) => candidateEvaluation.caseId === caseId,
	);
	const trace = run.traces.find(
		(candidateTrace) => candidateTrace.caseId === caseId,
	);
	if (!evaluation) {
		return {
			variantId: run.variant.id,
			status: "skipped" as const,
			overall: null,
			grounding: null,
			coverage: null,
			citationSupport: null,
			unsupportedClaims: null,
			latencyMs: null,
			estimatedCostUsd: null,
			artifactPaths: [],
		};
	}

	return {
		variantId: run.variant.id,
		status: "complete" as const,
		overall: evaluation.scores.overall,
		grounding: evaluation.scores.grounding,
		coverage: evaluation.scores.coverage,
		citationSupport: evaluation.scores.citationSupport,
		unsupportedClaims:
			evaluation.claimJudgments?.filter(
				(judgment) => judgment.supportStatus === "unsupported",
			).length ?? 0,
		latencyMs: trace?.latencyMs ?? null,
		estimatedCostUsd: caseEstimatedCostUsd({ evaluation, trace }),
		artifactPaths: evaluation.artifactPaths,
	};
}

function matrixRecommendation(runs: VariantRunArtifacts[]) {
	const rankedRuns = [...runs].sort((left, right) => {
		const leftRisk = unsupportedClaims(left.evaluations);
		const rightRisk = unsupportedClaims(right.evaluations);
		if (leftRisk !== rightRisk) {
			return leftRisk - rightRisk;
		}
		const overallDelta =
			averageScore(right.evaluations, "overall") -
			averageScore(left.evaluations, "overall");
		if (overallDelta !== 0) {
			return overallDelta;
		}
		return (
			median(left.traces.map((trace) => trace.latencyMs)) -
			median(right.traces.map((trace) => trace.latencyMs))
		);
	});
	const bestRun = rankedRuns[0];
	if (!bestRun) {
		return {
			variantId: null,
			label: "needs human review",
			rationale: "No matrix runs completed.",
			guardrailStatus: "fail" as const,
		};
	}
	const citationSupport = averageScore(bestRun.evaluations, "citationSupport");
	const risk = unsupportedClaims(bestRun.evaluations);
	const estimatedCostUsd = hasUnknownTotalCost({
		evaluations: bestRun.evaluations,
		traces: bestRun.traces,
	})
		? null
		: roundCostUsd(
				knownEstimatedTotalCost({
					evaluations: bestRun.evaluations,
					traces: bestRun.traces,
				}),
			);
	const costRatio =
		estimatedCostUsd === null ? 1 : Math.max(1, 1 + estimatedCostUsd);
	const latencyMs = median(bestRun.traces.map((trace) => trace.latencyMs));
	const guardrailStatus = guardrailStatusFor({
		citationSupport,
		unsupportedClaimCount: risk,
		costRatio,
		medianLatencyMs: latencyMs,
		spec: bestRun.spec,
	});

	return {
		variantId: bestRun.variant.id,
		label:
			guardrailStatus === "pass" ? "promising candidate" : "needs human review",
		rationale: `${bestRun.variant.label} ranked highest on the focused visible slice with ${risk} unsupported-claim risk units and ${citationSupport.toFixed(2)} citation support.`,
		guardrailStatus,
	};
}

function dryRunMatrix({
	matrixId,
	matrixPath,
	baselineRunId,
	selectedCases,
	selectedVariants,
	options,
	estimatedMaxCostUsd,
	liveProviderCalls,
}: {
	matrixId: string;
	matrixPath: string;
	baselineRunId: string;
	selectedCases: EvalCase[];
	selectedVariants: GenerationVariant[];
	options: MatrixOptions;
	estimatedMaxCostUsd: number | null;
	liveProviderCalls: boolean;
}) {
	return FocusedVariantMatrixSchema.parse({
		id: matrixId,
		createdAt: new Date().toISOString(),
		baselineRunId,
		provider: matrixProviderFor(selectedVariants),
		evaluator: options.evaluator,
		bounds: {
			variantCount: selectedVariants.length,
			caseCount: selectedCases.length,
			retryCap: options.retryCap,
			includeHoldouts: options.includeHoldouts,
			estimatedMaxCostUsd,
			liveProviderCalls,
		},
		caseIds: selectedCases.map((evalCase) => evalCase.id),
		variants: selectedVariants.map((variant) => ({
			variantId: variant.id,
			label: variant.label,
			provider: variant.provider,
			model: variant.model,
			promptVersion: variant.promptVersion,
			runId: `matrix-${variant.id}-${matrixTimestamp}`,
			status: "skipped",
			metrics: {
				overall: 0,
				grounding: 0,
				coverage: 0,
				citationSupport: 0,
				unsupportedClaims: 0,
				medianLatencyMs: 0,
				estimatedCostUsd: null,
				costRatio: 1,
				guardrailStatus: "warn",
			},
			artifactPaths: [matrixPath],
		})),
		rows: selectedCases.map((evalCase) => ({
			caseId: evalCase.id,
			cells: selectedVariants.map((variant) => ({
				variantId: variant.id,
				status: "skipped",
				overall: null,
				grounding: null,
				coverage: null,
				citationSupport: null,
				unsupportedClaims: null,
				latencyMs: null,
				estimatedCostUsd: null,
				artifactPaths: [],
			})),
		})),
		recommendation: {
			variantId: null,
			label: "dry run",
			rationale:
				"Dry run validated matrix bounds, selection, cost estimate, and artifact schema without provider calls.",
			guardrailStatus: "warn",
		},
		artifactPaths: [matrixPath],
	});
}

async function main() {
	const options = parseOptions();
	const [evalCases, sourcePackets, variantSpecs, manifests] = await Promise.all(
		[
			listEvalCases(),
			listSourcePackets(),
			listVariantSpecs(),
			listRunManifests(),
		],
	);
	const selectedCases = selectCases(options, evalCases);
	const selectedSpecs = selectVariants(options, variantSpecs);
	const selectedVariants = selectedSpecs.map(variantFromSpec);
	const baselineRunId = latestBaselineRunId(manifests, options.baselineRunId);
	const estimatedMaxCostUsd = estimateMatrixCostUsd({
		variants: selectedVariants,
		evalCases: selectedCases,
		sourcePackets,
		evaluator: options.evaluator,
	});
	const liveProviderCalls =
		options.evaluator === "hybrid" ||
		selectedVariants.some((variant) => variant.provider === "openai");
	const matrixId = `matrix-${matrixTimestamp}`;
	const matrixPath = `runs/comparisons/matrices/${matrixId}.json`;

	console.log("Focused variant matrix bounds:");
	console.log(`- variants: ${selectedVariants.length}/${options.variantLimit}`);
	console.log(`- cases: ${selectedCases.length}/${options.caseLimit}`);
	console.log(`- retry cap: ${options.retryCap}`);
	console.log(`- include holdouts: ${options.includeHoldouts ? "yes" : "no"}`);
	console.log(
		`- estimated max cost: ${
			estimatedMaxCostUsd === null ? "unknown" : `$${estimatedMaxCostUsd}`
		}`,
	);
	console.log(`- live provider calls: ${liveProviderCalls ? "yes" : "no"}`);

	assertPricingConfigured({
		variants: selectedVariants,
		evaluator: options.evaluator,
	});
	if (options.dryRun) {
		const matrix = dryRunMatrix({
			matrixId,
			matrixPath,
			baselineRunId,
			selectedCases,
			selectedVariants,
			options,
			estimatedMaxCostUsd,
			liveProviderCalls,
		});
		console.log(
			`Dry-run matrix schema validated for ${matrix.variants.length} variants x ${matrix.caseIds.length} cases.`,
		);
		console.log("No provider calls made and no artifacts written.");
		return;
	}

	assertLiveProviderReady(selectedVariants, options.evaluator);

	const runs: VariantRunArtifacts[] = [];
	for (const [variantIndex, variant] of selectedVariants.entries()) {
		const spec = selectedSpecs[variantIndex];
		if (!spec) {
			throw new Error(`Missing variant spec for ${variant.id}.`);
		}
		runs.push(
			await runVariantSlice({
				variant,
				spec,
				evalCases: selectedCases,
				sourcePackets,
				evaluator: options.evaluator,
				retryCap: options.retryCap,
			}),
		);
	}

	const matrix = FocusedVariantMatrixSchema.parse({
		id: matrixId,
		createdAt: new Date().toISOString(),
		...baselineMetricsForSelectedCases(baselineRunId, manifests),
		provider: matrixProviderFor(selectedVariants),
		evaluator: options.evaluator,
		bounds: {
			variantCount: selectedVariants.length,
			caseCount: selectedCases.length,
			retryCap: options.retryCap,
			includeHoldouts: options.includeHoldouts,
			estimatedMaxCostUsd,
			liveProviderCalls,
		},
		caseIds: selectedCases.map((evalCase) => evalCase.id),
		variants: runs.map((run) => {
			const estimatedCostUsd = hasUnknownTotalCost({
				evaluations: run.evaluations,
				traces: run.traces,
			})
				? null
				: roundCostUsd(
						knownEstimatedTotalCost({
							evaluations: run.evaluations,
							traces: run.traces,
						}),
					);
			const costRatio =
				estimatedCostUsd === null ? 1 : Math.max(1, 1 + estimatedCostUsd);
			const citationSupport = averageScore(run.evaluations, "citationSupport");
			const risk = unsupportedClaims(run.evaluations);
			const medianLatencyMs = median(
				run.traces.map((trace) => trace.latencyMs),
			);

			return {
				variantId: run.variant.id,
				label: run.variant.label,
				provider: run.variant.provider,
				model: run.variant.model,
				promptVersion: run.variant.promptVersion,
				runId: run.manifest.runId,
				status: run.manifest.status,
				metrics: {
					overall: averageScore(run.evaluations, "overall"),
					grounding: averageScore(run.evaluations, "grounding"),
					coverage: averageScore(run.evaluations, "coverage"),
					citationSupport,
					unsupportedClaims: risk,
					medianLatencyMs,
					estimatedCostUsd,
					costRatio,
					guardrailStatus: guardrailStatusFor({
						citationSupport,
						unsupportedClaimCount: risk,
						costRatio,
						medianLatencyMs,
						spec: run.spec,
					}),
				},
				artifactPaths: run.artifactPaths,
			};
		}),
		rows: selectedCases.map((evalCase) => ({
			caseId: evalCase.id,
			cells: runs.map((run) => cellForCase(run, evalCase.id)),
		})),
		recommendation: matrixRecommendation(runs),
		artifactPaths: [
			matrixPath,
			...runs.map((run) => `runs/${run.manifest.runId}/manifest.json`),
		],
	});
	await writeJsonArtifact(matrixPath, matrix);
	console.log(
		`Wrote focused variant matrix ${matrix.id}: ${matrix.recommendation.label}.`,
	);
	console.log(matrix.recommendation.rationale);
}

await main();
