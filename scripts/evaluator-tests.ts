import assert from "node:assert/strict";

import {
	buildHybridJudgePrompt,
	evaluateBriefing,
	type HybridJudgeResult,
} from "~/lab/evaluator";
import type {
	BriefingOutput,
	EvalCase,
	GenerationTrace,
	SourcePacket,
} from "~/schemas";

const sourcePacket: SourcePacket = {
	id: "packet-hybrid-eval",
	title: "Hybrid Eval Packet",
	summary: "Synthetic packet for evaluator tests.",
	caseId: "case-hybrid-eval",
	sources: [
		{
			id: "A1",
			title: "Rollout memo",
			body: "The rollout memo says support queues are the primary blocker and recommends a staged release with staff review before broad enablement.",
		},
		{
			id: "A2",
			title: "Cost note",
			body: "The cost note says the team can stay under budget if live monitoring and cached inputs remain enabled during the pilot.",
		},
	],
	metadata: {
		theme: "hybrid-evaluator",
		synthetic: true,
		publicSafe: true,
	},
};

const evalCase: EvalCase = {
	id: "case-hybrid-eval",
	title: "Hybrid evaluator test case",
	sourcePacketId: sourcePacket.id,
	task: "Recommend whether to proceed with a staged rollout.",
	expectedCoverage: ["Support queues are the primary blocker."],
	traps: ["Do not claim broad launch is risk-free."],
	acceptedCitations: ["A1", "A2"],
	holdout: false,
	demoHighlight: false,
	failureTags: ["overconfidence"],
	metadata: {
		synthetic: true,
		publicSafe: true,
	},
};

const briefing: BriefingOutput = {
	id: "case-hybrid-eval-openai",
	sourcePacketId: sourcePacket.id,
	caseId: evalCase.id,
	title: "Rollout Briefing",
	summary: "Support queues are the main blocker for the rollout.",
	claims: [
		{
			text: "Support queues are the primary blocker for rollout.",
			citations: ["A1"],
		},
		{
			text: "The pilot can stay under budget with monitoring.",
			citations: ["A2"],
		},
	],
	openQuestions: ["Confirm staffing coverage before broad release."],
	recommendation: "Proceed with a staged rollout after staff review.",
	metadata: {
		variant: "OpenAI Responses",
		runId: "hybrid-test-run",
		model: "gpt-5.2",
	},
};

const trace: GenerationTrace = {
	id: "case-hybrid-eval-openai-trace",
	runId: "hybrid-test-run",
	caseId: evalCase.id,
	sourcePacketId: sourcePacket.id,
	input: {
		userRequest: evalCase.task,
		sourcePacketPath: `data/source-packets/${sourcePacket.id}.json`,
	},
	messages: [
		{
			role: "system",
			content: "Return a short briefing with source citations.",
		},
		{
			role: "user",
			content: "Recommend whether to proceed with a staged rollout.",
		},
	],
	model: {
		provider: "openai",
		name: "gpt-5.2",
		settings: {
			promptVersion: "openai-responses-v1",
			maxOutputTokens: null,
			structuredOutputName: "briefing_genie_output",
			textVerbosity: null,
			reasoningEffort: null,
			reasoningSummary: null,
			temperature: null,
			topP: null,
			truncation: null,
			toolChoice: null,
			parallelToolCalls: null,
		},
	},
	output: briefing,
	toolCalls: [],
	cost: {
		inputTokens: 100,
		cachedInputTokens: 0,
		outputTokens: 80,
		estimatedUsd: 0.001,
	},
	latencyMs: 1200,
	artifactPaths: [`data/source-packets/${sourcePacket.id}.json`],
};

function judgeResult(
	supportStatus: HybridJudgeResult["claimJudgments"][number]["supportStatus"],
	overconfidenceStatus: HybridJudgeResult["recommendationJudgment"]["overconfidenceStatus"] = "calibrated",
	missingImportantEvidence: string[] = [],
): HybridJudgeResult {
	return {
		claimJudgments: briefing.claims.map((claim) => ({
			claimText: claim.text,
			citedSourceIds: claim.citations,
			supportStatus,
			supportingEvidenceIds:
				supportStatus === "unsupported" ? [] : claim.citations,
			missingEvidence:
				supportStatus === "supported"
					? []
					: ["Needs clearer evidence for the full scope of the claim."],
			explanation: `${claim.citations.join(", ")} ${supportStatus} the claim.`,
			failureTags:
				supportStatus === "supported" ? [] : [`${supportStatus}-claim`],
		})),
		recommendationJudgment: {
			taskAnswerStatus:
				missingImportantEvidence.length > 0
					? "partially-answers-task"
					: "answers-task",
			overconfidenceStatus,
			missingImportantEvidence,
			explanation: "The recommendation is judged against the user task.",
			failureTags:
				overconfidenceStatus === "calibrated"
					? []
					: ["overconfident-recommendation"],
		},
	};
}

async function evaluateWith(judgment: HybridJudgeResult) {
	return evaluateBriefing({
		runId: "hybrid-test-run",
		evalCase,
		sourcePacket,
		briefing,
		trace,
		mode: "hybrid",
		judgeModel: "gpt-5.2",
		judge: async () => judgment,
	});
}

const supported = await evaluateWith(judgeResult("supported"));
assert.equal(supported.evaluator?.mode, "hybrid");
assert.equal(supported.scores.citationSupport, 1);
assert.equal(supported.claimJudgments?.[0]?.supportStatus, "supported");

const partial = await evaluateWith(judgeResult("partially-supported"));
assert(partial.scores.citationSupport < supported.scores.citationSupport);
assert(partial.failureTags.includes("partial-claim-support"));

const unsupported = await evaluateWith(judgeResult("unsupported"));
assert(unsupported.scores.citationSupport < partial.scores.citationSupport);
assert(unsupported.failureTags.includes("unsupported-claim"));

const missingEvidence = await evaluateWith(
	judgeResult("supported", "calibrated", [
		"Missing staff-capacity evidence from the packet.",
	]),
);
assert(missingEvidence.scores.coverage < supported.scores.coverage);

const overconfident = await evaluateWith(
	judgeResult("supported", "overconfident"),
);
assert(overconfident.failureTags.includes("overconfidence"));
assert(overconfident.scores.overall < supported.scores.overall);

const prompt = buildHybridJudgePrompt({
	sourcePacket,
	userTask: evalCase.task,
	briefing,
	citedSourceIds: ["A1", "A2"],
	hardChecks: [],
});
for (const forbidden of [
	"expectedCoverage",
	"traps",
	"acceptedCitations",
	"holdout",
	"demoHighlight",
	"failureTags",
]) {
	assert(!prompt.includes(forbidden), `Prompt leaked ${forbidden}`);
}

console.log("Hybrid evaluator mocked tests passed.");
