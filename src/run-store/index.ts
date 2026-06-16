import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";

import {
	type ArtifactEntry,
	ArtifactEntrySchema,
	type BriefingOutput,
	BriefingOutputSchema,
	type EvalCase,
	EvalCaseSchema,
	type EvaluatorOutput,
	EvaluatorOutputSchema,
	type GenerationTrace,
	GenerationTraceSchema,
	type RunComparison,
	RunComparisonSchema,
	type RunManifest,
	RunManifestSchema,
	type SourcePacket,
	SourcePacketSchema,
} from "~/schemas";

const repoRoot = process.cwd();
const defaultCandidateRunId = "candidate-citation-gates";
const defaultComparisonPath =
	"runs/comparisons/baseline-2026-06-10__candidate-citation-gates.json";

type FixtureCounts = {
	sourcePackets: number;
	evalCases: number;
	runManifests: number;
	briefingOutputs: number;
	generationTraces: number;
	evaluatorOutputs: number;
	runComparisons: number;
	artifacts: number;
};

function absolutePath(relativePath: string) {
	return path.join(repoRoot, relativePath);
}

function recordIdFromJson(value: unknown) {
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (typeof record.id === "string") {
			return record.id;
		}
		if (typeof record.runId === "string") {
			return record.runId;
		}
	}

	return "unknown";
}

function formatZodError(error: z.ZodError) {
	return error.issues
		.map((issue) => {
			const location = issue.path.join(".") || "<root>";
			return `${location}: ${issue.message}`;
		})
		.join("; ");
}

async function loadJsonFixture<T>(
	relativePath: string,
	schema: z.ZodType<T>,
): Promise<T> {
	const rawText = await readFile(absolutePath(relativePath), "utf8");
	const rawJson: unknown = JSON.parse(rawText);
	const result = schema.safeParse(rawJson);

	if (!result.success) {
		throw new Error(
			`Invalid fixture ${relativePath} (id: ${recordIdFromJson(rawJson)}): ${formatZodError(result.error)}`,
		);
	}

	return result.data;
}

async function listJsonFixturePaths(relativeDir: string) {
	const entries = await readdir(absolutePath(relativeDir), {
		withFileTypes: true,
	});

	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
		.map((entry) => path.posix.join(relativeDir, entry.name))
		.sort();
}

async function loadJsonFixtures<T>(
	relativeDir: string,
	schema: z.ZodType<T>,
): Promise<T[]> {
	const fixturePaths = await listJsonFixturePaths(relativeDir);
	return Promise.all(
		fixturePaths.map((fixturePath) => loadJsonFixture(fixturePath, schema)),
	);
}

