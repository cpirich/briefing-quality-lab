import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	listLoopTriageArtifacts,
	listRunComparisons,
	listRunManifests,
	validateRunStore,
} from "~/run-store";
import {
	type LoopTriageArtifact,
	LoopTriageArtifactSchema,
	type RunComparison,
	type RunManifest,
} from "~/schemas";

const repoRoot = process.cwd();
const triageTimestamp = new Date()
	.toISOString()
	.replace(/\D/g, "")
	.slice(0, 14);
const loopStatePath = "docs/briefing-loop-state.md";
const triageSectionHeading = "## Latest Automation-Friendly Triage";
const triageVersion = "lab-triage-v1";

interface TriageFinding {
	severity: "info" | "warn" | "fail";
	message: string;
	artifactPath?: string;
}

function absolutePath(relativePath: string) {
	return path.join(repoRoot, relativePath);
}

function parseArgs() {
	const args = new Set(process.argv.slice(2));
	if (args.has("--help")) {
		console.log(
			[
				"Usage: bun run lab:triage [--force]",
				"",
				"By default, reuses the existing triage artifact when the latest comparison input signature has not changed.",
				"Use --force or --new-artifact to intentionally create a fresh timestamped triage artifact.",
			].join("\n"),
		);
		process.exit(0);
	}

	const unknownArgs = [...args].filter(
		(arg) => arg !== "--force" && arg !== "--new-artifact",
	);
	if (unknownArgs.length > 0) {
		throw new Error(`Unknown lab:triage arguments: ${unknownArgs.join(", ")}`);
	}

	return {
		forceNewArtifact: args.has("--force") || args.has("--new-artifact"),
	};
}

async function fileExists(relativePath: string) {
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

async function writeJsonArtifact(relativePath: string, value: unknown) {
	const targetPath = absolutePath(relativePath);
	await mkdir(path.dirname(targetPath), { recursive: true });
	const tempPath = `${targetPath}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(value, null, "\t")}\n`);
	await rename(tempPath, targetPath);
}

function unsupportedClaimCount(manifest: RunManifest) {
	return (
		manifest.aggregateMetrics.groundingRiskUnits ??
		manifest.aggregateMetrics.unsupportedClaims
	);
}

function latestRuns(runManifests: RunManifest[]) {
	return [...runManifests]
		.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
		.slice(0, 5)
		.map((manifest) => ({
			runId: manifest.runId,
			status: manifest.status,
			createdAt: manifest.createdAt,
			variantLabel: manifest.variantLabel,
			caseCount: manifest.caseIds.length,
			overall: manifest.aggregateMetrics.overall,
			citationSupport: manifest.aggregateMetrics.citationSupport,
			unsupportedClaims: unsupportedClaimCount(manifest),
			medianLatencyMs: manifest.aggregateMetrics.medianLatencyMs,
		}));
}

function latestComparison(
	comparisons: RunComparison[],
	runManifests: RunManifest[],
) {
	const manifestById = new Map(
		runManifests.map((manifest) => [manifest.runId, manifest]),
	);

	return [...comparisons].sort((left, right) => {
		const leftTime = Math.max(
			Date.parse(manifestById.get(left.baselineRunId)?.createdAt ?? ""),
			Date.parse(manifestById.get(left.candidateRunId)?.createdAt ?? ""),
		);
		const rightTime = Math.max(
			Date.parse(manifestById.get(right.baselineRunId)?.createdAt ?? ""),
			Date.parse(manifestById.get(right.candidateRunId)?.createdAt ?? ""),
		);

		return (
			(Number.isNaN(rightTime) ? 0 : rightTime) -
			(Number.isNaN(leftTime) ? 0 : leftTime)
		);
	})[0];
}

async function comparisonArtifactPath(
	comparison: RunComparison | undefined,
): Promise<string | null> {
	if (!comparison) {
		return null;
	}

	const candidatePaths = [
		`runs/comparisons/${comparison.id}.json`,
		`runs/comparisons/${comparison.baselineRunId}-${comparison.candidateRunId}.json`,
		`runs/comparisons/${comparison.baselineRunId}__${comparison.candidateRunId}.json`,
	];
	for (const candidatePath of candidatePaths) {
		if (await fileExists(candidatePath)) {
			return candidatePath;
		}
	}

	return candidatePaths[0] ?? null;
}

