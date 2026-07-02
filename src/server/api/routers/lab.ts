import { z } from "zod";

import { getEvalRun, startEvalRun } from "~/lab/eval-runs";
import type { CaseBreakdownEntry } from "~/run-store";
import {
	compareRuns,
	getImprovementLoopSummary,
	listArtifacts,
	listCaseBreakdown,
	listEvalCases,
	listInProgressRuns,
	listRunManifests,
} from "~/run-store";
import { type RunComparison, RunComparisonSchema } from "~/schemas";
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

async function listPublicCaseBreakdown(input?: {
	baselineRunId?: string;
	candidateRunId?: string;
}) {
	const [caseBreakdown, evalCases] = await Promise.all([
		listCaseBreakdown(input),
		listEvalCases(),
	]);
	const holdoutCaseIds = new Set(
		evalCases
			.filter((evalCase) => evalCase.holdout)
			.map((evalCase) => evalCase.id),
	);

	return caseBreakdown.filter((entry) => !holdoutCaseIds.has(entry.caseId));
}

function averageCaseScore(
	caseBreakdown: CaseBreakdownEntry[],
	side: "baseline" | "candidate",
	metric: "overall" | "citationSupport",
) {
	const scores = caseBreakdown
		.map((entry) => entry[side]?.[metric])
		.filter((score): score is number => typeof score === "number");

	if (scores.length === 0) {
		return null;
	}

	return (
		Math.round(
			(scores.reduce((total, score) => total + score, 0) / scores.length) * 100,
		) / 100
	);
}

function deltaLabel(candidate: number | null, baseline: number | null) {
	if (candidate === null || baseline === null) {
		return "visible-only unavailable";
	}

	const delta = candidate - baseline;
	const sign = delta >= 0 ? "+" : "";
	return `${sign}${delta.toFixed(2)}`;
}

function publicSafeComparisonRows(caseBreakdown: CaseBreakdownEntry[]) {
	const baselineOverall = averageCaseScore(
		caseBreakdown,
		"baseline",
		"overall",
	);
	const candidateOverall = averageCaseScore(
		caseBreakdown,
		"candidate",
		"overall",
	);
	const baselineCitation = averageCaseScore(
		caseBreakdown,
		"baseline",
		"citationSupport",
	);
	const candidateCitation = averageCaseScore(
		caseBreakdown,
		"candidate",
		"citationSupport",
	);

	return [
		{
			metric: "Overall score",
			baseline: baselineOverall?.toFixed(2) ?? "visible-only unavailable",
			candidate: candidateOverall?.toFixed(2) ?? "visible-only unavailable",
			delta: deltaLabel(candidateOverall, baselineOverall),
		},
		{
			metric: "Citation support",
			baseline: baselineCitation?.toFixed(2) ?? "visible-only unavailable",
			candidate: candidateCitation?.toFixed(2) ?? "visible-only unavailable",
			delta: deltaLabel(candidateCitation, baselineCitation),
		},
		{
			metric: "Visible eval cases",
			baseline: String(caseBreakdown.length),
			candidate: String(caseBreakdown.length),
			delta: "0",
		},
	];
}

function publicSafeTrend(
	comparison: RunComparison,
	caseBreakdown: CaseBreakdownEntry[],
) {
	const baselineOverall = averageCaseScore(
		caseBreakdown,
		"baseline",
		"overall",
	);
	const candidateOverall = averageCaseScore(
		caseBreakdown,
		"candidate",
		"overall",
	);

	return [
		{
			label: comparison.baselineLabel ?? comparison.baselineRunId,
			score: baselineOverall === null ? 0 : Math.round(baselineOverall * 100),
		},
		{
			label: comparison.candidateLabel ?? comparison.candidateRunId,
			score: candidateOverall === null ? 0 : Math.round(candidateOverall * 100),
		},
	];
}

function withoutTargetDelta(metric: RunComparison["metrics"][number]) {
	const { targetDelta: _redactedTargetDelta, ...safeMetric } = metric;

	return safeMetric;
}