function sortById<T extends { id: string }>(records: T[]) {
	return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

function artifactTypeForPath(artifactPath: string) {
	if (artifactPath.endsWith("/manifest.json")) {
		return "Run manifest";
	}
	if (artifactPath.includes("/traces/")) {
		return "Generation trace";
	}
	if (artifactPath.includes("/evaluations/")) {
		return "Evaluator output";
	}
	if (artifactPath.startsWith("reports/")) {
		return "Report";
	}
	if (artifactPath.includes("/briefings/")) {
		return "Briefing output";
	}

	return "Artifact";
}

function artifactLabelForPath(artifactPath: string) {
	if (artifactPath === "runs/baseline-2026-06-10/manifest.json") {
		return "Baseline manifest";
	}
	if (artifactPath === "runs/candidate-citation-gates/manifest.json") {
		return "Latest candidate";
	}
	if (artifactPath.includes("/traces/")) {
		return "Featured trace";
	}
	if (artifactPath.startsWith("reports/")) {
		return "Eval report";
	}
	if (artifactPath.includes("/evaluations/")) {
		return "Featured evaluation";
	}

	return path.basename(artifactPath, path.extname(artifactPath));
}

export async function listSourcePackets(): Promise<SourcePacket[]> {
	const packets = await loadJsonFixtures(
		"data/source-packets",
		SourcePacketSchema,
	);
	return sortById(packets);
}

export async function listEvalCases(): Promise<EvalCase[]> {
	const evalCases = await loadJsonFixtures("data/eval-cases", EvalCaseSchema);
	return sortById(evalCases);
}

export async function listRunManifests(): Promise<RunManifest[]> {
	const runEntries = await readdir(absolutePath("runs"), {
		withFileTypes: true,
	});
	const manifestPaths = runEntries
		.filter((entry) => entry.isDirectory() && entry.name !== "comparisons")
		.map((entry) => path.posix.join("runs", entry.name, "manifest.json"))
		.sort();

	const manifests = await Promise.all(
		manifestPaths.map((manifestPath) =>
			loadJsonFixture(manifestPath, RunManifestSchema),
		),
	);

	return [...manifests].sort((left, right) =>
		left.createdAt.localeCompare(right.createdAt),
	);
}

export async function listBriefingOutputs(
	runId = defaultCandidateRunId,
): Promise<BriefingOutput[]> {
	const outputs = await loadJsonFixtures(
		`runs/${runId}/briefings`,
		BriefingOutputSchema,
	);
	return sortById(outputs);
}

export async function listGenerationTraces(
	runId = defaultCandidateRunId,
): Promise<GenerationTrace[]> {
	const traces = await loadJsonFixtures(
		`runs/${runId}/traces`,
		GenerationTraceSchema,
	);
	return sortById(traces);
}

export async function listEvaluatorOutputs(
	runId = defaultCandidateRunId,
): Promise<EvaluatorOutput[]> {
	const outputs = await loadJsonFixtures(
		`runs/${runId}/evaluations`,
		EvaluatorOutputSchema,
	);
	return sortById(outputs);
}

export async function compareRuns(input?: {
	baselineRunId?: string;
	candidateRunId?: string;
}): Promise<RunComparison> {
	const comparison = await loadJsonFixture(
		defaultComparisonPath,
		RunComparisonSchema,
	);

	if (
		input?.baselineRunId &&
		input.baselineRunId !== comparison.baselineRunId
	) {
		throw new Error(
			`No seeded comparison for baseline run ${input.baselineRunId}`,
		);
	}

	if (
		input?.candidateRunId &&
		input.candidateRunId !== comparison.candidateRunId
	) {
		throw new Error(
			`No seeded comparison for candidate run ${input.candidateRunId}`,
		);
	}

	return comparison;
}

export async function listArtifacts(): Promise<ArtifactEntry[]> {
	const comparison = await compareRuns();
	return comparison.artifactPaths.map((artifactPath) =>
		ArtifactEntrySchema.parse({
			label: artifactLabelForPath(artifactPath),
			path: artifactPath,
			type: artifactTypeForPath(artifactPath),
		}),
	);
}

function indexById<T extends { id: string }>(records: T[]) {
	return new Map(records.map((record) => [record.id, record]));
}

function assertFixtureReference(
	condition: boolean,
	message: string,
): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

export async function validateRunStore(): Promise<FixtureCounts> {
	const [
		sourcePackets,
		evalCases,
		runManifests,
		briefingOutputs,
		generationTraces,
		evaluatorOutputs,
		runComparison,
		artifacts,
	] = await Promise.all([
		listSourcePackets(),
		listEvalCases(),
		listRunManifests(),
		listBriefingOutputs(),
		listGenerationTraces(),
		listEvaluatorOutputs(),
		compareRuns(),
		listArtifacts(),
	]);

	const sourcePacketById = indexById(sourcePackets);
	const evalCaseById = indexById(evalCases);
	const runManifestById = new Map(
		runManifests.map((manifest) => [manifest.runId, manifest]),
	);

	for (const sourcePacket of sourcePackets) {
		assertFixtureReference(
			evalCaseById.has(sourcePacket.caseId),
			`Source packet ${sourcePacket.id} references missing eval case ${sourcePacket.caseId}`,
		);
	}

	for (const evalCase of evalCases) {
		assertFixtureReference(
			sourcePacketById.has(evalCase.sourcePacketId),
			`Eval case ${evalCase.id} references missing source packet ${evalCase.sourcePacketId}`,
		);
	}

	for (const manifest of runManifests) {
		for (const caseId of manifest.caseIds) {
			assertFixtureReference(
				evalCaseById.has(caseId),
				`Run manifest ${manifest.runId} references missing eval case ${caseId}`,
			);
		}
	}

	for (const briefingOutput of briefingOutputs) {
		assertFixtureReference(
			sourcePacketById.has(briefingOutput.sourcePacketId),
			`Briefing output ${briefingOutput.id} references missing source packet ${briefingOutput.sourcePacketId}`,
		);
		assertFixtureReference(
			evalCaseById.has(briefingOutput.caseId),
			`Briefing output ${briefingOutput.id} references missing eval case ${briefingOutput.caseId}`,
		);
	}

	for (const trace of generationTraces) {
		assertFixtureReference(
			runManifestById.has(trace.runId),
			`Generation trace ${trace.id} references missing run ${trace.runId}`,
		);
		assertFixtureReference(
			sourcePacketById.has(trace.sourcePacketId),
			`Generation trace ${trace.id} references missing source packet ${trace.sourcePacketId}`,
		);
		assertFixtureReference(
			evalCaseById.has(trace.caseId),
			`Generation trace ${trace.id} references missing eval case ${trace.caseId}`,
		);
	}

	for (const evaluatorOutput of evaluatorOutputs) {
		assertFixtureReference(
			runManifestById.has(evaluatorOutput.runId),
			`Evaluator output ${evaluatorOutput.id} references missing run ${evaluatorOutput.runId}`,
		);
		assertFixtureReference(
			evalCaseById.has(evaluatorOutput.caseId),
			`Evaluator output ${evaluatorOutput.id} references missing eval case ${evaluatorOutput.caseId}`,
		);
	}

	assertFixtureReference(
		runManifestById.has(runComparison.baselineRunId),
		`Run comparison ${runComparison.id} references missing baseline run ${runComparison.baselineRunId}`,
	);
	assertFixtureReference(
		runManifestById.has(runComparison.candidateRunId),
		`Run comparison ${runComparison.id} references missing candidate run ${runComparison.candidateRunId}`,
	);

	return {
		sourcePackets: sourcePackets.length,
		evalCases: evalCases.length,
		runManifests: runManifests.length,
		briefingOutputs: briefingOutputs.length,
		generationTraces: generationTraces.length,
		evaluatorOutputs: evaluatorOutputs.length,
		runComparisons: 1,
		artifacts: artifacts.length,
	};
}
