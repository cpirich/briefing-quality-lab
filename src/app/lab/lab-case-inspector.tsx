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
	if (value > 0.03) {
		return "amber" as const;
	}
	if (value >= -0.03) {
		return "green" as const;
	}
	return "blue" as const;
}

function changeTone(value: number | null, changeLabel: string) {
	return changeLabel === "Gap" ? targetGapTone(value) : deltaTone(value);
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
	label,
	tone,
}: {
	children: ReactNode;
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
			<div className="mt-2">{children}</div>
		</div>
	);
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
							{support.supported ? "accepted" : "not accepted"}
						</Badge>
					</div>
					<p className="mt-1 text-sm">{support.note}</p>
				</div>
			))}
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
		<div className="space-y-3">
			<div>
				<p className="mb-2 font-medium text-[var(--muted-foreground)] text-xs uppercase">
					Evaluator evidence
				</p>
				<div className="grid gap-3 lg:grid-cols-2">
					<ComparisonCell label={baselineLabel} tone="danger">
						<DetailList
							empty="No evaluator evidence available."
							items={baselineDetail?.rubricEvidence ?? []}
						/>
					</ComparisonCell>
					<ComparisonCell label={candidateLabel} tone="success">
						<DetailList
							empty="No evaluator evidence available."
							items={candidateDetail?.rubricEvidence ?? []}
						/>
					</ComparisonCell>
				</div>
			</div>

			<div>
				<p className="mb-2 font-medium text-[var(--muted-foreground)] text-xs uppercase">
					Citation support checks
				</p>
				<div className="grid gap-3 lg:grid-cols-2">
					<ComparisonCell label={baselineLabel} tone="danger">
						<CitationSupportNotes detail={baselineDetail} />
					</ComparisonCell>
					<ComparisonCell label={candidateLabel} tone="success">
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
						<table className="w-full min-w-[920px] text-left text-sm">
							<thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
								<tr>
									<th className="px-3 py-2 font-medium">Case</th>
									<th className="px-3 py-2 font-medium">Themes</th>
									<th className="px-3 py-2 font-medium">{baselineLabel}</th>
									<th className="px-3 py-2 font-medium">{candidateLabel}</th>
									<th className="px-3 py-2 font-medium">
										Overall {changeLabelLower}
									</th>
									<th className="px-3 py-2 font-medium">
										Citation {changeLabelLower}
									</th>
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

							<EvaluatorOutputPanel
								baselineDetail={selectedCase.diff.baselineDetail}
								baselineLabel={baselineLabel}
								candidateDetail={selectedCase.diff.candidateDetail}
								candidateLabel={candidateLabel}
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