function publicSafeMetrics(
	comparison: RunComparison,
	caseBreakdown: CaseBreakdownEntry[],
) {
	const rows = publicSafeComparisonRows(caseBreakdown);
	const overall = rows.find((row) => row.metric === "Overall score");
	const citation = rows.find((row) => row.metric === "Citation support");

	return comparison.metrics.map((metric) => {
		if (metric.label === "Overall quality" && overall) {
			return {
				...withoutTargetDelta(metric),
				value: overall.candidate,
				delta: overall.delta,
				status: "Visible cases only; holdout aggregates redacted",
				tone: "blue" as const,
			};
		}
		if (metric.label === "Citation grounding" && citation) {
			return {
				...withoutTargetDelta(metric),
				value: citation.candidate,
				delta: citation.delta,
				status: "Visible cases only; holdout aggregates redacted",
				tone: "blue" as const,
			};
		}

		return {
			...withoutTargetDelta(metric),
			value: "redacted",
			delta: "holdouts redacted",
			status: "Public endpoint redacts holdout aggregate metrics",
			tone: "amber" as const,
		};
	});
}

function publicSafeFeaturedCase(
	comparison: RunComparison,
	caseBreakdown: CaseBreakdownEntry[],
	holdoutCaseIds: Set<string>,
) {
	if (!holdoutCaseIds.has(comparison.featuredCase.id)) {
		return comparison.featuredCase;
	}

	const replacement = caseBreakdown[0];
	if (!replacement) {
		return {
			id: "visible-cases-redacted",
			title: "Visible case unavailable",
			sourceEvidence: "Holdout featured case redacted.",
			baseline: "Holdout featured case redacted.",
			candidate: "Holdout featured case redacted.",
			evaluatorNote: "Public endpoint redacts holdout case details.",
		};
	}

	return {
		id: replacement.caseId,
		title: replacement.title,
		sourceEvidence: replacement.sourceEvidence,
		baseline: replacement.diff.baselineRecommendation,
		candidate: replacement.diff.candidateRecommendation,
		evaluatorNote: replacement.diff.evaluatorNote,
	};
}

function publicSafeRunMetadata(comparison: RunComparison) {
	if (!comparison.runMetadata) {
		return undefined;
	}

	return {
		baseline: comparison.runMetadata.baseline
			? { ...comparison.runMetadata.baseline, traceArtifactPath: null }
			: null,
		candidate: comparison.runMetadata.candidate
			? { ...comparison.runMetadata.candidate, traceArtifactPath: null }
			: null,
	};
}

function publicSafeArtifactPaths(
	comparison: RunComparison,
	holdoutCaseIds: Set<string>,
) {
	const artifactPaths = comparison.artifactPaths.filter(
		(artifactPath) =>
			![...holdoutCaseIds].some((caseId) => artifactPath.includes(caseId)),
	);

	return artifactPaths.length > 0
		? artifactPaths
		: [`runs/comparisons/${comparison.id}.json`];
}

function failureThemeMovementStatus({
	baselineCount,
	candidateCount,
}: {
	baselineCount: number;
	candidateCount: number;
}) {
	if (baselineCount === 0 && candidateCount > 0) {
		return "new" as const;
	}
	if (baselineCount > 0 && candidateCount === 0) {
		return "resolved" as const;
	}
	if (candidateCount < baselineCount) {
		return "reduced" as const;
	}
	if (candidateCount > baselineCount) {
		return "increased" as const;
	}
	return "unchanged" as const;
}

function publicSafeFailureThemeMovements(
	comparison: RunComparison,
	holdoutCaseIds: Set<string>,
) {
	return comparison.failureThemeMovements?.flatMap((movement) => {
		const baselineCases = movement.baselineCases.filter(
			(caseId) => !holdoutCaseIds.has(caseId),
		);
		const candidateCases = movement.candidateCases.filter(
			(caseId) => !holdoutCaseIds.has(caseId),
		);
		const baselineCount = baselineCases.length;
		const candidateCount = candidateCases.length;

		if (baselineCount === 0 && candidateCount === 0) {
			return [];
		}

		return [
			{
				...movement,
				baselineCount,
				candidateCount,
				delta: candidateCount - baselineCount,
				status: failureThemeMovementStatus({
					baselineCount,
					candidateCount,
				}),
				baselineCases,
				candidateCases,
			},
		];
	});
}

