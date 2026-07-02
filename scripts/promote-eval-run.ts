import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	listBriefingOutputs,
	listEvalCases,
	listEvaluatorOutputs,
	listGenerationTraces,
	listRunManifests,
} from "~/run-store";
import {
	type BriefingOutput,
	type EvaluatorOutput,
	type GenerationTrace,
	type RunComparison,
	RunComparisonSchema,
	type RunManifest,
	type RunModelMetadata,
} from "~/schemas";

interface PromoteOptions {
	baselineRunId: string;
	candidateRunId: string;
	candidateLabel?: string;
	baselineLabel?: string;
	sourceMatrixId?: string;
	featuredCaseId?: string;
}

type MetricTone = "green" | "blue" | "amber" | "red";

const repoRoot = process.cwd();
const fixtureIdPattern = /^[a-z0-9][a-z0-9-]*$/;
const referenceTargetRunId = "candidate-citation-gates";

function optionValue(name: string) {
	const prefix = `${name}=`;
	const match = process.argv.find((argument) => argument.startsWith(prefix));
	return match?.slice(prefix.length);
}

function validateFixtureId(value: string, label: string) {
	if (!fixtureIdPattern.test(value)) {
		throw new Error(
			`Invalid ${label} "${value}". Use lowercase letters, numbers, and hyphens only.`,
		);
	}

	return value;
}

