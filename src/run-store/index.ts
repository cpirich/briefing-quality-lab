import { access, readdir, readFile } from "node:fs/promises";
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
const defaultComparisonId = "baseline-2026-06-10-candidate-citation-gates";
const generatedRunPrefixes = [
	"baseline-local-",
	"baseline-openai-",
	"candidate-local-",
	"candidate-openai-",
] as const;
const phase5MinSourceDocuments = 5;
const phase5MaxSourceDocuments = 10;
const phase5MinSourceBodyCharacters = 240;
const forbiddenSourceBodyMetadataPhrases = [
	"expectedCoverage",
	"failureTags",
	"rubricEvidence",
	"citationSupport",
	"Briefing relevance",
	"Decision boundary",
	"main trap",
	"reviewer calibration",
	"Risk and distractor",
] as const;

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

interface CaseScoreSummary {
	overall: number;
	grounding: number;
	coverage: number;
	citationSupport: number;
	artifactPath: string;
}

interface CaseArtifactDetail {
	title: string;
	summary: string;
	claims: Array<{
		text: string;
		citations: string[];
	}>;
	openQuestions: string[];
	recommendation: string;
	rubricEvidence: string[];
	citationSupport: Array<{
		citation: string;
		supported: boolean;
		note: string;
	}>;
	evaluatorNote: string;
	artifactPaths: string[];
}

