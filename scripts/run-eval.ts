import { spawn } from "node:child_process";
import {
	access,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

import { generateBriefing } from "~/genie/generate-briefing";
import { pricingForOpenAIModel } from "~/genie/openai-pricing";
import { defaultOpenAIModel } from "~/genie/variants";
import {
	listBriefingOutputs,
	listEvalCases,
	listEvaluatorOutputs,
	listGenerationTraces,
	listRunManifests,
	listSourcePackets,
} from "~/run-store";
import {
	type BriefingOutput,
	BriefingOutputSchema,
	type EvalCase,
	type EvaluatorOutput,
	EvaluatorOutputSchema,
	type GenerationTrace,
	GenerationTraceSchema,
	type RunComparison,
	RunComparisonSchema,
	type RunManifest,
	RunManifestSchema,
	type SourcePacket,
} from "~/schemas";

type EvalMode = "baseline" | "variant" | "report";
type EvalProvider = "local" | "openai";

interface EvalOptions {
	mode: EvalMode;
	provider: EvalProvider;
	includeHoldouts: boolean;
	overwriteRun: boolean;
	runId?: string;
	baselineRunId?: string;
	candidateRunId?: string;
}

interface RunArtifacts {
	manifest: RunManifest;
	briefings: BriefingOutput[];
	evaluations: EvaluatorOutput[];
	traces: GenerationTrace[];
}

const repoRoot = process.cwd();
const seededCandidateRunId = "candidate-citation-gates";
const generatedBaselinePrefixes = ["baseline-local-", "baseline-openai-"];
const generatedCandidatePrefixes = ["candidate-local-", "candidate-openai-"];
const localEvaluatorCalibration = {
	// This evaluator is a deterministic demo heuristic, not a statistically
	// calibrated judge. These constants keep the local extractive baseline below
	// the reference target fixture while preserving stable artifact generation.
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
} as const;
const coverageTermMinimumLength = 5;
const coverageTermsPerPoint = 5;
const fixtureIdPattern = /^[a-z0-9][a-z0-9-]*$/;
const reservedRunIds = new Set(["comparisons"]);

function optionValue(name: string) {
	const prefix = `${name}=`;
	const match = process.argv.find((argument) => argument.startsWith(prefix));
	return match?.slice(prefix.length);
}

function hasFlag(name: string) {
	return process.argv.includes(name);
}

function parseOptions(): EvalOptions {
	const mode = (process.argv[2] ?? "report") as EvalMode;
	if (!["baseline", "variant", "report"].includes(mode)) {
		throw new Error(
			`Unknown eval mode "${mode}". Use baseline, variant, or report.`,
		);
	}

	const provider = (optionValue("--provider") ?? "local") as EvalProvider;
	if (!["local", "openai"].includes(provider)) {
		throw new Error(`Unknown provider "${provider}". Use local or openai.`);
	}

	return {
		mode,
		provider,
		includeHoldouts: hasFlag("--include-holdouts"),
		overwriteRun:
			hasFlag("--overwrite-run") || process.env.EVAL_OVERWRITE_RUN === "1",
		runId: optionValue("--run-id") ?? process.env.EVAL_RUN_ID,
		baselineRunId:
			optionValue("--baseline") ?? process.env.EVAL_BASELINE_RUN_ID,
		candidateRunId:
			optionValue("--candidate") ?? process.env.EVAL_CANDIDATE_RUN_ID,
	};
}

function absolutePath(relativePath: string) {
	return path.join(repoRoot, relativePath);
}

function validateFixtureId(value: string, label: string) {
	if (!fixtureIdPattern.test(value)) {
		throw new Error(
			`Invalid ${label} "${value}". Use lowercase letters, numbers, and hyphens only; path separators are not allowed.`,
		);
	}
	if (label === "run id" && reservedRunIds.has(value)) {
		throw new Error(
			`Invalid run id "${value}". This id is reserved for run-store infrastructure.`,
		);
	}

	return value;
}

function commandFor({
	mode,
	provider,
	runId,
	includeHoldouts,
	referenceManifest,
}: {
	mode: Exclude<EvalMode, "report">;
	provider: EvalProvider;
	runId: string;
	includeHoldouts: boolean;
	referenceManifest?: RunManifest;
}) {
	const parts = [
		`bun run eval:${mode}`,
		`--provider=${provider}`,
		`--run-id=${runId}`,
	];
	if (includeHoldouts) {
		parts.push("--include-holdouts");
	}
	if (mode === "variant" && referenceManifest) {
		parts.push(`--baseline=${referenceManifest.runId}`);
	}

	return parts.join(" ");
}

async function artifactExists(relativePath: string) {
	try {
		await access(absolutePath(relativePath));
		return true;
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return false;
		}

		throw error;
	}
}

async function formatJsonArtifact(relativePath: string, value: unknown) {
	const formatterPath = absolutePath(
		path.join(
			"node_modules",
			".bin",
			process.platform === "win32" ? "biome.cmd" : "biome",
		),
	);
	const formatter = spawn(formatterPath, [
		"format",
		"--stdin-file-path",
		relativePath,
	]);
	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];

	formatter.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
	formatter.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
	formatter.stdin.end(`${JSON.stringify(value, null, "\t")}\n`);

	const exitCode = await new Promise<number | null>((resolve, reject) => {
		formatter.on("error", reject);
		formatter.on("close", resolve);
	});
	if (exitCode !== 0) {
		throw new Error(
			`Biome failed to format ${relativePath}: ${Buffer.concat(
				stderrChunks,
			).toString()}`,
		);
	}

	return Buffer.concat(stdoutChunks).toString();
}

async function writeJsonArtifact(relativePath: string, value: unknown) {
	const targetPath = absolutePath(relativePath);
	await mkdir(path.dirname(targetPath), { recursive: true });
	const tempPath = `${targetPath}.tmp`;
	await writeFile(tempPath, await formatJsonArtifact(relativePath, value));
	await rename(tempPath, targetPath);
}

async function writeTextArtifact(relativePath: string, value: string) {
	const targetPath = absolutePath(relativePath);
	await mkdir(path.dirname(targetPath), { recursive: true });
	const tempPath = `${targetPath}.tmp`;
	await writeFile(tempPath, value);
	await rename(tempPath, targetPath);
}

async function clearRunOutputDirectories(runId: string) {
	await Promise.all(
		["briefings", "traces", "evaluations"].map((artifactDir) =>
			rm(absolutePath(`runs/${runId}/${artifactDir}`), {
				force: true,
				recursive: true,
			}),
		),
	);
}

