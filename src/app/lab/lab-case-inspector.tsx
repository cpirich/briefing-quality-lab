"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { Badge } from "~/components/badge";
import { Card, CardBody, CardHeader } from "~/components/card";
import { cn } from "~/lib/utils";
import type { CaseBreakdownEntry } from "~/run-store";

function formatScore(value: number | null | undefined) {
	return typeof value === "number" ? value.toFixed(2) : "n/a";
}

function formatDelta(value: number | null) {
	if (value === null) {
		return "n/a";
	}

	const sign = value >= 0 ? "+" : "";
	return `${sign}${value.toFixed(2)}`;
}

function formatTargetGap(value: number | null) {
	if (value === null) {
		return "n/a";
	}

	if (value <= 0) {
		return `✓ ${Math.abs(value).toFixed(2)}`;
	}

	return `gap ${value.toFixed(2)}`;
}

function deltaTone(value: number | null) {
	if (value === null) {
		return "slate" as const;
	}
	if (value > 0.03) {
		return "green" as const;
	}
	if (value < -0.03) {
		return "red" as const;
	}
	return "amber" as const;
}

function targetGapTone(value: number | null) {
	if (value === null) {
		return "slate" as const;
	}
	if (value > 0) {
		return "amber" as const;
	}
	return "green" as const;
}

function changeTone(value: number | null, changeLabel: string) {
	return changeLabel === "Gap" ? targetGapTone(value) : deltaTone(value);
}

function targetGapBadgeTone(value: number | null) {
	return targetGapTone(value);
}

interface LabCaseInspectorProps {
	baselineLabel: string;
	candidateLabel: string;
	caseBreakdown: CaseBreakdownEntry[];
	changeLabel: string;
}

type CaseArtifactDetail = NonNullable<
	CaseBreakdownEntry["diff"]["baselineDetail"]
>;
type CaseScoreSummary = NonNullable<CaseBreakdownEntry["baseline"]>;

const scoreMetrics = [
	["Overall", "overall"],
	["Grounding", "grounding"],
	["Coverage", "coverage"],
	["Citation support", "citationSupport"],
] as const;

function CitationPills({ citations }: { citations: string[] }) {
	if (citations.length === 0) {
		return null;
	}

	return (
		<span className="mt-1 flex flex-wrap gap-1">
			{citations.map((citation) => (
				<Badge key={citation}>{citation}</Badge>
			))}
		</span>
	);
}

function DetailList({ empty, items }: { empty: string; items: string[] }) {
	if (items.length === 0) {
		return <p className="text-[var(--muted-foreground)] text-xs">{empty}</p>;
	}

	return (
		<ul className="space-y-1.5">
			{items.map((item) => (
				<li className="text-sm" key={item}>
					{item}
				</li>
			))}
		</ul>
	);
}

function comparisonToneClasses(tone: "danger" | "success") {
	return tone === "danger"
		? {
				border: "border-[var(--danger-border)]",
				background: "bg-[var(--danger)]",
				foreground: "text-[var(--danger-foreground)]",
			}
		: {
				border: "border-[var(--success-border)]",
				background: "bg-[var(--success)]",
				foreground: "text-[var(--success-foreground)]",
			};
}

function ComparisonCell({
	children,
	description,
	label,
	tone,
}: {
	children: ReactNode;
	description?: string;
	label: string;
	tone: "danger" | "success";
}) {
	const toneClasses = comparisonToneClasses(tone);

	return (
		<div
			className={cn(
				"rounded-md border p-3",
				toneClasses.border,
				toneClasses.background,
			)}
		>
			<p
				className={cn("font-medium text-xs uppercase", toneClasses.foreground)}
			>
				{label}
			</p>
			{description ? (
				<p className="mt-1 text-[var(--muted-foreground)] text-xs">
					{description}
				</p>
			) : null}
			<div className="mt-2">{children}</div>
		</div>
	);
}