async function publicSafeComparison(input?: {
	baselineRunId?: string;
	candidateRunId?: string;
}): Promise<RunComparison> {
	const [comparison, evalCases, runManifests, caseBreakdown] =
		await Promise.all([
			compareRuns(input),
			listEvalCases(),
			listRunManifests(),
			listPublicCaseBreakdown(input),
		]);
	const holdoutCaseIds = new Set(
		evalCases
			.filter((evalCase) => evalCase.holdout)
			.map((evalCase) => evalCase.id),
	);
	const manifestById = new Map(
		runManifests.map((manifest) => [manifest.runId, manifest]),
	);
	const comparedCaseIds = [
		...(manifestById.get(comparison.baselineRunId)?.caseIds ?? []),
		...(manifestById.get(comparison.candidateRunId)?.caseIds ?? []),
	];
	const includesHoldouts =
		comparedCaseIds.some((caseId) => holdoutCaseIds.has(caseId)) ||
		comparison.failureClusters.some((cluster) =>
			cluster.cases.some((caseId) => holdoutCaseIds.has(caseId)),
		) ||
		holdoutCaseIds.has(comparison.featuredCase.id);

	if (!includesHoldouts) {
		return comparison;
	}

	return RunComparisonSchema.parse({
		...comparison,
		runMetadata: publicSafeRunMetadata(comparison),
		metrics: publicSafeMetrics(comparison, caseBreakdown),
		trend: publicSafeTrend(comparison, caseBreakdown),
		comparisonRows: publicSafeComparisonRows(caseBreakdown),
		failureClusters: comparison.failureClusters.flatMap((cluster) => {
			const publicCases = cluster.cases.filter(
				(caseId) => !holdoutCaseIds.has(caseId),
			);

			return publicCases.length === 0
				? []
				: [{ ...cluster, count: publicCases.length, cases: publicCases }];
		}),
		failureThemeMovements: publicSafeFailureThemeMovements(
			comparison,
			holdoutCaseIds,
		),
		featuredCase: publicSafeFeaturedCase(
			comparison,
			caseBreakdown,
			holdoutCaseIds,
		),
		recommendation: {
			...comparison.recommendation,
			warning: `${comparison.recommendation.warning} Holdout case details and aggregate holdout metrics are redacted from this public endpoint.`,
		},
		artifactPaths: publicSafeArtifactPaths(comparison, holdoutCaseIds),
	});
}

export const labRouter = createTRPCRouter({
	listEvalCases: publicProcedure.query(() => {
		return listPublicEvalCases();
	}),

	listArtifacts: publicProcedure
		.input(
			z
				.object({
					baselineRunId: z.string().min(1).optional(),
					candidateRunId: z.string().min(1).optional(),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const comparison = await publicSafeComparison(input);
			return listArtifacts({
				artifactPaths: comparison.artifactPaths,
				ownerLabel: `Run comparison ${comparison.id}`,
			});
		}),

	listInProgressRuns: publicProcedure.query(() => {
		return listInProgressRuns();
	}),

	getImprovementLoopSummary: publicProcedure.query(() => {
		return getImprovementLoopSummary();
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
			return listPublicCaseBreakdown(input);
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
			return publicSafeComparison(input);
		}),

	// Local demo control surface only: this repo has no production deployment,
	// auth layer, or hosted public endpoint. Do not reuse this public mutation for
	// a deployed environment without adding an admin/auth gate for OpenAI spend.
	startEvalRun: publicProcedure
		.input(
			z
				.object({
					caseIds: z.array(z.string().min(1)).optional(),
					includeHoldouts: z.boolean().optional(),
					provider: z.enum(["local", "openai"]).optional(),
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