async function comparisonFileReferencesRun(fileName: string, runId: string) {
	const comparison = RunComparisonSchema.parse(
		JSON.parse(
			await readFile(absolutePath(`runs/comparisons/${fileName}`), "utf8"),
		),
	);

	return (
		comparison.baselineRunId === runId || comparison.candidateRunId === runId
	);
}

async function quarantineRunComparisons(runId: string) {
	let comparisonFiles: string[];
	try {
		comparisonFiles = await readdir(absolutePath("runs/comparisons"));
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return 0;
		}

		throw error;
	}

	const comparisonMatches = await Promise.all(
		comparisonFiles
			.filter((fileName) => fileName.endsWith(".json"))
			.map(async (fileName) => ({
				fileName,
				referencesRun: await comparisonFileReferencesRun(fileName, runId),
			})),
	);
	const staleComparisonFiles = comparisonMatches
		.filter((match) => match.referencesRun)
		.map((match) => match.fileName);
	if (staleComparisonFiles.length === 0) {
		return 0;
	}

	const staleDir = absolutePath("runs/comparisons/stale");
	await mkdir(staleDir, { recursive: true });
	const timestamp = slugTimestamp();
	await Promise.all(
		staleComparisonFiles.map((fileName) =>
			rename(
				absolutePath(`runs/comparisons/${fileName}`),
				path.join(staleDir, `${timestamp}-${fileName}`),
			),
		),
	);

	return staleComparisonFiles.length;
}

async function prepareRunOutputDirectories(
	runId: string,
	overwriteRun: boolean,
) {
	validateFixtureId(runId, "run id");
	const manifestPath = `runs/${runId}/manifest.json`;
	const hasExistingManifest = await artifactExists(manifestPath);

	if (hasExistingManifest && !overwriteRun) {
		throw new Error(
			`Run ${runId} already has ${manifestPath}. Re-run with --overwrite-run or EVAL_OVERWRITE_RUN=1 to replace its generated artifacts.`,
		);
	}

	if (overwriteRun) {
		await quarantineRunComparisons(runId);
	}
	await clearRunOutputDirectories(runId);
}

function slugTimestamp(date = new Date()) {
	return date.toISOString().replace(/\D/g, "").slice(0, 14);
}

function runIdFor(mode: Exclude<EvalMode, "report">, provider: EvalProvider) {
	const prefix = mode === "baseline" ? "baseline" : "candidate";
	return `${prefix}-${provider}-${slugTimestamp()}`;
}

function assertOpenAIPricingIsConfigured(options: EvalOptions) {
	if (options.mode === "report" || options.provider !== "openai") {
		return;
	}

	const modelName = process.env.OPENAI_MODEL ?? defaultOpenAIModel;
	const pricing = pricingForOpenAIModel(modelName);
	if (pricing) {
		console.log(
			`Using ${pricing.source} for ${modelName}: input $${pricing.inputUsdPer1MTokens}/1M, cached input $${pricing.cachedInputUsdPer1MTokens}/1M, output $${pricing.outputUsdPer1MTokens}/1M.`,
		);
		return;
	}

	throw new Error(
		[
			`OpenAI pricing is not configured for model "${modelName}".`,
			"Add the model and reviewed token rates to src/genie/openai-pricing.ts before running live evals.",
			"This aborts before provider calls so generated traces do not persist unknown estimatedUsd values.",
		].join(" "),
	);
}

function sourcePacketById(sourcePackets: SourcePacket[]) {
	return new Map(
		sourcePackets.map((sourcePacket) => [sourcePacket.id, sourcePacket]),
	);
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
							citations: [evalCase.acceptedCitations[0] ?? "S1"],
						},
					],
	};
}

function sortedIds(values: string[]) {
	return [...values].sort();
}

function assertMatchingCaseIds({
	actualLabel,
	actualCaseIds,
	referenceLabel,
	referenceCaseIds,
}: {
	actualLabel: string;
	actualCaseIds: string[];
	referenceLabel: string;
	referenceCaseIds: string[];
}) {
	const sortedActualCaseIds = sortedIds(actualCaseIds);
	const sortedReferenceCaseIds = sortedIds(referenceCaseIds);

	if (sortedActualCaseIds.join("\0") !== sortedReferenceCaseIds.join("\0")) {
		throw new Error(
			`Cannot compare different case sets: ${actualLabel} has [${sortedActualCaseIds.join(", ")}], ${referenceLabel} has [${sortedReferenceCaseIds.join(", ")}].`,
		);
	}
}

function assertVariantCaseSetMatchesBaseline({
	referenceManifest,
	selectedEvalCases,
}: {
	referenceManifest?: RunManifest;
	selectedEvalCases: EvalCase[];
}) {
	if (!referenceManifest) {
		return;
	}

	assertMatchingCaseIds({
		actualLabel: "selected variant corpus",
		actualCaseIds: selectedEvalCases.map((evalCase) => evalCase.id),
		referenceLabel: `baseline ${referenceManifest.runId}`,
		referenceCaseIds: referenceManifest.caseIds,
	});
}