export interface CaseBreakdownEntry {
	caseId: string;
	title: string;
	sourceEvidence: string;
	failureTags: string[];
	baseline: CaseScoreSummary | null;
	candidate: CaseScoreSummary | null;
	delta: {
		overall: number | null;
		citationSupport: number | null;
	};
	diff: {
		baselineRecommendation: string;
		candidateRecommendation: string;
		evaluatorNote: string;
		baselineDetail: CaseArtifactDetail | null;
		candidateDetail: CaseArtifactDetail | null;
	};
}

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
	let rawJson: unknown;
	try {
		rawJson = JSON.parse(rawText);
	} catch (error) {
		throw new Error(
			`Invalid JSON fixture ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
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

async function listOptionalJsonFixturePaths(relativeDir: string) {
	try {
		return await listJsonFixturePaths(relativeDir);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return [];
		}

		throw error;
	}
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

async function loadOptionalJsonFixtures<T>(
	relativeDir: string,
	schema: z.ZodType<T>,
): Promise<T[]> {
	const fixturePaths = await listOptionalJsonFixturePaths(relativeDir);
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
	const manifestMatch = artifactPath.match(/^runs\/([^/]+)\/manifest\.json$/);
	if (manifestMatch?.[1]?.startsWith("baseline-local-")) {
		return "Generated baseline manifest";
	}
	if (manifestMatch?.[1]?.startsWith("baseline-openai-")) {
		return "OpenAI baseline manifest";
	}
	if (manifestMatch?.[1]?.startsWith("candidate-local-")) {
		return "Generated candidate manifest";
	}
	if (manifestMatch?.[1]?.startsWith("candidate-openai-")) {
		return "OpenAI candidate manifest";
	}
	if (artifactPath === "runs/baseline-2026-06-10/manifest.json") {
		return "Seeded baseline manifest";
	}
	if (artifactPath === "runs/candidate-citation-gates/manifest.json") {
		return "Reference target manifest";
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

export async function listRunComparisons(): Promise<RunComparison[]> {
	const comparisons = await loadJsonFixtures(
		"runs/comparisons",
		RunComparisonSchema,
	);
	return sortById(comparisons);
}

function isGeneratedComparison(runComparison: RunComparison) {
	return generatedRunPrefixes.some(
		(prefix) =>
			runComparison.baselineRunId.startsWith(prefix) ||
			runComparison.candidateRunId.startsWith(prefix),
	);
}

function comparisonRecency(
	runComparison: RunComparison,
	manifestById: Map<string, RunManifest>,
) {
	const baselineCreatedAt = Date.parse(
		manifestById.get(runComparison.baselineRunId)?.createdAt ?? "",
	);
	const candidateCreatedAt = Date.parse(
		manifestById.get(runComparison.candidateRunId)?.createdAt ?? "",
	);

	return Math.max(
		Number.isNaN(baselineCreatedAt) ? 0 : baselineCreatedAt,
		Number.isNaN(candidateCreatedAt) ? 0 : candidateCreatedAt,
	);
}

function latestGeneratedComparison(
	comparisons: RunComparison[],
	manifestById: Map<string, RunManifest>,
) {
	return [...comparisons].filter(isGeneratedComparison).sort((left, right) => {
		const recencyDelta =
			comparisonRecency(right, manifestById) -
			comparisonRecency(left, manifestById);

		if (recencyDelta !== 0) {
			return recencyDelta;
		}

		return right.id.localeCompare(left.id);
	})[0];
}

export async function compareRuns(input?: {
	baselineRunId?: string;
	candidateRunId?: string;
}): Promise<RunComparison> {
	const [comparisons, runManifests] = await Promise.all([
		listRunComparisons(),
		listRunManifests(),
	]);
	const manifestById = new Map(
		runManifests.map((manifest) => [manifest.runId, manifest]),
	);
	const comparison =
		(input?.baselineRunId || input?.candidateRunId
			? comparisons.find(
					(candidateComparison) =>
						(!input.baselineRunId ||
							candidateComparison.baselineRunId === input.baselineRunId) &&
						(!input.candidateRunId ||
							candidateComparison.candidateRunId === input.candidateRunId),
				)
			: undefined) ??
		(!input?.baselineRunId && !input?.candidateRunId
			? latestGeneratedComparison(comparisons, manifestById)
			: undefined) ??
		comparisons.find(
			(candidateComparison) => candidateComparison.id === defaultComparisonId,
		) ??
		comparisons[0];

	if (!comparison) {
		throw new Error("No seeded run comparisons found");
	}

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

function evaluatorOutputByCaseId(evaluatorOutputs: EvaluatorOutput[]) {
	return new Map(
		evaluatorOutputs.map((evaluatorOutput) => [
			evaluatorOutput.caseId,
			evaluatorOutput,
		]),
	);
}

function caseScoreSummaryFor(
	evaluatorOutput: EvaluatorOutput | undefined,
): CaseScoreSummary | null {
	if (!evaluatorOutput) {
		return null;
	}

	return {
		overall: evaluatorOutput.scores.overall,
		grounding: evaluatorOutput.scores.grounding,
		coverage: evaluatorOutput.scores.coverage,
		citationSupport: evaluatorOutput.scores.citationSupport,
		artifactPath:
			evaluatorOutput.artifactPaths.find((artifactPath) =>
				artifactPath.includes("/evaluations/"),
			) ??
			`runs/${evaluatorOutput.runId}/evaluations/${evaluatorOutput.caseId}.json`,
	};
}

function scoreDelta(
	candidate: CaseScoreSummary | null,
	baseline: CaseScoreSummary | null,
	metric: keyof Omit<CaseScoreSummary, "artifactPath">,
) {
	if (!candidate || !baseline) {
		return null;
	}

	return Math.round((candidate[metric] - baseline[metric]) * 100) / 100;
}

function caseArtifactDetailFor(
	briefing: BriefingOutput | undefined,
	evaluatorOutput: EvaluatorOutput | undefined,
): CaseArtifactDetail | null {
	if (!briefing && !evaluatorOutput) {
		return null;
	}

	return {
		title: briefing?.title ?? "No briefing title available",
		summary: briefing?.summary ?? "No briefing summary available.",
		claims: briefing?.claims ?? [],
		openQuestions: briefing?.openQuestions ?? [],
		recommendation: briefing?.recommendation ?? "No recommendation available.",
		rubricEvidence: evaluatorOutput?.rubricEvidence ?? [],
		citationSupport: evaluatorOutput?.citationSupport ?? [],
		evaluatorNote: evaluatorOutput?.notes ?? "No evaluator note available.",
		artifactPaths: evaluatorOutput?.artifactPaths ?? [],
	};
}

export async function listCaseBreakdown(input?: {
	baselineRunId?: string;
	candidateRunId?: string;
}): Promise<CaseBreakdownEntry[]> {
	const comparison = await compareRuns(input);
	const [
		evalCases,
		baselineEvaluations,
		candidateEvaluations,
		baselineBriefings,
		candidateBriefings,
	] = await Promise.all([
		listEvalCases(),
		listEvaluatorOutputs(comparison.baselineRunId),
		listEvaluatorOutputs(comparison.candidateRunId),
		listBriefingOutputs(comparison.baselineRunId),
		listBriefingOutputs(comparison.candidateRunId),
	]);
	const evalCaseById = indexById(evalCases);
	const baselineByCaseId = evaluatorOutputByCaseId(baselineEvaluations);
	const candidateByCaseId = evaluatorOutputByCaseId(candidateEvaluations);
	const baselineBriefingByCaseId = new Map(
		baselineBriefings.map((briefing) => [briefing.caseId, briefing]),
	);
	const candidateBriefingByCaseId = new Map(
		candidateBriefings.map((briefing) => [briefing.caseId, briefing]),
	);
	const caseIds = [
		...new Set([
			...baselineEvaluations.map((evaluation) => evaluation.caseId),
			...candidateEvaluations.map((evaluation) => evaluation.caseId),
		]),
	].sort();

	return caseIds.map((caseId) => {
		const evalCase = evalCaseById.get(caseId);
		const baseline = caseScoreSummaryFor(baselineByCaseId.get(caseId));
		const candidate = caseScoreSummaryFor(candidateByCaseId.get(caseId));
		const baselineEvaluation = baselineByCaseId.get(caseId);
		const candidateEvaluation = candidateByCaseId.get(caseId);
		const baselineBriefing = baselineBriefingByCaseId.get(caseId);
		const candidateBriefing = candidateBriefingByCaseId.get(caseId);

		return {
			caseId,
			title: evalCase?.title ?? caseId,
			sourceEvidence:
				evalCase?.expectedCoverage[0] ??
				"No source evidence summary available.",
			failureTags: evalCase?.failureTags ?? [],
			baseline,
			candidate,
			delta: {
				overall: scoreDelta(candidate, baseline, "overall"),
				citationSupport: scoreDelta(candidate, baseline, "citationSupport"),
			},
			diff: {
				baselineRecommendation:
					baselineBriefing?.recommendation ??
					"No baseline recommendation available.",
				candidateRecommendation:
					candidateBriefing?.recommendation ??
					"No reference recommendation available.",
				evaluatorNote:
					candidateEvaluation?.notes ??
					baselineEvaluation?.notes ??
					"No evaluator note available.",
				baselineDetail: caseArtifactDetailFor(
					baselineBriefing,
					baselineEvaluation,
				),
				candidateDetail: caseArtifactDetailFor(
					candidateBriefing,
					candidateEvaluation,
				),
			},
		};
	});
}

export async function listArtifacts(): Promise<ArtifactEntry[]> {
	const comparison = await compareRuns();
	return Promise.all(
		comparison.artifactPaths.map(async (artifactPath) => {
			await assertArtifactPathExists(
				artifactPath,
				`Run comparison ${comparison.id}`,
			);
			return ArtifactEntrySchema.parse({
				label: artifactLabelForPath(artifactPath),
				path: artifactPath,
				type: artifactTypeForPath(artifactPath),
			});
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

function getReferencedRecord<T>(
	recordsById: Map<string, T>,
	id: string,
	message: string,
) {
	const record = recordsById.get(id);
	assertFixtureReference(record !== undefined, message);
	return record;
}

function assertCaseBelongsToSourcePacket(
	sourcePacket: SourcePacket,
	evalCase: EvalCase,
	ownerLabel: string,
) {
	assertFixtureReference(
		evalCase.sourcePacketId === sourcePacket.id,
		`${ownerLabel} links source packet ${sourcePacket.id} to eval case ${evalCase.id}, but that case belongs to source packet ${evalCase.sourcePacketId}`,
	);
	assertFixtureReference(
		sourcePacket.caseId === evalCase.id,
		`${ownerLabel} links eval case ${evalCase.id} to source packet ${sourcePacket.id}, but that packet belongs to eval case ${sourcePacket.caseId}`,
	);
}

function assertSourcePacketDoesNotLeakEvalMetadata(sourcePacket: SourcePacket) {
	for (const source of sourcePacket.sources) {
		for (const phrase of forbiddenSourceBodyMetadataPhrases) {
			assertFixtureReference(
				!source.body.includes(phrase),
				`Source ${source.id} in packet ${sourcePacket.id} leaks eval metadata phrase "${phrase}"`,
			);
		}
	}
}

function assertCaseBelongsToRun(
	runManifest: RunManifest,
	caseId: string,
	ownerLabel: string,
) {
	assertFixtureReference(
		runManifest.caseIds.includes(caseId),
		`${ownerLabel} references case ${caseId}, which is not included in run ${runManifest.runId}`,
	);
}

function assertCitationsBelongToCase(
	citationIds: Iterable<string>,
	sourcePacket: SourcePacket,
	evalCase: EvalCase,
	ownerLabel: string,
) {
	const sourceCitationIds = new Set(
		sourcePacket.sources.map((source) => source.id),
	);
	const acceptedCitationIds = new Set(evalCase.acceptedCitations);

	for (const citationId of citationIds) {
		assertFixtureReference(
			sourceCitationIds.has(citationId),
			`${ownerLabel} cites ${citationId}, which is not present in source packet ${sourcePacket.id}`,
		);
		assertFixtureReference(
			acceptedCitationIds.has(citationId),
			`${ownerLabel} cites ${citationId}, which is not accepted by eval case ${evalCase.id}`,
		);
	}
}

function briefingCitationIds(briefingOutput: BriefingOutput) {
	return briefingOutput.claims.flatMap((claim) => claim.citations);
}

async function assertArtifactPathExists(
	artifactPath: string,
	ownerLabel: string,
) {
	try {
		await access(absolutePath(artifactPath));
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			throw new Error(
				`${ownerLabel} references missing artifact ${artifactPath}`,
			);
		}

		throw error;
	}
}

async function assertArtifactPathsExist(
	artifactPaths: string[],
	ownerLabel: string,
) {
	await Promise.all(
		artifactPaths.map((artifactPath) =>
			assertArtifactPathExists(artifactPath, ownerLabel),
		),
	);
}

async function listAllBriefingOutputs(runManifests: RunManifest[]) {
	const outputs = await Promise.all(
		runManifests.map((manifest) =>
			loadOptionalJsonFixtures(
				`runs/${manifest.runId}/briefings`,
				BriefingOutputSchema,
			),
		),
	);
	return sortById(outputs.flat());
}

async function listAllGenerationTraces(runManifests: RunManifest[]) {
	const traces = await Promise.all(
		runManifests.map((manifest) =>
			loadOptionalJsonFixtures(
				`runs/${manifest.runId}/traces`,
				GenerationTraceSchema,
			),
		),
	);
	return sortById(traces.flat());
}

async function listAllEvaluatorOutputs(runManifests: RunManifest[]) {
	const outputs = await Promise.all(
		runManifests.map((manifest) =>
			loadOptionalJsonFixtures(
				`runs/${manifest.runId}/evaluations`,
				EvaluatorOutputSchema,
			),
		),
	);
	return sortById(outputs.flat());
}

export async function validateRunStore(): Promise<FixtureCounts> {
	const [sourcePackets, evalCases, runManifests, runComparisons, artifacts] =
		await Promise.all([
			listSourcePackets(),
			listEvalCases(),
			listRunManifests(),
			listRunComparisons(),
			listArtifacts(),
		]);
	const [briefingOutputs, generationTraces, evaluatorOutputs] =
		await Promise.all([
			listAllBriefingOutputs(runManifests),
			listAllGenerationTraces(runManifests),
			listAllEvaluatorOutputs(runManifests),
		]);

	const sourcePacketById = indexById(sourcePackets);
	const evalCaseById = indexById(evalCases);
	const runManifestById = new Map(
		runManifests.map((manifest) => [manifest.runId, manifest]),
	);

	for (const sourcePacket of sourcePackets) {
		assertFixtureReference(
			sourcePacket.sources.length >= phase5MinSourceDocuments &&
				sourcePacket.sources.length <= phase5MaxSourceDocuments,
			`Source packet ${sourcePacket.id} has ${sourcePacket.sources.length} source documents; expected ${phase5MinSourceDocuments}-${phase5MaxSourceDocuments}`,
		);
		for (const source of sourcePacket.sources) {
			assertFixtureReference(
				source.body.length >= phase5MinSourceBodyCharacters,
				`Source ${source.id} in packet ${sourcePacket.id} is too short for Phase 5 (${source.body.length} characters); expected at least ${phase5MinSourceBodyCharacters}`,
			);
		}
		assertSourcePacketDoesNotLeakEvalMetadata(sourcePacket);
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

	await Promise.all(
		runManifests.map((manifest) =>
			assertArtifactPathsExist(
				manifest.artifactPaths,
				`Run manifest ${manifest.runId}`,
			),
		),
	);

	for (const briefingOutput of briefingOutputs) {
		const sourcePacket = getReferencedRecord(
			sourcePacketById,
			briefingOutput.sourcePacketId,
			`Briefing output ${briefingOutput.id} references missing source packet ${briefingOutput.sourcePacketId}`,
		);
		const evalCase = getReferencedRecord(
			evalCaseById,
			briefingOutput.caseId,
			`Briefing output ${briefingOutput.id} references missing eval case ${briefingOutput.caseId}`,
		);
		const runManifest = getReferencedRecord(
			runManifestById,
			briefingOutput.metadata.runId,
			`Briefing output ${briefingOutput.id} references missing run ${briefingOutput.metadata.runId}`,
		);
		const ownerLabel = `Briefing output ${briefingOutput.id}`;

		assertCaseBelongsToRun(runManifest, briefingOutput.caseId, ownerLabel);
		assertCaseBelongsToSourcePacket(sourcePacket, evalCase, ownerLabel);
		assertCitationsBelongToCase(
			briefingCitationIds(briefingOutput),
			sourcePacket,
			evalCase,
			ownerLabel,
		);
	}

	for (const trace of generationTraces) {
		const sourcePacket = getReferencedRecord(
			sourcePacketById,
			trace.sourcePacketId,
			`Generation trace ${trace.id} references missing source packet ${trace.sourcePacketId}`,
		);
		const evalCase = getReferencedRecord(
			evalCaseById,
			trace.caseId,
			`Generation trace ${trace.id} references missing eval case ${trace.caseId}`,
		);
		const runManifest = getReferencedRecord(
			runManifestById,
			trace.runId,
			`Generation trace ${trace.id} references missing run ${trace.runId}`,
		);
		const ownerLabel = `Generation trace ${trace.id}`;

		assertCaseBelongsToRun(runManifest, trace.caseId, ownerLabel);
		assertCaseBelongsToSourcePacket(sourcePacket, evalCase, ownerLabel);
		assertCitationsBelongToCase(
			briefingCitationIds(trace.output),
			sourcePacket,
			evalCase,
			`${ownerLabel} output`,
		);
		await assertArtifactPathsExist(trace.artifactPaths, ownerLabel);
	}

	for (const evaluatorOutput of evaluatorOutputs) {
		const evalCase = getReferencedRecord(
			evalCaseById,
			evaluatorOutput.caseId,
			`Evaluator output ${evaluatorOutput.id} references missing eval case ${evaluatorOutput.caseId}`,
		);
		const sourcePacket = getReferencedRecord(
			sourcePacketById,
			evalCase.sourcePacketId,
			`Evaluator output ${evaluatorOutput.id} references missing source packet ${evalCase.sourcePacketId}`,
		);
		const runManifest = getReferencedRecord(
			runManifestById,
			evaluatorOutput.runId,
			`Evaluator output ${evaluatorOutput.id} references missing run ${evaluatorOutput.runId}`,
		);
		const ownerLabel = `Evaluator output ${evaluatorOutput.id}`;

		assertCaseBelongsToRun(runManifest, evaluatorOutput.caseId, ownerLabel);
		assertCaseBelongsToSourcePacket(sourcePacket, evalCase, ownerLabel);
		assertCitationsBelongToCase(
			evaluatorOutput.citationSupport.map((citation) => citation.citation),
			sourcePacket,
			evalCase,
			ownerLabel,
		);
		await assertArtifactPathsExist(evaluatorOutput.artifactPaths, ownerLabel);
	}

	for (const runComparison of runComparisons) {
		assertFixtureReference(
			runManifestById.has(runComparison.baselineRunId),
			`Run comparison ${runComparison.id} references missing baseline run ${runComparison.baselineRunId}`,
		);
		assertFixtureReference(
			runManifestById.has(runComparison.candidateRunId),
			`Run comparison ${runComparison.id} references missing candidate run ${runComparison.candidateRunId}`,
		);
		await assertArtifactPathsExist(
			runComparison.artifactPaths,
			`Run comparison ${runComparison.id}`,
		);
	}

	return {
		sourcePackets: sourcePackets.length,
		evalCases: evalCases.length,
		runManifests: runManifests.length,
		briefingOutputs: briefingOutputs.length,
		generationTraces: generationTraces.length,
		evaluatorOutputs: evaluatorOutputs.length,
		runComparisons: runComparisons.length,
		artifacts: artifacts.length,
	};
}