function inputSignatureFor({
	comparison,
	comparisonPath,
}: {
	comparison: RunComparison | undefined;
	comparisonPath: string | null;
}): LoopTriageArtifact["inputSignature"] {
	return {
		triageVersion,
		latestComparisonId: comparison?.id ?? null,
		baselineRunId: comparison?.baselineRunId ?? null,
		candidateRunId: comparison?.candidateRunId ?? null,
		comparisonArtifactPath: comparisonPath,
	};
}

function sameInputSignature(
	left: LoopTriageArtifact["inputSignature"],
	right: LoopTriageArtifact["inputSignature"],
) {
	return (
		left.triageVersion === right.triageVersion &&
		left.latestComparisonId === right.latestComparisonId &&
		left.baselineRunId === right.baselineRunId &&
		left.candidateRunId === right.candidateRunId &&
		left.comparisonArtifactPath === right.comparisonArtifactPath
	);
}

function triageArtifactPath(artifact: LoopTriageArtifact) {
	return (
		artifact.artifactPaths.find((artifactPath) =>
			artifactPath.startsWith("runs/comparisons/triage/"),
		) ?? `runs/comparisons/triage/${artifact.id}.json`
	);
}

function matchingTriageArtifact({
	artifacts,
	inputSignature,
}: {
	artifacts: LoopTriageArtifact[];
	inputSignature: LoopTriageArtifact["inputSignature"];
}) {
	return [...artifacts]
		.filter((artifact) =>
			sameInputSignature(artifact.inputSignature, inputSignature),
		)
		.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function staleOrMissingArtifacts(runManifests: RunManifest[]): TriageFinding[] {
	const findings: TriageFinding[] = [];
	for (const manifest of runManifests) {
		if (manifest.status === "running") {
			findings.push({
				severity: "warn",
				message: `Run ${manifest.runId} is still marked running.`,
				artifactPath: `runs/${manifest.runId}/manifest.json`,
			});
		}
		if (manifest.status === "failed") {
			findings.push({
				severity: "fail",
				message: `Run ${manifest.runId} is marked failed.`,
				artifactPath: `runs/${manifest.runId}/manifest.json`,
			});
		}
	}

	return findings.length > 0
		? findings
		: [
				{
					severity: "info" as const,
					message: "No running or failed run manifests found.",
				},
			];
}

function weakestFailureClusters(comparison: RunComparison | undefined) {
	return (comparison?.failureClusters ?? []).slice(0, 4).map((cluster) => ({
		title: cluster.title,
		count: cluster.count,
		severity: cluster.severity,
		cases: cluster.cases,
	}));
}

function recommendationFor({
	dataValidationPassed,
	staleFindings,
	clusters,
}: {
	dataValidationPassed: boolean;
	staleFindings: ReturnType<typeof staleOrMissingArtifacts>;
	clusters: ReturnType<typeof weakestFailureClusters>;
}) {
	if (!dataValidationPassed) {
		return {
			label: "needs human review" as const,
			text: "Data validation failed. Fix schema or missing-artifact issues before running live matrix experiments.",
			nextCommand: "mise exec -- bun run data:validate",
		};
	}
	if (staleFindings.some((finding) => finding.severity !== "info")) {
		return {
			label: "iterate" as const,
			text: "Resolve stale or incomplete run artifacts before spending on new provider-backed evals.",
			nextCommand: "mise exec -- bun run lab:triage",
		};
	}
	if (clusters.length > 0) {
		return {
			label: "needs human review" as const,
			text: `Review the top failure cluster (${clusters[0]?.title}) and approve a bounded matrix slice before live-provider work.`,
			nextCommand: "mise exec -- bun run eval:matrix",
		};
	}

	return {
		label: "needs human review" as const,
		text: "Artifacts are valid, but no failure cluster is strong enough for an automatic ship recommendation.",
		nextCommand: "mise exec -- bun run eval:matrix",
	};
}

function triageMarkdown({
	artifactPath,
	artifact,
}: {
	artifactPath: string;
	artifact: LoopTriageArtifact;
}) {
	const latestRun = artifact.latestRuns[0];
	const topCluster = artifact.weakestFailureClusters[0];

	return [
		triageSectionHeading,
		"",
		`Last triage: ${artifact.createdAt}`,
		`Triage artifact: \`${artifactPath}\``,
		`Data validation: ${artifact.dataValidation.status} - ${artifact.dataValidation.message}`,
		latestRun
			? `Latest run: \`${latestRun.runId}\` (${latestRun.status}, overall ${latestRun.overall.toFixed(2)}, citation ${latestRun.citationSupport.toFixed(2)})`
			: "Latest run: none found",
		artifact.latestComparison
			? `Latest comparison: \`${artifact.latestComparison.id}\` (${artifact.latestComparison.recommendationLabel})`
			: "Latest comparison: none found",
		topCluster
			? `Top failure cluster: ${topCluster.title} across ${topCluster.cases.join(", ")}`
			: "Top failure cluster: none found in latest comparison",
		`Recommendation: ${artifact.recommendation.label} - ${artifact.recommendation.text}`,
		artifact.recommendation.nextCommand
			? `Next command: \`${artifact.recommendation.nextCommand}\``
			: "Next command: none",
		"",
	].join("\n");
}

function replaceTriageSection(markdown: string, section: string) {
	const sectionStart = markdown.indexOf(triageSectionHeading);
	if (sectionStart === -1) {
		return `${markdown.trimEnd()}\n\n${section}`;
	}
	const nextSectionStart = markdown.indexOf("\n## ", sectionStart + 1);
	if (nextSectionStart === -1) {
		return `${markdown.slice(0, sectionStart).trimEnd()}\n\n${section}`;
	}

	return `${markdown.slice(0, sectionStart).trimEnd()}\n\n${section}${markdown.slice(nextSectionStart)}`;
}

async function main() {
	const args = parseArgs();
	let validation:
		| { status: "pass"; message: string; counts: Record<string, number> }
		| { status: "fail"; message: string };

	try {
		const counts = await validateRunStore();
		validation = {
			status: "pass",
			message: "Run store fixtures validate.",
			counts,
		};
	} catch (error) {
		validation = {
			status: "fail",
			message: error instanceof Error ? error.message : String(error),
		};
	}

	const [runManifests, comparisons, triageArtifacts] =
		validation.status === "pass"
			? await Promise.all([
					listRunManifests(),
					listRunComparisons(),
					listLoopTriageArtifacts(),
				])
			: [[], [], []];
	const comparison = latestComparison(comparisons, runManifests);
	const comparisonPath = await comparisonArtifactPath(comparison);
	const inputSignature = inputSignatureFor({ comparison, comparisonPath });
	const existingArtifact = args.forceNewArtifact
		? undefined
		: matchingTriageArtifact({
				artifacts: triageArtifacts,
				inputSignature,
			});
	const staleFindings =
		validation.status === "pass"
			? staleOrMissingArtifacts(runManifests)
			: [
					{
						severity: "fail" as const,
						message:
							"Skipped run manifest scan because run-store validation failed.",
					},
				];
	const clusters =
		validation.status === "pass" ? weakestFailureClusters(comparison) : [];
	const recommendation = recommendationFor({
		dataValidationPassed: validation.status === "pass",
		staleFindings,
		clusters,
	});
	const triageId = existingArtifact?.id ?? `triage-${triageTimestamp}`;
	const artifactPath =
		existingArtifact === undefined
			? `runs/comparisons/triage/${triageId}.json`
			: triageArtifactPath(existingArtifact);
	const artifact = LoopTriageArtifactSchema.parse({
		id: triageId,
		createdAt: existingArtifact?.createdAt ?? new Date().toISOString(),
		triageVersion,
		inputSignature,
		dataValidation: validation,
		latestRuns: latestRuns(runManifests),
		latestComparison: comparison
			? {
					id: comparison.id,
					baselineRunId: comparison.baselineRunId,
					candidateRunId: comparison.candidateRunId,
					recommendationLabel: comparison.recommendation.label,
					recommendationWarning: comparison.recommendation.warning,
				}
			: null,
		staleOrMissingArtifacts: staleFindings,
		weakestFailureClusters: clusters,
		recommendation,
		loopStatePath,
		artifactPaths: [artifactPath],
	});
	await writeJsonArtifact(artifactPath, artifact);

	const loopState = await readFile(absolutePath(loopStatePath), "utf8");
	await writeFile(
		absolutePath(loopStatePath),
		replaceTriageSection(loopState, triageMarkdown({ artifactPath, artifact })),
	);

	console.log(
		`${existingArtifact === undefined ? "Wrote" : "Updated"} ${artifactPath}.`,
	);
	if (existingArtifact !== undefined) {
		console.log("Reused existing triage artifact for unchanged inputs.");
	}
	console.log(
		`${artifact.recommendation.label}: ${artifact.recommendation.text}`,
	);
}

await main();