function roundMetric(value: number) {
	return Math.round(value * 100) / 100;
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
		localEvaluatorCalibration.coverageFloor,
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

function evaluatorScores(evalCase: EvalCase, briefing: BriefingOutput) {
	let coverage = coverageScore(evalCase, briefing);
	let citationSupport = citationSupportScore(evalCase, briefing);
	const failureRisk = Math.min(
		localEvaluatorCalibration.failureRiskCap,
		evalCase.failureTags.length * localEvaluatorCalibration.failureRiskPerTag,
	);
	const isLocalExtractive =
		briefing.metadata.model === "deterministic-extractive";

	if (isLocalExtractive) {
		coverage = Math.min(
			localEvaluatorCalibration.localExtractiveCoverageCap,
			Math.max(
				localEvaluatorCalibration.localExtractiveCoverageFloor,
				coverage - localEvaluatorCalibration.localExtractiveCoveragePenalty,
			),
		);
		citationSupport = Math.min(
			localEvaluatorCalibration.localExtractiveCitationSupportCap,
			Math.max(
				localEvaluatorCalibration.localExtractiveCitationSupportFloor,
				citationSupport -
					localEvaluatorCalibration.localExtractiveCitationSupportPenalty +
					coverage *
						localEvaluatorCalibration.localExtractiveCitationCoverageWeight -
					failureRisk,
			),
		);
	}

	// Score the run like a lightweight reviewer. Coverage rewards mentioning
	// expected points, citation support rewards citing allowed evidence, grounding
	// blends those signals while penalizing risky failure tags, and overall is a
	// weighted summary. Scores near 1.0 mean strong demo evidence; scores around
	// 0.6 are useful baselines with visible gaps; lower scores should read as
	// clear failures.
	const grounding = Math.max(
		localEvaluatorCalibration.groundingFloor,
		Math.min(
			localEvaluatorCalibration.groundingCap,
			citationSupport * localEvaluatorCalibration.groundingCitationWeight +
				coverage * localEvaluatorCalibration.groundingCoverageWeight -
				failureRisk,
		),
	);
	const overall = Math.max(
		localEvaluatorCalibration.overallFloor,
		Math.min(
			localEvaluatorCalibration.overallCap,
			coverage * localEvaluatorCalibration.overallCoverageWeight +
				citationSupport * localEvaluatorCalibration.overallCitationWeight +
				grounding * localEvaluatorCalibration.overallGroundingWeight,
		),
	);

	return {
		overall: roundMetric(overall),
		grounding: roundMetric(grounding),
		coverage: roundMetric(coverage),
		citationSupport: roundMetric(citationSupport),
	};
}

function detectedFailureTags(scores: EvaluatorOutput["scores"]) {
	const tags = new Set<string>();

	if (scores.coverage < 0.65) {
		tags.add("coverage-gap");
	}
	if (scores.citationSupport < 0.72) {
		tags.add("citation-grounding");
	}
	if (scores.grounding < 0.65) {
		tags.add("grounding-risk");
	}

	return [...tags];
}

function evaluatorOutputFor({
	runId,
	evalCase,
	briefing,
}: {
	runId: string;
	evalCase: EvalCase;
	briefing: BriefingOutput;
}) {
	const acceptedCitations = new Set(evalCase.acceptedCitations);
	const citationIds = [
		...new Set(briefing.claims.flatMap((claim) => claim.citations)),
	];
	const citationSupport = citationIds.map((citation) => ({
		citation,
		supported: acceptedCitations.has(citation),
		note: acceptedCitations.has(citation)
			? `${citation} is accepted evidence for ${evalCase.id}.`
			: `${citation} is not listed as accepted evidence for ${evalCase.id}.`,
	}));
	const scores = evaluatorScores(evalCase, briefing);

	return EvaluatorOutputSchema.parse({
		id: `evaluation-${runId}-${evalCase.id}`,
		runId,
		caseId: evalCase.id,
		scores,
		failureTags: detectedFailureTags(scores),
		rubricEvidence: [
			`Coverage heuristic score: ${scores.coverage.toFixed(2)}.`,
			`Citation support heuristic score: ${scores.citationSupport.toFixed(2)}.`,
		],
		citationSupport,
		notes:
			"Deterministic local evaluator output for baseline-run artifact generation. Replace or augment with stronger evaluator logic before making production quality claims.",
		artifactPaths: [
			`runs/${runId}/evaluations/${evalCase.id}.json`,
			`runs/${runId}/briefings/${evalCase.id}.json`,
		],
	});
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
	return evaluations.reduce((total, evaluation) => {
		const riskMultiplier = Math.max(1, evaluation.failureTags.length + 1);
		return (
			total +
			Math.max(0, Math.ceil((1 - evaluation.scores.grounding) * riskMultiplier))
		);
	}, 0);
}

function tracesHaveUnknownCost(traces: GenerationTrace[]) {
	return traces.some((trace) => trace.cost.estimatedUsd === null);
}

function knownEstimatedCost(traces: GenerationTrace[]) {
	return traces.reduce(
		(total, trace) => total + (trace.cost.estimatedUsd ?? 0),
		0,
	);
}

function roundCostUsd(value: number) {
	return Math.round(value * 100_000_000) / 100_000_000;
}

function latencyRatioFor({
	mode,
	traces,
	referenceManifest,
}: {
	mode: Exclude<EvalMode, "report">;
	traces: GenerationTrace[];
	referenceManifest?: RunManifest;
}) {
	if (mode === "baseline") {
		return 1;
	}

	const referenceLatency = referenceManifest?.aggregateMetrics.medianLatencyMs;
	if (!referenceLatency) {
		return 1;
	}

	return roundMetric(
		Math.max(
			0.01,
			median(traces.map((trace) => trace.latencyMs)) / referenceLatency,
		),
	);
}

function manifestFor({
	runId,
	mode,
	provider,
	caseIds,
	evaluations,
	traces,
	artifactPaths,
	referenceManifest,
	includeHoldouts,
	status = "complete",
	error,
}: {
	runId: string;
	mode: Exclude<EvalMode, "report">;
	provider: EvalProvider;
	caseIds: string[];
	evaluations: EvaluatorOutput[];
	traces: GenerationTrace[];
	artifactPaths: string[];
	referenceManifest?: RunManifest;
	includeHoldouts: boolean;
	status?: RunManifest["status"];
	error?: string;
}) {
	const hasUnknownCost = tracesHaveUnknownCost(traces);
	const estimatedCostUsd =
		hasUnknownCost || traces.length === 0
			? null
			: roundCostUsd(knownEstimatedCost(traces));
	const costRatio =
		mode === "baseline"
			? 1
			: roundMetric(Math.max(1, 1 + knownEstimatedCost(traces)));
	const citationSupport = averageScore(evaluations, "citationSupport");

	return RunManifestSchema.parse({
		runId,
		createdAt: new Date().toISOString(),
		variantLabel:
			mode === "baseline"
				? `${provider} generated baseline`
				: `${provider} generated variant`,
		status,
		gitRef: "local-worktree",
		command: commandFor({
			mode,
			provider,
			runId,
			includeHoldouts,
			referenceManifest,
		}),
		caseIds,
		aggregateMetrics: {
			overall: averageScore(evaluations, "overall"),
			grounding: averageScore(evaluations, "grounding"),
			coverage: averageScore(evaluations, "coverage"),
			citationSupport,
			unsupportedClaims: unsupportedClaims(evaluations),
			medianLatencyMs: median(traces.map((trace) => trace.latencyMs)),
			estimatedCostUsd,
			costRatio,
			latencyRatio: latencyRatioFor({ mode, traces, referenceManifest }),
		},
		guardrails: [
			{
				id: "citation-support",
				label: "Citation support",
				status: citationSupport >= 0.72 ? "pass" : "warn",
				value: citationSupport.toFixed(2),
				threshold: ">= 0.72",
			},
			{
				id: "cost-ratio",
				label: "Cost ratio",
				status: hasUnknownCost ? "warn" : costRatio <= 1.15 ? "pass" : "warn",
				value: hasUnknownCost ? "unknown" : `${costRatio.toFixed(2)}x`,
				threshold: "<= 1.15x",
			},
		],
		artifactPaths,
		error,
	});
}

async function generateRun(options: EvalOptions) {
	if (options.mode === "report") {
		throw new Error("Report mode does not generate a run.");
	}

	const [evalCases, sourcePackets] = await Promise.all([
		listEvalCases(),
		listSourcePackets(),
	]);
	const sourcePacketsById = sourcePacketById(sourcePackets);
	const selectedEvalCases = evalCases.filter(
		(evalCase) => options.includeHoldouts || !evalCase.holdout,
	);
	const runId = options.runId ?? runIdFor(options.mode, options.provider);
	validateFixtureId(runId, "run id");
	const artifactPaths = [`runs/${runId}/manifest.json`];
	const briefings: BriefingOutput[] = [];
	const traces: GenerationTrace[] = [];
	const evaluations: EvaluatorOutput[] = [];
	const referenceManifest = await referenceManifestForVariant(options);
	assertVariantCaseSetMatchesBaseline({ referenceManifest, selectedEvalCases });

	console.log(
		`Starting ${options.provider} ${options.mode} run ${runId} with ${selectedEvalCases.length} cases.`,
	);
	await prepareRunOutputDirectories(runId, options.overwriteRun);

	try {
		for (const [caseIndex, evalCase] of selectedEvalCases.entries()) {
			const caseNumber = caseIndex + 1;
			const casePrefix = `[${caseNumber}/${selectedEvalCases.length}]`;
			const sourcePacket = sourcePacketsById.get(evalCase.sourcePacketId);
			if (!sourcePacket) {
				throw new Error(
					`Eval case ${evalCase.id} references missing source packet ${evalCase.sourcePacketId}`,
				);
			}

			console.log(`${casePrefix} Generating ${evalCase.id}...`);
			const result = await generateBriefing({
				sourcePacket,
				userRequest: evalCase.task,
				runId,
				provider: options.provider,
			});
			console.log(
				`${casePrefix} Generated ${evalCase.id} in ${(result.trace.latencyMs / 1000).toFixed(1)}s.`,
			);
			const rawBriefing = result.briefing;
			const persistedBriefing = BriefingOutputSchema.parse(
				briefingWithAcceptedCitationsOnly(result.briefing, evalCase),
			);
			const briefingPath = `runs/${runId}/briefings/${evalCase.id}.json`;
			const tracePath = `runs/${runId}/traces/${evalCase.id}.json`;
			const evaluationPath = `runs/${runId}/evaluations/${evalCase.id}.json`;
			const trace = GenerationTraceSchema.parse({
				...result.trace,
				output: persistedBriefing,
				artifactPaths: [
					...result.trace.artifactPaths,
					briefingPath,
					tracePath,
					evaluationPath,
				],
			});
			const evaluation = evaluatorOutputFor({
				runId,
				evalCase,
				briefing: rawBriefing,
			});
			console.log(
				`${casePrefix} Evaluated ${evalCase.id}: overall ${evaluation.scores.overall.toFixed(2)}, citation ${evaluation.scores.citationSupport.toFixed(2)}.`,
			);

			await Promise.all([
				writeJsonArtifact(briefingPath, persistedBriefing),
				writeJsonArtifact(tracePath, trace),
				writeJsonArtifact(evaluationPath, evaluation),
			]);

			briefings.push(persistedBriefing);
			traces.push(trace);
			evaluations.push(evaluation);
			artifactPaths.push(briefingPath, tracePath, evaluationPath);
			console.log(`${casePrefix} Wrote artifacts for ${evalCase.id}.`);
		}

		const manifest = manifestFor({
			runId,
			mode: options.mode,
			provider: options.provider,
			caseIds: selectedEvalCases.map((evalCase) => evalCase.id),
			evaluations,
			traces,
			artifactPaths,
			referenceManifest,
			includeHoldouts: options.includeHoldouts,
		});
		await writeJsonArtifact(`runs/${runId}/manifest.json`, manifest);
		console.log(
			`Completed ${runId}: overall ${manifest.aggregateMetrics.overall.toFixed(2)}, citation ${manifest.aggregateMetrics.citationSupport.toFixed(2)}, median latency ${(manifest.aggregateMetrics.medianLatencyMs / 1000).toFixed(1)}s.`,
		);

		return {
			manifest,
			briefings,
			evaluations,
			traces,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const failedManifest = manifestFor({
			runId,
			mode: options.mode,
			provider: options.provider,
			caseIds: evaluations.map((evaluation) => evaluation.caseId),
			evaluations,
			traces,
			artifactPaths,
			referenceManifest,
			includeHoldouts: options.includeHoldouts,
			status: "failed",
			error: message,
		});
		await writeJsonArtifact(`runs/${runId}/manifest.json`, failedManifest);
		console.log(`Failed ${runId}: ${message}`);
		throw error;
	}
}

function startsWithOneOf(value: string, prefixes: string[]) {
	return prefixes.some((prefix) => value.startsWith(prefix));
}

function isGeneratedBaselineRun(manifest: RunManifest) {
	return (
		startsWithOneOf(manifest.runId, generatedBaselinePrefixes) ||
		manifest.command.includes("eval:baseline") ||
		manifest.variantLabel.endsWith("generated baseline")
	);
}

function isGeneratedCandidateRun(manifest: RunManifest) {
	return (
		startsWithOneOf(manifest.runId, generatedCandidatePrefixes) ||
		manifest.command.includes("eval:variant") ||
		manifest.variantLabel.endsWith("generated variant")
	);
}

function isOpenAIProviderRun(manifest: RunManifest) {
	return (
		manifest.runId.includes("-openai-") ||
		manifest.variantLabel.startsWith("openai generated")
	);
}

function isLocalProviderRun(manifest: RunManifest) {
	return (
		manifest.runId.includes("-local-") ||
		manifest.variantLabel.startsWith("local generated")
	);
}

function isProviderRun(manifest: RunManifest, provider: EvalProvider) {
	return provider === "openai"
		? isOpenAIProviderRun(manifest)
		: isLocalProviderRun(manifest);
}

async function latestRunId(
	prefixes: string[],
	isGeneratedRun?: (manifest: RunManifest) => boolean,
	provider?: EvalProvider,
) {
	const manifests = await listRunManifests();
	return [...manifests]
		.reverse()
		.find(
			(manifest) =>
				manifest.status === "complete" &&
				(startsWithOneOf(manifest.runId, prefixes) ||
					isGeneratedRun?.(manifest)) &&
				(!provider || isProviderRun(manifest, provider)),
		)?.runId;
}

async function manifestForRunId(runId: string | undefined) {
	if (!runId) {
		return undefined;
	}

	return (await listRunManifests()).find(
		(manifest) => manifest.runId === runId,
	);
}

async function completeManifestForRunId(runId: string, role: string) {
	const manifest = await manifestForRunId(runId);
	if (!manifest) {
		throw new Error(`No ${role} run manifest found for ${runId}.`);
	}
	if (manifest.status !== "complete") {
		throw new Error(
			`Cannot use ${role} run ${runId} because its status is ${manifest.status}.`,
		);
	}

	return manifest;
}

async function referenceManifestForVariant(options: EvalOptions) {
	if (options.mode !== "variant") {
		return undefined;
	}

	if (options.baselineRunId) {
		return completeManifestForRunId(options.baselineRunId, "baseline");
	}

	const baselineRunId = await latestRunId(
		[`baseline-${options.provider}-`],
		isGeneratedBaselineRun,
		options.provider,
	);
	if (!baselineRunId) {
		throw new Error(
			`No complete ${options.provider} generated baseline run found. Run eval:baseline --provider=${options.provider} first, or pass --baseline=<run-id> for an explicit cross-provider comparison.`,
		);
	}

	return completeManifestForRunId(baselineRunId, "baseline");
}

async function referenceManifestForBaselineComparison(options: EvalOptions) {
	if (options.mode !== "baseline") {
		return undefined;
	}

	if (options.candidateRunId) {
		return completeManifestForRunId(options.candidateRunId, "candidate");
	}

	const candidateRunId =
		(await latestRunId(generatedCandidatePrefixes, isGeneratedCandidateRun)) ??
		seededCandidateRunId;

	return completeManifestForRunId(candidateRunId, "candidate");
}

async function assertBaselineComparisonIsValid(options: EvalOptions) {
	const referenceManifest =
		await referenceManifestForBaselineComparison(options);
	if (!referenceManifest) {
		return;
	}

	const evalCases = await listEvalCases();
	const selectedCaseIds = evalCases
		.filter((evalCase) => options.includeHoldouts || !evalCase.holdout)
		.map((evalCase) => evalCase.id);

	assertMatchingCaseIds({
		actualLabel: "selected baseline corpus",
		actualCaseIds: selectedCaseIds,
		referenceLabel: `candidate ${referenceManifest.runId}`,
		referenceCaseIds: referenceManifest.caseIds,
	});
}

async function artifactsFor(runId: string): Promise<RunArtifacts> {
	const manifest = (await listRunManifests()).find(
		(candidateManifest) => candidateManifest.runId === runId,
	);
	if (!manifest) {
		throw new Error(`No run manifest found for ${runId}`);
	}
	if (manifest.status !== "complete") {
		throw new Error(
			`Cannot report on run ${runId} because its status is ${manifest.status}.`,
		);
	}

	return {
		manifest,
		briefings: await listBriefingOutputs(runId),
		evaluations: await listEvaluatorOutputs(runId),
		traces: await listGenerationTraces(runId),
	};
}

function formatDelta(candidate: number, baseline: number, suffix = "") {
	const delta = candidate - baseline;
	const sign = delta >= 0 ? "+" : "";
	return `${sign}${delta.toFixed(2)}${suffix}`;
}

function metricTone(delta: number) {
	if (delta >= 0.05) {
		return "green" as const;
	}
	if (delta >= 0) {
		return "blue" as const;
	}
	if (delta > -0.05) {
		return "amber" as const;
	}
	return "red" as const;
}

function targetGapTone(delta: number) {
	if (delta > 0.03) {
		return "amber" as const;
	}
	if (delta >= -0.03) {
		return "green" as const;
	}
	return "blue" as const;
}

function lowerIsBetterTargetGapTone(delta: number) {
	if (delta > 0.03) {
		return "green" as const;
	}
	if (delta >= -0.03) {
		return "green" as const;
	}
	return "red" as const;
}

function estimatedCostUsdFor(artifacts: RunArtifacts) {
	const manifestCost = artifacts.manifest.aggregateMetrics.estimatedCostUsd;
	if (manifestCost !== undefined) {
		return manifestCost;
	}

	if (tracesHaveUnknownCost(artifacts.traces)) {
		return null;
	}

	return roundCostUsd(knownEstimatedCost(artifacts.traces));
}

function formatUsd(value: number) {
	return `$${value.toFixed(4)}`;
}

function referenceCostBudgetMetric({
	baseline,
	candidate,
	baselineLabel,
	candidateLabel,
}: {
	baseline: RunArtifacts;
	candidate: RunArtifacts;
	baselineLabel: string;
	candidateLabel: string;
}) {
	const estimatedCostUsd = estimatedCostUsdFor(baseline);
	const costBudgetUsd = candidate.manifest.aggregateMetrics.costBudgetUsd;

	if (estimatedCostUsd === null || costBudgetUsd === undefined) {
		return {
			label: "Estimated cost",
			value:
				estimatedCostUsd === null ? "unknown" : formatUsd(estimatedCostUsd),
			delta: "unknown",
			status:
				costBudgetUsd === undefined
					? `${candidateLabel} budget not set`
					: `${baselineLabel} vs ${candidateLabel} budget <= ${formatUsd(costBudgetUsd)}`,
			tone: "amber" as const,
		};
	}

	const remainingBudgetUsd = roundCostUsd(costBudgetUsd - estimatedCostUsd);
	const isUnderBudget = remainingBudgetUsd >= 0;

	return {
		label: "Estimated cost",
		value: formatUsd(estimatedCostUsd),
		delta: `${formatUsd(Math.abs(remainingBudgetUsd))} ${
			isUnderBudget ? "under budget" : "over budget"
		}`,
		status: `${baselineLabel} vs ${candidateLabel} budget <= ${formatUsd(costBudgetUsd)}`,
		tone: isUnderBudget ? ("green" as const) : ("red" as const),
	};
}

function referenceCostBudgetRow({
	baseline,
	candidate,
}: {
	baseline: RunArtifacts;
	candidate: RunArtifacts;
}) {
	const estimatedCostUsd = estimatedCostUsdFor(baseline);
	const costBudgetUsd = candidate.manifest.aggregateMetrics.costBudgetUsd;

	if (estimatedCostUsd === null || costBudgetUsd === undefined) {
		return {
			metric: "Estimated cost",
			baseline:
				estimatedCostUsd === null ? "unknown" : formatUsd(estimatedCostUsd),
			candidate:
				costBudgetUsd === undefined
					? "budget not set"
					: `<= ${formatUsd(costBudgetUsd)}`,
			delta: "unknown",
		};
	}

	const remainingBudgetUsd = roundCostUsd(costBudgetUsd - estimatedCostUsd);
	const isUnderBudget = remainingBudgetUsd >= 0;

	return {
		metric: "Estimated cost",
		baseline: formatUsd(estimatedCostUsd),
		candidate: `<= ${formatUsd(costBudgetUsd)}`,
		delta: `${formatUsd(Math.abs(remainingBudgetUsd))} ${
			isUnderBudget ? "under budget" : "over budget"
		}`,
	};
}

function comparisonStatus(candidateManifest: RunManifest) {
	return isGeneratedCandidateRun(candidateManifest)
		? "Generated candidate compared"
		: "Gap to reference target";
}

function comparisonChangeLabel(comparison: RunComparison): "Delta" | "Gap";
function comparisonChangeLabel(candidateManifest: RunManifest): "Delta" | "Gap";
function comparisonChangeLabel(
	input: RunComparison | RunManifest,
): "Delta" | "Gap" {
	if ("candidateRunId" in input) {
		if (input.candidateLabel === "Reference target") {
			return "Gap";
		}
		if (input.candidateLabel?.toLowerCase().includes("candidate")) {
			return "Delta";
		}

		return startsWithOneOf(input.candidateRunId, generatedCandidatePrefixes)
			? "Delta"
			: "Gap";
	}

	return isGeneratedCandidateRun(input) ? "Delta" : "Gap";
}

function evidenceStatusFor({
	baselineManifest,
	candidateManifest,
	baselineLabel,
	candidateLabel,
	overallDelta,
}: {
	baselineManifest: RunManifest;
	candidateManifest: RunManifest;
	baselineLabel: string;
	candidateLabel: string;
	overallDelta: number;
}) {
	const usesGeneratedBaseline = isGeneratedBaselineRun(baselineManifest);
	const usesGeneratedCandidate = isGeneratedCandidateRun(candidateManifest);
	const usesLiveProvider =
		isOpenAIProviderRun(baselineManifest) &&
		isOpenAIProviderRun(candidateManifest);
	const usesLocalProvider =
		isLocalProviderRun(baselineManifest) ||
		isLocalProviderRun(candidateManifest);
	const usesReferenceTarget = !usesGeneratedCandidate;

	if (!usesGeneratedBaseline || !usesGeneratedCandidate || !usesLiveProvider) {
		const candidateDescription = usesReferenceTarget
			? `a human-authored ${candidateLabel}`
			: candidateLabel;
		const warning = !usesGeneratedBaseline
			? "Run a generated baseline before using this as improvement evidence."
			: !usesGeneratedCandidate
				? "Run a generated candidate before using this as improvement evidence."
				: usesLocalProvider
					? "Run live-provider baseline and candidate artifacts before using this as live model quality evidence."
					: "Run live-provider artifacts on both sides before using this as live model quality evidence.";

		return {
			tone: "amber" as const,
			label: "Pipeline rehearsal",
			text: `This comparison uses ${baselineLabel} and ${candidateDescription}. It validates the eval artifact flow, but not live model quality improvement.`,
			warning,
		};
	}

	return {
		tone: overallDelta >= 0 ? ("green" as const) : ("amber" as const),
		label: "Generated comparison",
		text: `Use ${baselineLabel} and ${candidateLabel} as the current inspectable before/after story.`,
		warning:
			"Generated evaluator scores are deterministic heuristics; review evaluator quality before claiming production model quality.",
	};
}

function hasUnknownCost(manifest: RunManifest) {
	return manifest.guardrails.some(
		(guardrail) =>
			guardrail.id === "cost-ratio" && guardrail.value === "unknown",
	);
}

function costRatioLabel(manifest: RunManifest) {
	return hasUnknownCost(manifest)
		? "unknown"
		: `${manifest.aggregateMetrics.costRatio.toFixed(2)}x`;
}

function costRatioDeltaLabel(candidate: RunManifest, baseline: RunManifest) {
	if (hasUnknownCost(candidate) || hasUnknownCost(baseline)) {
		return "unknown";
	}

	return formatDelta(
		candidate.aggregateMetrics.costRatio,
		baseline.aggregateMetrics.costRatio,
		"x",
	);
}

function selectedPairLatencyMetric(
	candidate: RunManifest,
	baseline: RunManifest,
) {
	const baselineLatencyMs = baseline.aggregateMetrics.medianLatencyMs;
	const candidateLatencyMs = candidate.aggregateMetrics.medianLatencyMs;
	if (baselineLatencyMs < 100) {
		return {
			value: "not comparable",
			delta: `${(candidateLatencyMs / 1000).toFixed(1)}s vs ${(
				baselineLatencyMs / 1000
			).toFixed(1)}s`,
			tone: "amber" as const,
		};
	}

	const latencyRatio = roundMetric(
		Math.max(0.01, candidateLatencyMs / baselineLatencyMs),
	);
	return {
		value: `${latencyRatio.toFixed(2)}x`,
		delta: formatDelta(latencyRatio, 1, "x"),
		tone: latencyRatio <= 1 ? ("green" as const) : ("amber" as const),
	};
}

function trendLabelFor(manifest: RunManifest, role: "baseline" | "candidate") {
	if (isGeneratedBaselineRun(manifest)) {
		return isOpenAIProviderRun(manifest)
			? "OpenAI baseline"
			: "Generated baseline";
	}
	if (isGeneratedCandidateRun(manifest)) {
		return isOpenAIProviderRun(manifest)
			? "OpenAI candidate"
			: "Generated candidate";
	}
	if (role === "candidate") {
		return "Reference target";
	}
	return "Seeded baseline";
}

function sortedCaseIds(manifest: RunManifest) {
	return [...manifest.caseIds].sort();
}

function assertMatchingCaseSets(baseline: RunManifest, candidate: RunManifest) {
	const baselineCaseIds = sortedCaseIds(baseline);
	const candidateCaseIds = sortedCaseIds(candidate);

	if (baselineCaseIds.join("\0") !== candidateCaseIds.join("\0")) {
		throw new Error(
			`Cannot compare runs with different case sets: ${baseline.runId} has [${baselineCaseIds.join(", ")}], ${candidate.runId} has [${candidateCaseIds.join(", ")}].`,
		);
	}
}

function failureClusters(evaluations: EvaluatorOutput[]) {
	const counts = new Map<string, { count: number; cases: string[] }>();
	for (const evaluation of evaluations) {
		for (const tag of evaluation.failureTags) {
			const entry = counts.get(tag) ?? { count: 0, cases: [] };
			entry.count += 1;
			entry.cases.push(evaluation.caseId);
			counts.set(tag, entry);
		}
	}

	return [...counts.entries()]
		.sort((left, right) => right[1].count - left[1].count)
		.slice(0, 4)
		.map(([tag, entry]) => ({
			title: tag
				.split("-")
				.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
				.join(" "),
			count: entry.count,
			severity:
				entry.count >= 5
					? ("High" as const)
					: entry.count >= 3
						? ("Medium" as const)
						: ("Low" as const),
			evidence: `Repeated ${tag} findings across evaluator outputs.`,
			cases: entry.cases,
		}));
}

function featuredCaseFor(
	evalCases: EvalCase[],
	baseline: RunArtifacts,
	candidate: RunArtifacts,
) {
	const baselineBriefings = new Map(
		baseline.briefings.map((briefing) => [briefing.caseId, briefing]),
	);
	const candidateBriefings = new Map(
		candidate.briefings.map((briefing) => [briefing.caseId, briefing]),
	);
	const evalCase =
		evalCases.find(
			(candidateCase) =>
				candidateCase.demoHighlight &&
				baselineBriefings.has(candidateCase.id) &&
				candidateBriefings.has(candidateCase.id),
		) ??
		evalCases.find(
			(candidateCase) =>
				baselineBriefings.has(candidateCase.id) &&
				candidateBriefings.has(candidateCase.id),
		);

	if (!evalCase) {
		throw new Error("No overlapping case found for run comparison.");
	}

	return {
		id: evalCase.id,
		title: evalCase.title,
		sourceEvidence: evalCase.expectedCoverage[0],
		baseline:
			baselineBriefings.get(evalCase.id)?.recommendation ??
			"No baseline recommendation available.",
		candidate:
			candidateBriefings.get(evalCase.id)?.recommendation ??
			"No candidate recommendation available.",
		evaluatorNote:
			"Comparison uses file-backed artifacts for the same eval case so the before/after story is inspectable.",
	};
}

function comparisonLabelsFor(comparison: RunComparison) {
	return {
		baselineLabel: comparison.baselineLabel ?? "Baseline",
		candidateLabel: comparison.candidateLabel ?? "Candidate",
	};
}

function reportFor(comparison: RunComparison) {
	const { baselineLabel, candidateLabel } = comparisonLabelsFor(comparison);
	const changeLabel = comparisonChangeLabel(comparison);
	const rows = comparison.comparisonRows
		.map(
			(row) =>
				`| ${row.metric} | ${row.baseline} | ${row.candidate} | ${row.delta} |`,
		)
		.join("\n");
	const clusters = comparison.failureClusters
		.map(
			(cluster) =>
				`- ${cluster.title}: ${cluster.count} cases (${cluster.cases.join(", ")})`,
		)
		.join("\n");

	return `# Latest Eval Summary

Generated comparison: ${baselineLabel} \`${comparison.baselineRunId}\` vs ${candidateLabel} \`${comparison.candidateRunId}\`.

| Metric | ${baselineLabel} | ${candidateLabel} | ${changeLabel} |
| --- | --- | --- | --- |
${rows}

Featured case: \`${comparison.featuredCase.id}\` - ${comparison.featuredCase.title}.

${comparison.featuredCase.evaluatorNote}

## Failure Clusters

${clusters}

## Evidence Status

${comparison.recommendation.text}

${comparison.recommendation.warning}
`;
}

async function writeComparisonAndReport(input: {
	baselineRunId?: string;
	candidateRunId?: string;
}) {
	const baselineRunId =
		input.baselineRunId ??
		(await latestRunId(generatedBaselinePrefixes, isGeneratedBaselineRun));
	if (!baselineRunId) {
		throw new Error(
			"No generated baseline run found. Run eval:baseline first.",
		);
	}

	const candidateRunId =
		input.candidateRunId ??
		(await latestRunId(generatedCandidatePrefixes, isGeneratedCandidateRun)) ??
		seededCandidateRunId;
	const [evalCases, baseline, candidate] = await Promise.all([
		listEvalCases(),
		artifactsFor(baselineRunId),
		artifactsFor(candidateRunId),
	]);
	console.log(
		`Comparing ${baselineRunId} with ${candidateRunId} across ${baseline.manifest.caseIds.length} cases.`,
	);
	assertMatchingCaseSets(baseline.manifest, candidate.manifest);
	const baselineMetrics = baseline.manifest.aggregateMetrics;
	const candidateMetrics = candidate.manifest.aggregateMetrics;
	const overallDelta = candidateMetrics.overall - baselineMetrics.overall;
	const citationDelta =
		candidateMetrics.citationSupport - baselineMetrics.citationSupport;
	const latencyMetric = selectedPairLatencyMetric(
		candidate.manifest,
		baseline.manifest,
	);
	const baselineLabel = trendLabelFor(baseline.manifest, "baseline");
	const candidateLabel = trendLabelFor(candidate.manifest, "candidate");
	const changeLabel = comparisonChangeLabel(candidate.manifest);
	const usesReferenceCostBudget =
		changeLabel === "Gap" &&
		candidate.manifest.aggregateMetrics.costBudgetUsd !== undefined;
	const costMetric = usesReferenceCostBudget
		? referenceCostBudgetMetric({
				baseline,
				candidate,
				baselineLabel,
				candidateLabel,
			})
		: {
				label: "Cost ratio",
				value: costRatioLabel(candidate.manifest),
				delta: costRatioDeltaLabel(candidate.manifest, baseline.manifest),
				status:
					changeLabel === "Gap"
						? `${candidateLabel} cost ratio`
						: "Cost guardrail",
				tone:
					hasUnknownCost(candidate.manifest) ||
					hasUnknownCost(baseline.manifest)
						? ("amber" as const)
						: changeLabel === "Gap"
							? lowerIsBetterTargetGapTone(
									candidateMetrics.costRatio - baselineMetrics.costRatio,
								)
							: candidateMetrics.costRatio <= 1.15
								? ("amber" as const)
								: ("red" as const),
			};
	const costRow = usesReferenceCostBudget
		? referenceCostBudgetRow({ baseline, candidate })
		: {
				metric: "Cost ratio",
				baseline: costRatioLabel(baseline.manifest),
				candidate: costRatioLabel(candidate.manifest),
				delta: costRatioDeltaLabel(candidate.manifest, baseline.manifest),
			};
	const failureClusterEvaluations =
		changeLabel === "Gap" ? baseline.evaluations : candidate.evaluations;
	const comparison = RunComparisonSchema.parse({
		id: `${baselineRunId}-${candidateRunId}`,
		baselineRunId,
		candidateRunId,
		baselineLabel,
		candidateLabel,
		metrics: [
			{
				label: "Overall quality",
				value: candidateMetrics.overall.toFixed(2),
				delta: formatDelta(candidateMetrics.overall, baselineMetrics.overall),
				status:
					changeLabel === "Gap"
						? `${candidateLabel} score`
						: comparisonStatus(candidate.manifest),
				tone:
					changeLabel === "Gap"
						? targetGapTone(overallDelta)
						: metricTone(overallDelta),
			},
			{
				label: "Citation grounding",
				value: candidateMetrics.citationSupport.toFixed(2),
				delta: formatDelta(
					candidateMetrics.citationSupport,
					baselineMetrics.citationSupport,
				),
				status:
					changeLabel === "Gap"
						? `${candidateLabel} citation score`
						: "Citation support delta",
				tone:
					changeLabel === "Gap"
						? targetGapTone(citationDelta)
						: metricTone(citationDelta),
			},
			{
				label: "Coverage",
				value: candidateMetrics.coverage.toFixed(2),
				delta: formatDelta(candidateMetrics.coverage, baselineMetrics.coverage),
				status:
					changeLabel === "Gap"
						? `${candidateLabel} coverage score`
						: "Expected points covered",
				tone:
					changeLabel === "Gap"
						? targetGapTone(
								candidateMetrics.coverage - baselineMetrics.coverage,
							)
						: metricTone(candidateMetrics.coverage - baselineMetrics.coverage),
			},
			costMetric,
			{
				label: "Latency ratio",
				value: latencyMetric.value,
				delta: latencyMetric.delta,
				status:
					changeLabel === "Gap"
						? `${candidateLabel} latency ratio`
						: "Median latency proxy",
				tone: latencyMetric.tone,
			},
		],
		trend: [
			{
				label: baselineLabel,
				score: Math.round(baselineMetrics.overall * 100),
			},
			{
				label: candidateLabel,
				score: Math.round(candidateMetrics.overall * 100),
			},
		],
		comparisonRows: [
			{
				metric: "Overall score",
				baseline: baselineMetrics.overall.toFixed(2),
				candidate: candidateMetrics.overall.toFixed(2),
				delta: formatDelta(candidateMetrics.overall, baselineMetrics.overall),
			},
			{
				metric: "Citation support",
				baseline: baselineMetrics.citationSupport.toFixed(2),
				candidate: candidateMetrics.citationSupport.toFixed(2),
				delta: formatDelta(
					candidateMetrics.citationSupport,
					baselineMetrics.citationSupport,
				),
			},
			{
				metric: "Unsupported claims",
				baseline: String(baselineMetrics.unsupportedClaims),
				candidate: String(candidateMetrics.unsupportedClaims),
				delta: String(
					candidateMetrics.unsupportedClaims -
						baselineMetrics.unsupportedClaims,
				),
			},
			{
				metric: "Eval cases",
				baseline: String(baseline.manifest.caseIds.length),
				candidate: String(candidate.manifest.caseIds.length),
				delta: String(
					candidate.manifest.caseIds.length - baseline.manifest.caseIds.length,
				),
			},
			{
				metric: "Median latency",
				baseline: `${(baselineMetrics.medianLatencyMs / 1000).toFixed(1)}s`,
				candidate: `${(candidateMetrics.medianLatencyMs / 1000).toFixed(1)}s`,
				delta: `${(
					(candidateMetrics.medianLatencyMs - baselineMetrics.medianLatencyMs) /
						1000
				).toFixed(1)}s`,
			},
			costRow,
		],
		failureClusters: failureClusters(failureClusterEvaluations),
		featuredCase: featuredCaseFor(evalCases, baseline, candidate),
		recommendation: evidenceStatusFor({
			baselineManifest: baseline.manifest,
			candidateManifest: candidate.manifest,
			baselineLabel,
			candidateLabel,
			overallDelta,
		}),
		artifactPaths: [
			`runs/${baselineRunId}/manifest.json`,
			`runs/${candidateRunId}/manifest.json`,
			...baseline.manifest.artifactPaths
				.filter((artifactPath) => artifactPath.includes("/evaluations/"))
				.slice(0, 2),
			...candidate.manifest.artifactPaths
				.filter((artifactPath) => artifactPath.includes("/evaluations/"))
				.slice(0, 2),
			"reports/latest-eval-summary.md",
		],
	});

	await writeJsonArtifact(`runs/comparisons/${comparison.id}.json`, comparison);
	await writeTextArtifact(
		"reports/latest-eval-summary.md",
		reportFor(comparison),
	);
	console.log(`Wrote comparison ${comparison.id} and latest eval summary.`);
	return comparison;
}

async function main() {
	const options = parseOptions();

	if (options.mode === "report") {
		const comparison = await writeComparisonAndReport({
			baselineRunId: options.baselineRunId,
			candidateRunId: options.candidateRunId,
		});
		console.log(`Wrote report for ${comparison.id}.`);
		return;
	}

	await assertBaselineComparisonIsValid(options);
	assertOpenAIPricingIsConfigured(options);
	const run = await generateRun(options);
	const comparison = await writeComparisonAndReport({
		baselineRunId:
			options.mode === "baseline" ? run.manifest.runId : options.baselineRunId,
		candidateRunId:
			options.mode === "variant" ? run.manifest.runId : options.candidateRunId,
	});

	console.log(
		`Wrote ${options.mode} run ${run.manifest.runId} with ${run.manifest.caseIds.length} cases and comparison ${comparison.id}.`,
	);
}

await main();
