import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateBriefing } from "~/genie/generate-briefing";
import { listEvalCases, listSourcePackets } from "~/run-store";
import {
	type RunManifest,
	RunManifestSchema,
	type SourcePacket,
} from "~/schemas";

type EvalRunProvider = "local" | "openai";

interface EvalRunJob {
	id: string;
	runId: string;
	provider: EvalRunProvider;
	status: "queued" | "running" | "complete" | "failed";
	totalCases: number;
	completedCases: number;
	currentCaseId?: string;
	artifactPaths: string[];
	error?: string;
	startedAt: string;
	finishedAt?: string;
}

interface StartEvalRunInput {
	caseIds?: string[];
	includeHoldouts?: boolean;
	provider?: EvalRunProvider;
}

const jobs = new Map<string, EvalRunJob>();
const repoRoot = process.cwd();

function toSlugTimestamp(date: Date) {
	return date.toISOString().replace(/\D/g, "").slice(0, 17);
}

function runIdFor(provider: EvalRunProvider, now: Date) {
	return `candidate-${provider}-${toSlugTimestamp(now)}-${crypto.randomUUID().slice(0, 8)}`;
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

function buildManifest({
	runId,
	provider,
	status,
	caseIds,
	artifactPaths,
	createdAt,
	error,
}: {
	runId: string;
	provider: EvalRunProvider;
	status: RunManifest["status"];
	caseIds: string[];
	artifactPaths: string[];
	createdAt: string;
	error?: string;
}) {
	return RunManifestSchema.parse({
		runId,
		createdAt,
		variantLabel:
			provider === "openai"
				? "OpenAI Responses generated run"
				: "Local extractive generated run",
		status,
		gitRef: "local-worktree",
		command: `lab.startEvalRun provider=${provider}`,
		caseIds,
		aggregateMetrics: {
			overall: 0,
			grounding: 0,
			coverage: 0,
			citationSupport: 0,
			unsupportedClaims: 0,
			medianLatencyMs: 0,
			costRatio: 1,
			latencyRatio: 1,
		},
		guardrails: [
			{
				id: "generation-only",
				label: "Evaluator pass",
				status: "warn",
				value: "Not run",
				threshold: "Evaluator outputs required before ship/no-ship decision",
			},
		],
		artifactPaths,
		error,
	});
}

async function executeEvalRun(
	jobId: string,
	input: Required<StartEvalRunInput>,
) {
	if (input.provider === "openai") {
		await executeOpenAIEvalRun(jobId);
		return;
	}

	const job = jobs.get(jobId);
	if (!job) {
		return;
	}
	const manifestPath = `runs/${job.runId}/manifest.json`;
	let caseIds: string[] = [];
	let manifestStarted = false;

	try {
		job.status = "running";
		const [evalCases, sourcePackets] = await Promise.all([
			listEvalCases(),
			listSourcePackets(),
		]);
		const sourcePacketsById = sourcePacketById(sourcePackets);
		const selectedEvalCases = evalCases.filter((evalCase) => {
			if (!input.includeHoldouts && evalCase.holdout) {
				return false;
			}

			return input.caseIds.length === 0 || input.caseIds.includes(evalCase.id);
		});
		caseIds = selectedEvalCases.map((evalCase) => evalCase.id);
		if (input.caseIds.length > 0) {
			const selectedCaseIds = new Set(caseIds);
			const missingCaseIds = input.caseIds.filter(
				(caseId) => !selectedCaseIds.has(caseId),
			);
			if (missingCaseIds.length > 0) {
				throw new Error(
					`Requested eval cases were not selected: ${missingCaseIds.join(", ")}`,
				);
			}
		}
		if (caseIds.length === 0) {
			throw new Error(
				input.caseIds.length > 0
					? `No eval cases selected for requested case ids: ${input.caseIds.join(", ")}`
					: "No visible eval cases are available for this run.",
			);
		}
		job.totalCases = caseIds.length;
		job.artifactPaths = [manifestPath];
		manifestStarted = true;
		await writeJsonArtifact(
			manifestPath,
			buildManifest({
				runId: job.runId,
				provider: input.provider,
				status: "running",
				caseIds,
				artifactPaths: job.artifactPaths,
				createdAt: job.startedAt,
			}),
		);

		for (const evalCase of selectedEvalCases) {
			job.currentCaseId = evalCase.id;
			const sourcePacket = sourcePacketsById.get(evalCase.sourcePacketId);
			if (!sourcePacket) {
				throw new Error(
					`Eval case ${evalCase.id} references missing source packet ${evalCase.sourcePacketId}`,
				);
			}

			const result = await generateBriefing({
				sourcePacket,
				userRequest: evalCase.task,
				runId: job.runId,
				provider: input.provider,
			});
			const briefingPath = `runs/${job.runId}/briefings/${evalCase.id}.json`;
			const tracePath = `runs/${job.runId}/traces/${evalCase.id}.json`;
			await Promise.all([
				writeJsonArtifact(briefingPath, result.briefing),
				writeJsonArtifact(tracePath, result.trace),
			]);
			job.completedCases += 1;
			job.artifactPaths.push(briefingPath, tracePath);
		}

		job.status = "complete";
		job.currentCaseId = undefined;
		job.finishedAt = new Date().toISOString();
		await writeJsonArtifact(
			manifestPath,
			buildManifest({
				runId: job.runId,
				provider: input.provider,
				status: "complete",
				caseIds,
				artifactPaths: job.artifactPaths,
				createdAt: job.startedAt,
			}),
		);
	} catch (error) {
		job.status = "failed";
		job.error = error instanceof Error ? error.message : String(error);
		job.finishedAt = new Date().toISOString();
		if (manifestStarted) {
			await writeJsonArtifact(
				manifestPath,
				buildManifest({
					runId: job.runId,
					provider: input.provider,
					status: "failed",
					caseIds,
					artifactPaths: job.artifactPaths,
					createdAt: job.startedAt,
					error: job.error,
				}),
			);
		}
	}
}

async function countJsonFiles(relativeDir: string) {
	try {
		const entries = await readdir(absolutePath(relativeDir), {
			withFileTypes: true,
		});
		return entries.filter(
			(entry) => entry.isFile() && entry.name.endsWith(".json"),
		).length;
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
}

async function readRunManifest(runId: string) {
	try {
		return RunManifestSchema.parse(
			JSON.parse(
				await readFile(absolutePath(`runs/${runId}/manifest.json`), "utf8"),
			),
		);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return null;
		}

		throw error;
	}
}

async function refreshJobProgress(job: EvalRunJob) {
	const [manifest, completedCases] = await Promise.all([
		readRunManifest(job.runId),
		countJsonFiles(`runs/${job.runId}/evaluations`),
	]);

	job.completedCases = completedCases;
	if (manifest) {
		if (manifest.status === "complete" || manifest.status === "failed") {
			job.status = manifest.status;
		}
		job.totalCases = manifest.caseIds.length;
		job.artifactPaths = manifest.artifactPaths;
		job.error = manifest.error;
	}

	return job;
}

async function executeOpenAIEvalRun(jobId: string) {
	const job = jobs.get(jobId);
	if (!job) {
		return;
	}
	if (!process.env.OPENAI_API_KEY) {
		job.status = "failed";
		job.error =
			"OPENAI_API_KEY is required on the dev server before starting an OpenAI run.";
		job.finishedAt = new Date().toISOString();
		return;
	}

	job.status = "running";
	const child = spawn(
		"mise",
		[
			"exec",
			"--",
			"bun",
			"run",
			"eval:variant",
			"--provider=openai",
			"--evaluator=hybrid",
			`--run-id=${job.runId}`,
		],
		{
			cwd: repoRoot,
			env: process.env,
			stdio: ["ignore", "ignore", "pipe"],
		},
	);
	const stderrChunks: Buffer[] = [];

	child.stderr.on("data", (chunk: Buffer) => {
		stderrChunks.push(chunk);
	});
	child.on("error", (error) => {
		job.status = "failed";
		job.error = error.message;
		job.finishedAt = new Date().toISOString();
	});
	child.on("close", async (code) => {
		await refreshJobProgress(job);
		job.finishedAt = new Date().toISOString();
		if (code === 0) {
			job.status = "complete";
			return;
		}

		job.status = "failed";
		job.error =
			job.error ??
			Buffer.concat(stderrChunks).toString().trim() ??
			`OpenAI eval run exited with code ${code}`;
	});
}

export function startEvalRun(input: StartEvalRunInput = {}) {
	const now = new Date();
	const provider = input.provider ?? "openai";
	const runId = runIdFor(provider, now);
	const job: EvalRunJob = {
		id: runId,
		runId,
		provider,
		status: "queued",
		totalCases: input.caseIds?.length ?? 0,
		completedCases: 0,
		artifactPaths: [],
		startedAt: now.toISOString(),
	};
	jobs.set(job.id, job);

	void executeEvalRun(job.id, {
		caseIds: input.caseIds ?? [],
		includeHoldouts: input.includeHoldouts ?? false,
		provider,
	});

	return job;
}

export async function getEvalRun(jobId: string) {
	const job = jobs.get(jobId);

	if (!job) {
		throw new Error(`Unknown eval run job ${jobId}`);
	}

	return refreshJobProgress(job);
}