function CollapsibleEvaluatorSection({
	children,
	title,
}: {
	children: ReactNode;
	title: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const panelId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

	return (
		<div className="rounded-md border border-[var(--border)] bg-[var(--muted)]">
			<button
				aria-controls={panelId}
				aria-expanded={isOpen}
				className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 p-3 text-left"
				onClick={() => setIsOpen((current) => !current)}
				type="button"
			>
				<span className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className={cn(
							"text-[var(--muted-foreground)] transition-transform",
							isOpen && "rotate-90",
						)}
					>
						{">"}
					</span>
					<span className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
						{title}
					</span>
				</span>
				<Badge tone="blue">{isOpen ? "hide" : "show"}</Badge>
			</button>
			{isOpen ? (
				<div className="border-[var(--border)] border-t p-3" id={panelId}>
					{children}
				</div>
			) : null}
		</div>
	);
}

function scoreNoteFor(label: string) {
	if (label === "Reference target") {
		return "Human-authored target scores.";
	}

	return "Scores from this run's evaluator artifact.";
}

function evidenceNoteFor(label: string) {
	if (label === "Reference target") {
		return "Human-authored reference rationale.";
	}
	if (label === "Generated baseline") {
		return "Deterministic heuristic notes.";
	}

	return "Evaluator rationale for this run.";
}

function citationNoteFor(label: string) {
	if (label === "Reference target") {
		return "Human-authored support rationale.";
	}
	if (label === "Generated baseline") {
		return "Accepted-citation validator notes.";
	}

	return "Citation support notes from this run.";
}

function BriefingComparisonSection({
	baseline,
	baselineLabel,
	candidate,
	candidateLabel,
	children,
	heading,
}: {
	baseline: CaseArtifactDetail | null;
	baselineLabel: string;
	candidate: CaseArtifactDetail | null;
	candidateLabel: string;
	children: (detail: CaseArtifactDetail | null) => ReactNode;
	heading: string;
}) {
	return (
		<section className="space-y-2">
			<h3 className="font-semibold text-sm">{heading}</h3>
			<div className="grid gap-3 lg:grid-cols-2">
				<ComparisonCell label={baselineLabel} tone="danger">
					{children(baseline)}
				</ComparisonCell>
				<ComparisonCell label={candidateLabel} tone="success">
					{children(candidate)}
				</ComparisonCell>
			</div>
		</section>
	);
}

function ClaimsList({ detail }: { detail: CaseArtifactDetail | null }) {
	if (!detail) {
		return <p className="text-sm">No briefing artifact available.</p>;
	}

	if (detail.claims.length === 0) {
		return (
			<p className="text-[var(--muted-foreground)] text-xs">
				No claims available.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{detail.claims.map((claim) => (
				<div
					className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2"
					key={`${claim.text}-${claim.citations.join("-")}`}
				>
					<p className="text-sm">{claim.text}</p>
					<CitationPills citations={claim.citations} />
				</div>
			))}
		</div>
	);
}

function CitationSupportNotes({
	detail,
}: {
	detail: CaseArtifactDetail | null;
}) {
	if (!detail) {
		return <p className="text-sm">No evaluator artifact available.</p>;
	}

	if (detail.citationSupport.length === 0) {
		return (
			<p className="text-[var(--muted-foreground)] text-xs">
				No citation support notes available.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{detail.citationSupport.map((support) => (
				<div
					className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2"
					key={`${support.citation}-${support.note}`}
				>
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-sm">{support.citation}</span>
						<Badge tone={support.supported ? "green" : "amber"}>
							{support.supported ? "supported" : "needs review"}
						</Badge>
					</div>
					<p className="mt-1 text-sm">{support.note}</p>
				</div>
			))}
		</div>
	);
}

function hardCheckTone(status: "pass" | "warn" | "fail") {
	if (status === "pass") {
		return "green" as const;
	}
	if (status === "fail") {
		return "red" as const;
	}
	return "amber" as const;
}

function supportTone(status: string) {
	if (status === "supported" || status === "answers-task") {
		return "green" as const;
	}
	if (status === "unsupported" || status === "misses-task") {
		return "red" as const;
	}
	return "amber" as const;
}

function formatUsd(value: number | null) {
	return value === null ? "unknown" : `$${value.toFixed(2)}`;
}

function hardCheckValueForDisplay(
	check: CaseArtifactDetail["hardChecks"][number],
) {
	if (check.id !== "cost-metadata" || check.value === "unknown") {
		return check.value;
	}

	const amount = Number.parseFloat(check.value.replace(/^\$/, ""));
	return Number.isFinite(amount) ? formatUsd(amount) : check.value;
}

function EvaluatorMetadataSummary({
	detail,
}: {
	detail: CaseArtifactDetail | null;
}) {
	if (!detail?.evaluator) {
		return <p className="text-sm">No evaluator metadata available.</p>;
	}

	const evaluator = detail.evaluator;

	return (
		<div className="space-y-2 text-sm">
			<div className="flex flex-wrap gap-1.5">
				<Badge tone={evaluator.mode === "hybrid" ? "blue" : "slate"}>
					{evaluator.mode}
				</Badge>
				<Badge>{evaluator.provider}</Badge>
			</div>
			<dl className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-x-3 gap-y-1">
				<dt className="text-[var(--muted-foreground)]">Model</dt>
				<dd className="break-words font-medium">{evaluator.model}</dd>
				<dt className="text-[var(--muted-foreground)]">Prompt</dt>
				<dd>{evaluator.promptVersion}</dd>
				<dt className="text-[var(--muted-foreground)]">Latency</dt>
				<dd>{(evaluator.latencyMs / 1000).toFixed(1)}s</dd>
				<dt className="text-[var(--muted-foreground)]">Tokens</dt>
				<dd>
					{evaluator.inputTokens} in / {evaluator.cachedInputTokens} cached /{" "}
					{evaluator.outputTokens} out
				</dd>
				<dt className="text-[var(--muted-foreground)]">Judge cost</dt>
				<dd>{formatUsd(evaluator.estimatedUsd)}</dd>
			</dl>
		</div>
	);
}

function HardCheckList({ detail }: { detail: CaseArtifactDetail | null }) {
	if (!detail) {
		return <p className="text-sm">No evaluator artifact available.</p>;
	}
	if (detail.hardChecks.length === 0) {
		return (
			<p className="text-[var(--muted-foreground)] text-xs">
				No hard-check output available.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{detail.hardChecks.map((check) => (
				<div
					className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2"
					key={check.id}
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="font-medium text-sm">{check.label}</p>
						<Badge tone={hardCheckTone(check.status)}>{check.status}</Badge>
					</div>
					<p className="mt-1 text-sm">{hardCheckValueForDisplay(check)}</p>
					{check.expectation || check.threshold || check.note ? (
						<p className="mt-1 text-[var(--muted-foreground)] text-xs">
							{[check.expectation, check.threshold, check.note]
								.filter(Boolean)
								.join(" ")}
						</p>
					) : null}
				</div>
			))}
		</div>
	);
}

function ClaimJudgmentList({ detail }: { detail: CaseArtifactDetail | null }) {
	if (!detail) {
		return <p className="text-sm">No evaluator artifact available.</p>;
	}
	if (detail.claimJudgments.length === 0) {
		return (
			<p className="text-[var(--muted-foreground)] text-xs">
				No claim-level LLM judgments available.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{detail.claimJudgments.map((judgment) => (
				<div
					className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2"
					key={`${judgment.claimText}-${judgment.citedSourceIds.join("-")}`}
				>
					<div className="flex flex-wrap items-center gap-2">
						<Badge tone={supportTone(judgment.supportStatus)}>
							{judgment.supportStatus}
						</Badge>
						<CitationPills citations={judgment.citedSourceIds} />
					</div>
					<p className="mt-2 text-sm">{judgment.claimText}</p>
					<p className="mt-1 text-[var(--muted-foreground)] text-xs">
						{judgment.explanation}
					</p>
					{judgment.missingEvidence.length > 0 ? (
						<p className="mt-1 text-[var(--warning-foreground)] text-xs">
							Missing: {judgment.missingEvidence.join("; ")}
						</p>
					) : null}
				</div>
			))}
		</div>
	);
}

function RecommendationJudgment({
	detail,
}: {
	detail: CaseArtifactDetail | null;
}) {
	const judgment = detail?.recommendationJudgment;
	if (!judgment) {
		return (
			<p className="text-[var(--muted-foreground)] text-xs">
				No recommendation LLM judgment available.
			</p>
		);
	}

	return (
		<div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2 text-sm">
			<div className="flex flex-wrap gap-1.5">
				<Badge tone={supportTone(judgment.taskAnswerStatus)}>
					{judgment.taskAnswerStatus}
				</Badge>
				<Badge
					tone={
						judgment.overconfidenceStatus === "calibrated" ? "green" : "amber"
					}
				>
					{judgment.overconfidenceStatus}
				</Badge>
			</div>
			<p className="mt-2">{judgment.explanation}</p>
			{judgment.missingImportantEvidence.length > 0 ? (
				<p className="mt-1 text-[var(--warning-foreground)] text-xs">
					Missing: {judgment.missingImportantEvidence.join("; ")}
				</p>
			) : null}
		</div>
	);
}

function ScoreSummary({ scores }: { scores: CaseScoreSummary | null }) {
	if (!scores) {
		return <p className="text-sm">No evaluator scores available.</p>;
	}

	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{scoreMetrics.map(([label, metric]) => (
				<div
					className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2"
					key={metric}
				>
					<p className="text-[var(--muted-foreground)] text-xs">{label}</p>
					<p className="font-semibold text-lg">{formatScore(scores[metric])}</p>
				</div>
			))}
		</div>
	);
}

function ReferenceTargetYardstick({
	referenceTargetDetail,
	referenceTargetScores,
	gapToTarget,
}: {
	referenceTargetDetail: CaseArtifactDetail | null;
	referenceTargetScores: CaseScoreSummary | null;
	gapToTarget: CaseBreakdownEntry["gapToTarget"];
}) {
	if (!referenceTargetScores && !referenceTargetDetail) {
		return null;
	}

	return (
		<div className="rounded-md border border-[var(--info-border)] bg-[var(--info)] p-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h3 className="font-semibold text-[var(--info-foreground)] text-sm">
						Reference target yardstick
					</h3>
					<p className="text-[var(--muted-foreground)] text-sm">
						Target scores and rationale for this selected case.
					</p>
				</div>
				<div className="flex flex-wrap gap-1.5">
					<Badge tone={targetGapBadgeTone(gapToTarget.overall)}>
						Overall {formatTargetGap(gapToTarget.overall)}
					</Badge>
					<Badge tone={targetGapBadgeTone(gapToTarget.citationSupport)}>
						Citations {formatTargetGap(gapToTarget.citationSupport)}
					</Badge>
				</div>
			</div>
			<div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
				<ScoreSummary scores={referenceTargetScores} />
				<div className="space-y-2">
					{referenceTargetDetail?.recommendation ? (
						<div>
							<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
								Target recommendation
							</p>
							<p className="mt-1 text-sm">
								{referenceTargetDetail.recommendation}
							</p>
						</div>
					) : null}
					<DetailList
						empty="No target rationale available."
						items={referenceTargetDetail?.rubricEvidence ?? []}
					/>
				</div>
			</div>
		</div>
	);
}

function ArtifactPathList({ detail }: { detail: CaseArtifactDetail | null }) {
	if (!detail) {
		return <p>No evaluator artifact available.</p>;
	}

	if (detail.artifactPaths.length === 0) {
		return <p>No artifact paths available.</p>;
	}

	return (
		<div className="space-y-1 font-mono text-[var(--muted-foreground)] text-xs">
			{detail.artifactPaths.map((artifactPath) => (
				<p key={artifactPath}>{artifactPath}</p>
			))}
		</div>
	);
}

function EvaluatorOutputPanel({
	baselineScores,
	baselineDetail,
	baselineLabel,
	candidateScores,
	candidateDetail,
	candidateLabel,
}: {
	baselineScores: CaseScoreSummary | null;
	baselineDetail: CaseArtifactDetail | null;
	baselineLabel: string;
	candidateScores: CaseScoreSummary | null;
	candidateDetail: CaseArtifactDetail | null;
	candidateLabel: string;
}) {
	return (
		<div className="space-y-3">
			<CollapsibleEvaluatorSection title="Evaluator metadata">
				<div className="grid gap-3 lg:grid-cols-2">
					<ComparisonCell label={baselineLabel} tone="danger">
						<EvaluatorMetadataSummary detail={baselineDetail} />
					</ComparisonCell>
					<ComparisonCell label={candidateLabel} tone="success">
						<EvaluatorMetadataSummary detail={candidateDetail} />
					</ComparisonCell>
				</div>
			</CollapsibleEvaluatorSection>

			<div>
				<p className="mb-2 font-medium text-[var(--muted-foreground)] text-xs uppercase">
					Deterministic hard checks
				</p>
				<div className="grid gap-3 lg:grid-cols-2">
					<ComparisonCell label={baselineLabel} tone="danger">
						<HardCheckList detail={baselineDetail} />
					</ComparisonCell>
					<ComparisonCell label={candidateLabel} tone="success">
						<HardCheckList detail={candidateDetail} />
					</ComparisonCell>
				</div>
			</div>

			<div>
				<p className="mb-2 font-medium text-[var(--muted-foreground)] text-xs uppercase">
					Structured evaluator scores
				</p>
				<div className="grid gap-3 lg:grid-cols-2">
					<ComparisonCell
						description={scoreNoteFor(baselineLabel)}
						label={baselineLabel}
						tone="danger"
					>
						<ScoreSummary scores={baselineScores} />
					</ComparisonCell>
					<ComparisonCell
						description={scoreNoteFor(candidateLabel)}
						label={candidateLabel}
						tone="success"
					>
						<ScoreSummary scores={candidateScores} />
					</ComparisonCell>
				</div>
			</div>

			<div>
				<p className="mb-2 font-medium text-[var(--muted-foreground)] text-xs uppercase">
					Evaluator rationale
				</p>
				<div className="grid gap-3 lg:grid-cols-2">
					<ComparisonCell
						description={evidenceNoteFor(baselineLabel)}
						label={baselineLabel}
						tone="danger"
					>
						<DetailList
							empty="No evaluator rationale available."
							items={baselineDetail?.rubricEvidence ?? []}
						/>
					</ComparisonCell>
					<ComparisonCell
						description={evidenceNoteFor(candidateLabel)}
						label={candidateLabel}
						tone="success"
					>
						<DetailList
							empty="No evaluator rationale available."
							items={candidateDetail?.rubricEvidence ?? []}
						/>
					</ComparisonCell>
				</div>
			</div>

			<div>
				<p className="mb-2 font-medium text-[var(--muted-foreground)] text-xs uppercase">
					Claim-level LLM judgments
				</p>
				<div className="grid gap-3 lg:grid-cols-2">
					<ComparisonCell label={baselineLabel} tone="danger">
						<ClaimJudgmentList detail={baselineDetail} />
					</ComparisonCell>
					<ComparisonCell label={candidateLabel} tone="success">
						<ClaimJudgmentList detail={candidateDetail} />
					</ComparisonCell>
				</div>
			</div>

			<div>
				<p className="mb-2 font-medium text-[var(--muted-foreground)] text-xs uppercase">
					Recommendation judgment
				</p>
				<div className="grid gap-3 lg:grid-cols-2">
					<ComparisonCell label={baselineLabel} tone="danger">
						<RecommendationJudgment detail={baselineDetail} />
					</ComparisonCell>
					<ComparisonCell label={candidateLabel} tone="success">
						<RecommendationJudgment detail={candidateDetail} />
					</ComparisonCell>
				</div>
			</div>

			<div>
				<p className="mb-2 font-medium text-[var(--muted-foreground)] text-xs uppercase">
					Citation support checks
				</p>
				<div className="grid gap-3 lg:grid-cols-2">
					<ComparisonCell
						description={citationNoteFor(baselineLabel)}
						label={baselineLabel}
						tone="danger"
					>
						<CitationSupportNotes detail={baselineDetail} />
					</ComparisonCell>
					<ComparisonCell
						description={citationNoteFor(candidateLabel)}
						label={candidateLabel}
						tone="success"
					>
						<CitationSupportNotes detail={candidateDetail} />
					</ComparisonCell>
				</div>
			</div>
		</div>
	);
}

function ArtifactComparisonPanel({
	baselineDetail,
	baselineLabel,
	candidateDetail,
	candidateLabel,
}: {
	baselineDetail: CaseArtifactDetail | null;
	baselineLabel: string;
	candidateDetail: CaseArtifactDetail | null;
	candidateLabel: string;
}) {
	return (
		<div className="grid gap-3 lg:grid-cols-2">
			<ComparisonCell label={baselineLabel} tone="danger">
				<ArtifactPathList detail={baselineDetail} />
			</ComparisonCell>
			<ComparisonCell label={candidateLabel} tone="success">
				<ArtifactPathList detail={candidateDetail} />
			</ComparisonCell>
		</div>
	);
}

function EmptyBriefingValue({ label }: { label: string }) {
	return (
		<p className="text-[var(--muted-foreground)] text-sm">
			No {label} available.
		</p>
	);
}

function CaseArtifactPanel({
	baselineDetail,
	baselineLabel,
	candidateDetail,
	candidateLabel,
}: {
	baselineDetail: CaseArtifactDetail | null;
	baselineLabel: string;
	candidateDetail: CaseArtifactDetail | null;
	candidateLabel: string;
}) {
	return (
		<div className="space-y-4">
			<BriefingComparisonSection
				baseline={baselineDetail}
				baselineLabel={baselineLabel}
				candidate={candidateDetail}
				candidateLabel={candidateLabel}
				heading="Title and summary"
			>
				{(detail) =>
					detail ? (
						<div>
							<h4 className="font-semibold text-sm">{detail.title}</h4>
							<p className="mt-1 text-sm">{detail.summary}</p>
						</div>
					) : (
						<EmptyBriefingValue label="briefing summary" />
					)
				}
			</BriefingComparisonSection>

			<BriefingComparisonSection
				baseline={baselineDetail}
				baselineLabel={baselineLabel}
				candidate={candidateDetail}
				candidateLabel={candidateLabel}
				heading="Recommendation"
			>
				{(detail) =>
					detail ? (
						<p className="text-sm">{detail.recommendation}</p>
					) : (
						<EmptyBriefingValue label="recommendation" />
					)
				}
			</BriefingComparisonSection>

			<BriefingComparisonSection
				baseline={baselineDetail}
				baselineLabel={baselineLabel}
				candidate={candidateDetail}
				candidateLabel={candidateLabel}
				heading="Claims and citations"
			>
				{(detail) => <ClaimsList detail={detail} />}
			</BriefingComparisonSection>

			<BriefingComparisonSection
				baseline={baselineDetail}
				baselineLabel={baselineLabel}
				candidate={candidateDetail}
				candidateLabel={candidateLabel}
				heading="Open questions"
			>
				{(detail) =>
					detail ? (
						<DetailList
							empty="No open questions available."
							items={detail.openQuestions}
						/>
					) : (
						<EmptyBriefingValue label="open questions" />
					)
				}
			</BriefingComparisonSection>
		</div>
	);
}

export function LabCaseInspector({
	baselineLabel,
	candidateLabel,
	caseBreakdown,
	changeLabel,
}: LabCaseInspectorProps) {
	const [selectedCaseId, setSelectedCaseId] = useState(
		caseBreakdown[0]?.caseId ?? "",
	);
	const selectedCase = useMemo(
		() =>
			caseBreakdown.find((entry) => entry.caseId === selectedCaseId) ??
			caseBreakdown[0],
		[caseBreakdown, selectedCaseId],
	);

	if (!selectedCase) {
		return null;
	}

	const changeLabelLower = changeLabel.toLowerCase();
	const hasReferenceTarget = caseBreakdown.some(
		(entry) => entry.referenceTarget,
	);

	return (
		<div className="grid gap-4">
			<Card>
				<CardHeader>
					<h2 className="font-semibold text-base">Case Breakdown</h2>
					<p className="text-[var(--muted-foreground)] text-sm">
						Select a row to inspect that case in the diff below.
					</p>
				</CardHeader>
				<CardBody className="space-y-5">
					<div className="overflow-x-auto rounded-md border border-[var(--border)]">
						<table
							className={cn(
								"w-full text-left text-sm",
								hasReferenceTarget ? "min-w-[1080px]" : "min-w-[920px]",
							)}
						>
							<thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
								<tr>
									<th className="px-3 py-2 font-medium">Case</th>
									<th className="px-3 py-2 font-medium">Themes</th>
									<th className="px-3 py-2 font-medium">{baselineLabel}</th>
									<th className="px-3 py-2 font-medium">{candidateLabel}</th>
									{hasReferenceTarget ? (
										<th className="px-3 py-2 font-medium">Reference target</th>
									) : null}
									<th className="px-3 py-2 font-medium">
										Overall {changeLabelLower}
									</th>
									<th className="px-3 py-2 font-medium">
										Citation {changeLabelLower}
									</th>
									{hasReferenceTarget ? (
										<th className="px-3 py-2 font-medium">Target gap</th>
									) : null}
								</tr>
							</thead>
							<tbody>
								{caseBreakdown.map((entry) => {
									const isSelected = entry.caseId === selectedCase.caseId;

									return (
										<tr
											aria-selected={isSelected}
											className={cn(
												"cursor-pointer border-[var(--border)] border-t align-top transition-colors hover:bg-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-[-2px]",
												isSelected && "bg-[var(--info)]",
											)}
											key={entry.caseId}
											onClick={() => setSelectedCaseId(entry.caseId)}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.preventDefault();
													setSelectedCaseId(entry.caseId);
												}
											}}
											tabIndex={0}
										>
											<td className="max-w-56 px-3 py-2">
												<p className="font-medium text-[var(--foreground)]">
													{entry.title}
												</p>
												<p className="mt-1 font-mono text-[var(--muted-foreground)] text-xs">
													{entry.caseId}
												</p>
											</td>
											<td className="max-w-48 px-3 py-2 text-[var(--muted-foreground)] text-xs">
												{entry.failureTags.join(", ") || "n/a"}
											</td>
											<td className="px-3 py-2">
												<p className="font-semibold">
													{formatScore(entry.baseline?.overall)}
												</p>
												<p className="text-[var(--muted-foreground)] text-xs">
													citations{" "}
													{formatScore(entry.baseline?.citationSupport)}
												</p>
											</td>
											<td className="px-3 py-2">
												<p className="font-semibold">
													{formatScore(entry.candidate?.overall)}
												</p>
												<p className="text-[var(--muted-foreground)] text-xs">
													citations{" "}
													{formatScore(entry.candidate?.citationSupport)}
												</p>
											</td>
											{hasReferenceTarget ? (
												<td className="px-3 py-2">
													<p className="font-semibold">
														{formatScore(entry.referenceTarget?.overall)}
													</p>
													<p className="text-[var(--muted-foreground)] text-xs">
														citations{" "}
														{formatScore(
															entry.referenceTarget?.citationSupport,
														)}
													</p>
												</td>
											) : null}
											<td className="px-3 py-2">
												<Badge
													tone={changeTone(entry.delta.overall, changeLabel)}
												>
													{formatDelta(entry.delta.overall)}
												</Badge>
											</td>
											<td className="px-3 py-2">
												<Badge
													tone={changeTone(
														entry.delta.citationSupport,
														changeLabel,
													)}
												>
													{formatDelta(entry.delta.citationSupport)}
												</Badge>
											</td>
											{hasReferenceTarget ? (
												<td className="px-3 py-2">
													<div className="flex flex-col items-start gap-1">
														<Badge
															tone={targetGapBadgeTone(
																entry.gapToTarget.overall,
															)}
														>
															Overall{" "}
															{formatTargetGap(entry.gapToTarget.overall)}
														</Badge>
														<Badge
															tone={targetGapBadgeTone(
																entry.gapToTarget.citationSupport,
															)}
														>
															Citations{" "}
															{formatTargetGap(
																entry.gapToTarget.citationSupport,
															)}
														</Badge>
													</div>
												</td>
											) : null}
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					<div className="space-y-5 rounded-md border border-[var(--border)] bg-[var(--muted)]/50 p-3">
						<div className="border-[var(--border)] border-b pb-3">
							<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
								Selected case drill-down
							</p>
							<h3 className="mt-1 font-semibold text-sm">
								{selectedCase.title}
							</h3>
							<p className="text-[var(--muted-foreground)] text-sm">
								Eval context first, then briefing output differences by shared
								section.
							</p>
						</div>

						<section className="space-y-3">
							<div>
								<h3 className="font-semibold text-sm">Eval context</h3>
								<p className="text-[var(--muted-foreground)] text-sm">
									Eval-case expectations and evaluator outputs used to score
									this case.
								</p>
							</div>

							<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
								<div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
									<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
										Expected coverage point
									</p>
									<p className="mt-1 text-sm">{selectedCase.sourceEvidence}</p>
								</div>
								<div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
									<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
										Planned eval themes
									</p>
									<div className="mt-2 flex flex-wrap gap-1.5">
										{selectedCase.failureTags.length === 0 ? (
											<span className="text-[var(--muted-foreground)] text-xs">
												No planned themes
											</span>
										) : (
											selectedCase.failureTags.map((tag) => (
												<Badge key={tag}>{tag}</Badge>
											))
										)}
									</div>
								</div>
							</div>

							<div className="rounded-md border border-[var(--info-border)] bg-[var(--info)] p-3">
								<p className="font-medium text-[var(--info-foreground)] text-xs uppercase">
									Comparison note
								</p>
								<p className="mt-1 text-sm">
									{selectedCase.diff.evaluatorNote}
								</p>
							</div>

							<ReferenceTargetYardstick
								gapToTarget={selectedCase.gapToTarget}
								referenceTargetDetail={selectedCase.diff.referenceTargetDetail}
								referenceTargetScores={selectedCase.referenceTarget}
							/>

							<EvaluatorOutputPanel
								baselineDetail={selectedCase.diff.baselineDetail}
								baselineLabel={baselineLabel}
								baselineScores={selectedCase.baseline}
								candidateDetail={selectedCase.diff.candidateDetail}
								candidateLabel={candidateLabel}
								candidateScores={selectedCase.candidate}
							/>

							<div>
								<p className="mb-2 font-medium text-[var(--muted-foreground)] text-xs uppercase">
									Per-case artifact paths
								</p>
								<ArtifactComparisonPanel
									baselineDetail={selectedCase.diff.baselineDetail}
									baselineLabel={baselineLabel}
									candidateDetail={selectedCase.diff.candidateDetail}
									candidateLabel={candidateLabel}
								/>
							</div>
						</section>

						<div className="border-[var(--border)] border-t" />

						<div>
							<h3 className="font-semibold text-sm">Briefing comparison</h3>
							<p className="text-[var(--muted-foreground)] text-sm">
								Briefing artifact content grouped by matching fields so the two
								outputs can be compared directly.
							</p>
						</div>

						<CaseArtifactPanel
							baselineDetail={selectedCase.diff.baselineDetail}
							baselineLabel={baselineLabel}
							candidateDetail={selectedCase.diff.candidateDetail}
							candidateLabel={candidateLabel}
						/>
					</div>
				</CardBody>
			</Card>
		</div>
	);
}