function parseOptions(): PromoteOptions {
	if (process.argv.includes("--help")) {
		console.log(
			[
				"Usage: bun run eval:promote --baseline=<run-id> --candidate-run=<run-id> [--label=<candidate label>] [--baseline-label=<baseline label>] [--source-matrix=<matrix-id>] [--featured-case=<case-id>]",
				"",
				"Promotes a completed candidate run into a canonical RunComparison artifact for /lab.",
			].join("\n"),
		);
		process.exit(0);
	}

	const baselineRunId = optionValue("--baseline");
	const candidateRunId = optionValue("--candidate-run");
	if (!baselineRunId || !candidateRunId) {
		throw new Error("--baseline and --candidate-run are required.");
	}

	return {
		baselineRunId: validateFixtureId(baselineRunId, "baseline run id"),
		candidateRunId: validateFixtureId(candidateRunId, "candidate run id"),
		candidateLabel: optionValue("--label"),
		baselineLabel: optionValue("--baseline-label"),
		sourceMatrixId: optionValue("--source-matrix")
			? validateFixtureId(
					optionValue("--source-matrix") ?? "",
					"source matrix id",
				)
			: undefined,
		featuredCaseId: optionValue("--featured-case")
			? validateFixtureId(
					optionValue("--featured-case") ?? "",
					"featured case id",
				)
			: undefined,
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

function assertCompletePromotionRun(manifest: RunManifest, label: string) {
	if (manifest.status !== "complete" && manifest.status !== "seeded") {
		throw new Error(
			`Cannot promote ${label} ${manifest.runId}; manifest status is ${manifest.status}.`,
		);
	}
}

function sortedCaseSignature(manifest: RunManifest) {
	return [...manifest.caseIds].sort().join("\0");
}

function assertSameCaseSet(baseline: RunManifest, candidate: RunManifest) {
	if (sortedCaseSignature(baseline) !== sortedCaseSignature(candidate)) {
		throw new Error(
			`Cannot promote ${candidate.runId}; case set does not match baseline ${baseline.runId}. Use a complete visible-case run for the main /lab comparison.`,
		);
	}
}

function totalCostUsd(manifest: RunManifest) {
	const generationCost = manifest.aggregateMetrics.estimatedCostUsd;
	const evaluatorCost = manifest.aggregateMetrics.evaluatorEstimatedCostUsd;
	if (generationCost === null || evaluatorCost === null) {
		return null;
	}

	return (generationCost ?? 0) + (evaluatorCost ?? 0);
}

function roundMetric(value: number) {
	return Math.round(value * 100) / 100;
}

function roundCost(value: number) {
	return Math.round(value * 100_000_000) / 100_000_000;
}

function signedMetricDelta(candidate: number, baseline: number) {
	const delta = roundMetric(candidate - baseline);
	return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
}

function signedIntegerDelta(candidate: number, baseline: number) {
	const delta = candidate - baseline;
	return `${delta >= 0 ? "+" : ""}${delta}`;
}

function signedCostDelta(candidate: number | null, baseline: number | null) {
	if (candidate === null || baseline === null) {
		return "unknown";
	}
	const delta = roundCost(candidate - baseline);
	return `${delta >= 0 ? "+" : ""}${delta}`;
}

function signedSecondsDelta(candidateMs: number, baselineMs: number) {
	const delta = Math.round((candidateMs - baselineMs) / 100) / 10;
	return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}s`;
}

function signedMetricGap(
	candidate: number,
	referenceTarget: number,
	lowerIsBetter = false,
) {
	const delta = lowerIsBetter
		? roundMetric(candidate - referenceTarget)
		: roundMetric(referenceTarget - candidate);
	return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
}

function signedIntegerGap(
	candidate: number,
	referenceTarget: number,
	lowerIsBetter = false,
) {
	const delta = lowerIsBetter
		? candidate - referenceTarget
		: referenceTarget - candidate;
	return `${delta >= 0 ? "+" : ""}${delta}`;
}

function signedCostGap(
	candidate: number | null,
	referenceTarget: number | null,
) {
	if (candidate === null || referenceTarget === null) {
		return "unknown";
	}
	const delta = roundCost(candidate - referenceTarget);
	return `${delta >= 0 ? "+" : ""}${delta}`;
}

function signedSecondsGap(candidateMs: number, referenceTargetMs: number) {
	const delta = Math.round((candidateMs - referenceTargetMs) / 100) / 10;
	return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}s`;
}

function improvementTone(delta: number, lowerIsBetter = false): MetricTone {
	if (delta === 0) {
		return "blue";
	}
	const improved = lowerIsBetter ? delta < 0 : delta > 0;
	return improved ? "green" : "red";
}

function displayCostForComparison(manifest: RunManifest) {
	const cost = totalCostUsd(manifest);
	if (cost !== null) {
		return String(roundCost(cost));
	}
	if (manifest.aggregateMetrics.costBudgetUsd !== undefined) {
		return `<= ${roundCost(manifest.aggregateMetrics.costBudgetUsd)}`;
	}

	return "unknown";
}

function comparisonCostValue(manifest: RunManifest) {
	return (
		totalCostUsd(manifest) ?? manifest.aggregateMetrics.costBudgetUsd ?? null
	);
}

function referenceTargetFor({
	baseline,
	candidate,
	manifestById,
}: {
	baseline: RunManifest;
	candidate: RunManifest;
	manifestById: Map<string, RunManifest>;
}) {
	const referenceTarget = manifestById.get(referenceTargetRunId);
	if (
		!referenceTarget ||
		referenceTarget.runId === candidate.runId ||
		referenceTarget.status !== "complete" ||
		sortedCaseSignature(referenceTarget) !== sortedCaseSignature(baseline) ||
		sortedCaseSignature(referenceTarget) !== sortedCaseSignature(candidate)
	) {
		return undefined;
	}

	return referenceTarget;
}

function metricRows({
	baseline,
	candidate,
	referenceTarget,
}: {
	baseline: RunManifest;
	candidate: RunManifest;
	referenceTarget?: RunManifest;
}): RunComparison["comparisonRows"] {
	const baselineCost = totalCostUsd(baseline);
	const candidateCost = totalCostUsd(candidate);
	const referenceTargetCost = referenceTarget
		? comparisonCostValue(referenceTarget)
		: null;
	const candidateRisk =
		candidate.aggregateMetrics.groundingRiskUnits ??
		candidate.aggregateMetrics.unsupportedClaims;
	const baselineRisk =
		baseline.aggregateMetrics.groundingRiskUnits ??
		baseline.aggregateMetrics.unsupportedClaims;
	const referenceTargetRisk = referenceTarget
		? (referenceTarget.aggregateMetrics.groundingRiskUnits ??
			referenceTarget.aggregateMetrics.unsupportedClaims)
		: null;

	return [
		{
			metric: "Overall score",
			baseline: baseline.aggregateMetrics.overall.toFixed(2),
			candidate: candidate.aggregateMetrics.overall.toFixed(2),
			delta: signedMetricDelta(
				candidate.aggregateMetrics.overall,
				baseline.aggregateMetrics.overall,
			),
			referenceTarget: referenceTarget
				? referenceTarget.aggregateMetrics.overall.toFixed(2)
				: undefined,
			gapToTarget: referenceTarget
				? signedMetricGap(
						candidate.aggregateMetrics.overall,
						referenceTarget.aggregateMetrics.overall,
					)
				: undefined,
		},
		{
			metric: "Citation support",
			baseline: baseline.aggregateMetrics.citationSupport.toFixed(2),
			candidate: candidate.aggregateMetrics.citationSupport.toFixed(2),
			delta: signedMetricDelta(
				candidate.aggregateMetrics.citationSupport,
				baseline.aggregateMetrics.citationSupport,
			),
			referenceTarget: referenceTarget
				? referenceTarget.aggregateMetrics.citationSupport.toFixed(2)
				: undefined,
			gapToTarget: referenceTarget
				? signedMetricGap(
						candidate.aggregateMetrics.citationSupport,
						referenceTarget.aggregateMetrics.citationSupport,
					)
				: undefined,
		},
		{
			metric: "Coverage",
			baseline: baseline.aggregateMetrics.coverage.toFixed(2),
			candidate: candidate.aggregateMetrics.coverage.toFixed(2),
			delta: signedMetricDelta(
				candidate.aggregateMetrics.coverage,
				baseline.aggregateMetrics.coverage,
			),
			referenceTarget: referenceTarget
				? referenceTarget.aggregateMetrics.coverage.toFixed(2)
				: undefined,
			gapToTarget: referenceTarget
				? signedMetricGap(
						candidate.aggregateMetrics.coverage,
						referenceTarget.aggregateMetrics.coverage,
					)
				: undefined,
		},
		{
			metric: "Grounding risk units",
			baseline: String(baselineRisk),
			candidate: String(candidateRisk),
			delta: signedIntegerDelta(candidateRisk, baselineRisk),
			referenceTarget:
				referenceTargetRisk === null ? undefined : String(referenceTargetRisk),
			gapToTarget:
				referenceTargetRisk === null
					? undefined
					: signedIntegerGap(candidateRisk, referenceTargetRisk, true),
		},
		{
			metric: "Eval cases",
			baseline: String(baseline.caseIds.length),
			candidate: String(candidate.caseIds.length),
			delta: signedIntegerDelta(
				candidate.caseIds.length,
				baseline.caseIds.length,
			),
			referenceTarget: referenceTarget
				? String(referenceTarget.caseIds.length)
				: undefined,
			gapToTarget: referenceTarget
				? signedIntegerGap(
						candidate.caseIds.length,
						referenceTarget.caseIds.length,
					)
				: undefined,
		},
		{
			metric: "Median latency",
			baseline: `${(baseline.aggregateMetrics.medianLatencyMs / 1000).toFixed(1)}s`,
			candidate: `${(candidate.aggregateMetrics.medianLatencyMs / 1000).toFixed(1)}s`,
			delta: signedSecondsDelta(
				candidate.aggregateMetrics.medianLatencyMs,
				baseline.aggregateMetrics.medianLatencyMs,
			),
			referenceTarget: referenceTarget
				? `${(referenceTarget.aggregateMetrics.medianLatencyMs / 1000).toFixed(1)}s`
				: undefined,
			gapToTarget: referenceTarget
				? signedSecondsGap(
						candidate.aggregateMetrics.medianLatencyMs,
						referenceTarget.aggregateMetrics.medianLatencyMs,
					)
				: undefined,
		},
		{
			metric: "Estimated cost",
			baseline: displayCostForComparison(baseline),
			candidate: displayCostForComparison(candidate),
			delta: signedCostDelta(candidateCost, baselineCost),
			referenceTarget: referenceTarget
				? displayCostForComparison(referenceTarget)
				: undefined,
			gapToTarget: referenceTarget
				? signedCostGap(candidateCost, referenceTargetCost)
				: undefined,
		},
	];
}

function topMetrics({
	baseline,
	candidate,
	referenceTarget,
}: {
	baseline: RunManifest;
	candidate: RunManifest;
	referenceTarget?: RunManifest;
}): RunComparison["metrics"] {
	const baselineCost = totalCostUsd(baseline);
	const candidateCost = totalCostUsd(candidate);
	const referenceTargetCost = referenceTarget
		? comparisonCostValue(referenceTarget)
		: null;
	const costDelta =
		candidateCost === null || baselineCost === null
			? null
			: roundCost(candidateCost - baselineCost);

	return [
		{
			label: "Overall quality",
			value: candidate.aggregateMetrics.overall.toFixed(2),
			delta: signedMetricDelta(
				candidate.aggregateMetrics.overall,
				baseline.aggregateMetrics.overall,
			),
			targetDelta: referenceTarget
				? signedMetricGap(
						candidate.aggregateMetrics.overall,
						referenceTarget.aggregateMetrics.overall,
					)
				: undefined,
			status: "Promoted candidate score",
			tone: improvementTone(
				candidate.aggregateMetrics.overall - baseline.aggregateMetrics.overall,
			),
		},
		{
			label: "Citation grounding",
			value: candidate.aggregateMetrics.citationSupport.toFixed(2),
			delta: signedMetricDelta(
				candidate.aggregateMetrics.citationSupport,
				baseline.aggregateMetrics.citationSupport,
			),
			targetDelta: referenceTarget
				? signedMetricGap(
						candidate.aggregateMetrics.citationSupport,
						referenceTarget.aggregateMetrics.citationSupport,
					)
				: undefined,
			status: "Promoted candidate citation score",
			tone: improvementTone(
				candidate.aggregateMetrics.citationSupport -
					baseline.aggregateMetrics.citationSupport,
			),
		},
		{
			label: "Coverage",
			value: candidate.aggregateMetrics.coverage.toFixed(2),
			delta: signedMetricDelta(
				candidate.aggregateMetrics.coverage,
				baseline.aggregateMetrics.coverage,
			),
			targetDelta: referenceTarget
				? signedMetricGap(
						candidate.aggregateMetrics.coverage,
						referenceTarget.aggregateMetrics.coverage,
					)
				: undefined,
			status: "Promoted candidate coverage score",
			tone: improvementTone(
				candidate.aggregateMetrics.coverage -
					baseline.aggregateMetrics.coverage,
			),
		},
		{
			label: "Estimated cost",
			value:
				candidateCost === null ? "unknown" : String(roundCost(candidateCost)),
			delta:
				costDelta === null
					? "unknown"
					: `${costDelta >= 0 ? "+" : ""}${costDelta}`,
			targetDelta: referenceTarget
				? signedCostGap(candidateCost, referenceTargetCost)
				: undefined,
			status: "Promoted candidate total generation + evaluator cost",
			tone: costDelta === null ? "amber" : improvementTone(costDelta, true),
		},
		{
			label: "Median latency",
			value: `${(candidate.aggregateMetrics.medianLatencyMs / 1000).toFixed(1)}s`,
			delta: signedSecondsDelta(
				candidate.aggregateMetrics.medianLatencyMs,
				baseline.aggregateMetrics.medianLatencyMs,
			),
			targetDelta: referenceTarget
				? signedSecondsGap(
						candidate.aggregateMetrics.medianLatencyMs,
						referenceTarget.aggregateMetrics.medianLatencyMs,
					)
				: undefined,
			status: "Promoted candidate median latency",
			tone: improvementTone(
				candidate.aggregateMetrics.medianLatencyMs -
					baseline.aggregateMetrics.medianLatencyMs,
				true,
			),
		},
	];
}

function titleForFailureTag(tag: string) {
	return tag
		.split("-")
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

function failureClusters(
	evaluations: EvaluatorOutput[],
): RunComparison["failureClusters"] {
	const clusters = new Map<string, { cases: Set<string> }>();
	for (const evaluation of evaluations) {
		for (const tag of evaluation.failureTags) {
			const cluster = clusters.get(tag) ?? { cases: new Set<string>() };
			cluster.cases.add(evaluation.caseId);
			clusters.set(tag, cluster);
		}
	}

	return [...clusters.entries()]
		.map(([tag, cluster]) => {
			const cases = [...cluster.cases].sort();
			const count = cases.length;
			return {
				title: titleForFailureTag(tag),
				count,
				severity: count >= 3 ? "High" : count >= 2 ? "Medium" : "Low",
				evidence: `Repeated ${tag} findings across promoted candidate evaluator outputs.`,
				cases,
			} satisfies RunComparison["failureClusters"][number];
		})
		.sort(
			(left, right) =>
				right.count - left.count || left.title.localeCompare(right.title),
		);
}

function failureThemeCounts(evaluations: EvaluatorOutput[]) {
	const counts = new Map<string, Set<string>>();
	for (const evaluation of evaluations) {
		for (const tag of evaluation.failureTags) {
			const cases = counts.get(tag) ?? new Set<string>();
			cases.add(evaluation.caseId);
			counts.set(tag, cases);
		}
	}
	return counts;
}

function failureThemeMovements({
	baselineEvaluations,
	candidateEvaluations,
}: {
	baselineEvaluations: EvaluatorOutput[];
	candidateEvaluations: EvaluatorOutput[];
}): NonNullable<RunComparison["failureThemeMovements"]> {
	const baselineCounts = failureThemeCounts(baselineEvaluations);
	const candidateCounts = failureThemeCounts(candidateEvaluations);
	const tags = new Set([...baselineCounts.keys(), ...candidateCounts.keys()]);

	return [...tags]
		.map((tag) => {
			const baselineCases = [...(baselineCounts.get(tag) ?? [])].sort();
			const candidateCases = [...(candidateCounts.get(tag) ?? [])].sort();
			const baselineCount = baselineCases.length;
			const candidateCount = candidateCases.length;
			const delta = candidateCount - baselineCount;
			const status =
				baselineCount === 0 && candidateCount > 0
					? "new"
					: baselineCount > 0 && candidateCount === 0
						? "resolved"
						: candidateCount < baselineCount
							? "reduced"
							: candidateCount > baselineCount
								? "increased"
								: "unchanged";

			return {
				title: titleForFailureTag(tag),
				baselineCount,
				candidateCount,
				delta,
				status,
				baselineCases,
				candidateCases,
			} satisfies NonNullable<RunComparison["failureThemeMovements"]>[number];
		})
		.sort((left, right) => {
			const volumeDelta =
				Math.max(right.baselineCount, right.candidateCount) -
				Math.max(left.baselineCount, left.candidateCount);
			return volumeDelta || left.title.localeCompare(right.title);
		});
}

function indexByCaseId<T extends { caseId: string }>(items: T[]) {
	return new Map(items.map((item) => [item.caseId, item]));
}

function featuredCaseFor({
	featuredCaseId,
	baselineBriefings,
	candidateBriefings,
	candidateEvaluations,
}: {
	featuredCaseId?: string;
	baselineBriefings: BriefingOutput[];
	candidateBriefings: BriefingOutput[];
	candidateEvaluations: EvaluatorOutput[];
}): string {
	if (featuredCaseId) {
		return featuredCaseId;
	}

	const candidateFailures = candidateEvaluations.find(
		(evaluation) => evaluation.failureTags.length > 0,
	);
	if (candidateFailures) {
		return candidateFailures.caseId;
	}

	const candidateByCaseId = indexByCaseId(candidateBriefings);
	return (
		baselineBriefings.find((briefing) => candidateByCaseId.has(briefing.caseId))
			?.caseId ??
		candidateBriefings[0]?.caseId ??
		"case-adoption-friction"
	);
}

function artifactPathsFor({
	comparisonPath,
	baselineRunId,
	candidateRunId,
	referenceTargetRunId: referenceTargetRunIdForComparison,
	caseIds,
	sourceMatrixId,
}: {
	comparisonPath: string;
	baselineRunId: string;
	candidateRunId: string;
	referenceTargetRunId?: string;
	caseIds: string[];
	sourceMatrixId?: string;
}) {
	return [
		comparisonPath,
		`runs/${baselineRunId}/manifest.json`,
		`runs/${candidateRunId}/manifest.json`,
		...(referenceTargetRunIdForComparison
			? [`runs/${referenceTargetRunIdForComparison}/manifest.json`]
			: []),
		...(sourceMatrixId
			? [`runs/comparisons/matrices/${sourceMatrixId}.json`]
			: []),
		...caseIds.flatMap((caseId) => [
			`runs/${baselineRunId}/evaluations/${caseId}.json`,
			`runs/${candidateRunId}/evaluations/${caseId}.json`,
			`runs/${candidateRunId}/briefings/${caseId}.json`,
		]),
	];
}

function recommendationFor(
	candidate: RunManifest,
): RunComparison["recommendation"] {
	const failedGuardrails = candidate.guardrails.filter(
		(guardrail) => guardrail.status === "fail",
	);
	if (failedGuardrails.length > 0) {
		return {
			tone: "amber",
			label: "Promoted for review",
			text: "This promoted candidate has complete artifacts but failed one or more guardrails. Use the lab comparison for review before shipping.",
			warning: failedGuardrails
				.map((guardrail) => `${guardrail.label}: ${guardrail.value}`)
				.join("; "),
		};
	}

	return {
		tone: "green",
		label: "Promoted candidate",
		text: "This candidate was promoted from loop-engineering evidence into the canonical lab comparison path.",
		warning:
			"Promotion creates display evidence for /lab; human verifier review is still required before a ship call.",
	};
}

async function main() {
	const options = parseOptions();
	const [
		manifests,
		evalCases,
		baselineEvaluations,
		candidateEvaluations,
		baselineBriefings,
		candidateBriefings,
		baselineTraces,
		candidateTraces,
	] = await Promise.all([
		listRunManifests(),
		listEvalCases(),
		listEvaluatorOutputs(options.baselineRunId),
		listEvaluatorOutputs(options.candidateRunId),
		listBriefingOutputs(options.baselineRunId),
		listBriefingOutputs(options.candidateRunId),
		listGenerationTraces(options.baselineRunId),
		listGenerationTraces(options.candidateRunId),
	]);
	const manifestById = new Map(
		manifests.map((manifest) => [manifest.runId, manifest]),
	);
	const baseline = manifestById.get(options.baselineRunId);
	const candidate = manifestById.get(options.candidateRunId);
	if (!baseline) {
		throw new Error(`No baseline manifest found for ${options.baselineRunId}.`);
	}
	if (!candidate) {
		throw new Error(
			`No candidate manifest found for ${options.candidateRunId}.`,
		);
	}

	assertCompletePromotionRun(baseline, "baseline");
	assertCompletePromotionRun(candidate, "candidate");
	assertSameCaseSet(baseline, candidate);
	const referenceTarget = referenceTargetFor({
		baseline,
		candidate,
		manifestById,
	});

	const evalCaseById = new Map(
		evalCases.map((evalCase) => [evalCase.id, evalCase]),
	);
	const baselineBriefingByCaseId = indexByCaseId(baselineBriefings);
	const candidateBriefingByCaseId = indexByCaseId(candidateBriefings);
	const candidateEvaluationByCaseId = indexByCaseId(candidateEvaluations);
	const featuredCaseId = featuredCaseFor({
		featuredCaseId: options.featuredCaseId,
		baselineBriefings,
		candidateBriefings,
		candidateEvaluations,
	});
	const featuredEvalCase = evalCaseById.get(featuredCaseId);
	const featuredBaselineBriefing = baselineBriefingByCaseId.get(featuredCaseId);
	const featuredCandidateBriefing =
		candidateBriefingByCaseId.get(featuredCaseId);
	const featuredCandidateEvaluation =
		candidateEvaluationByCaseId.get(featuredCaseId);
	const comparisonId = `${baseline.runId}-${candidate.runId}`;
	const comparisonPath = `runs/comparisons/${comparisonId}.json`;
	const baselineLabel =
		options.baselineLabel ??
		(baseline.runId.startsWith("baseline-openai-")
			? "OpenAI baseline"
			: baseline.variantLabel);
	const candidateLabel = options.candidateLabel ?? candidate.variantLabel;
	const candidateRisk =
		candidate.aggregateMetrics.groundingRiskUnits ??
		candidate.aggregateMetrics.unsupportedClaims;
	const baselineRisk =
		baseline.aggregateMetrics.groundingRiskUnits ??
		baseline.aggregateMetrics.unsupportedClaims;
	const comparison = RunComparisonSchema.parse({
		id: comparisonId,
		baselineRunId: baseline.runId,
		candidateRunId: candidate.runId,
		promotedAt: new Date().toISOString(),
		baselineLabel,
		candidateLabel,
		runMetadata: {
			baseline: runModelMetadata(baselineTraces),
			candidate: runModelMetadata(candidateTraces),
		},
		metrics: topMetrics({ baseline, candidate, referenceTarget }),
		trend: [
			{
				label: baselineLabel,
				score: Math.round(baseline.aggregateMetrics.overall * 100),
			},
			{
				label: candidateLabel,
				score: Math.round(candidate.aggregateMetrics.overall * 100),
			},
		],
		comparisonRows: metricRows({ baseline, candidate, referenceTarget }),
		failureClusters: failureClusters(candidateEvaluations),
		failureThemeMovements: failureThemeMovements({
			baselineEvaluations,
			candidateEvaluations,
		}),
		featuredCase: {
			id: featuredCaseId,
			title: featuredEvalCase?.title ?? featuredCaseId,
			sourceEvidence:
				featuredEvalCase?.expectedCoverage[0] ??
				"Promoted comparison featured case.",
			baseline:
				featuredBaselineBriefing?.recommendation ??
				"No baseline recommendation available.",
			candidate:
				featuredCandidateBriefing?.recommendation ??
				"No candidate recommendation available.",
			evaluatorNote:
				featuredCandidateEvaluation?.notes ??
				"Promoted comparison uses file-backed artifacts.",
		},
		recommendation: recommendationFor(candidate),
		artifactPaths: artifactPathsFor({
			comparisonPath,
			baselineRunId: baseline.runId,
			candidateRunId: candidate.runId,
			referenceTargetRunId: referenceTarget?.runId,
			caseIds: candidate.caseIds,
			sourceMatrixId: options.sourceMatrixId,
		}),
	});

	await writeJsonArtifact(comparisonPath, comparison);
	console.log(`Promoted ${candidate.runId} against ${baseline.runId}.`);
	console.log(`Wrote ${comparisonPath}.`);
	console.log(
		`Overall ${baseline.aggregateMetrics.overall.toFixed(2)} -> ${candidate.aggregateMetrics.overall.toFixed(2)}; citation ${baseline.aggregateMetrics.citationSupport.toFixed(2)} -> ${candidate.aggregateMetrics.citationSupport.toFixed(2)}; risk ${baselineRisk} -> ${candidateRisk}.`,
	);
}

function runModelMetadata(traces: GenerationTrace[]): RunModelMetadata | null {
	const trace = [...traces].sort((left, right) =>
		left.caseId.localeCompare(right.caseId),
	)[0];
	if (!trace) {
		return null;
	}

	return {
		provider: trace.model.provider,
		model: trace.model.name,
		promptVersion: trace.model.settings.promptVersion,
		maxOutputTokens: trace.model.settings.maxOutputTokens,
		structuredOutputName: trace.model.settings.structuredOutputName,
		textVerbosity: trace.model.settings.textVerbosity,
		reasoningEffort: trace.model.settings.reasoningEffort,
		temperature: trace.model.settings.temperature,
		traceArtifactPath:
			trace.artifactPaths.find((artifactPath) =>
				artifactPath.includes("/traces/"),
			) ?? `runs/${trace.runId}/traces/${trace.caseId}.json`,
	};
}

await main();
