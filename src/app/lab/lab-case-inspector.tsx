"use client";

import { useMemo, useState } from "react";

import { Badge } from "~/components/badge";
import { Card, CardBody, CardHeader } from "~/components/card";
import { NativeSelect } from "~/components/native-select";
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

function metricBadgeLabel(value: string, changeLabel: string) {
	return changeLabel === "Gap" ? `gap ${value}` : value;
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

function CaseArtifactPanel({
	detail,
	label,
	tone,
}: {
	detail: CaseArtifactDetail | null;
	label: string;
	tone: "danger" | "success";
}) {
	const toneClasses =
		tone === "danger"
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

	if (!detail) {
		return (
			<div
				className={cn(
					"rounded-md border p-3",
					toneClasses.border,
					toneClasses.background,
				)}
			>
				<p
					className={cn(
						"font-medium text-xs uppercase",
						toneClasses.foreground,
					)}
				>
					{label}
				</p>
				<p className="mt-2 text-sm">No case artifact detail available.</p>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"space-y-3 rounded-md border p-3",
				toneClasses.border,
				toneClasses.background,
			)}
		>
			<div>
				<p
					className={cn(
						"font-medium text-xs uppercase",
						toneClasses.foreground,
					)}
				>
					{label}
				</p>
				<h3 className="mt-1 font-semibold text-sm">{detail.title}</h3>
				<p className="mt-1 text-sm">{detail.summary}</p>
			</div>

			<div>
				<p
					className={cn(
						"font-medium text-xs uppercase",
						toneClasses.foreground,
					)}
				>
					Recommendation
				</p>
				<p className="mt-1 text-sm">{detail.recommendation}</p>
			</div>

			<div>
				<p
					className={cn(
						"font-medium text-xs uppercase",
						toneClasses.foreground,
					)}
				>
					Claims and citations
				</p>
				<div className="mt-1 space-y-2">
					{detail.claims.length === 0 ? (
						<p className="text-[var(--muted-foreground)] text-xs">
							No claims available.
						</p>
					) : (
						detail.claims.map((claim) => (
							<div
								className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2"
								key={`${claim.text}-${claim.citations.join("-")}`}
							>
								<p className="text-sm">{claim.text}</p>
								<CitationPills citations={claim.citations} />
							</div>
						))
					)}
				</div>
			</div>

			<div>
				<p
					className={cn(
						"font-medium text-xs uppercase",
						toneClasses.foreground,
					)}
				>
					Open questions
				</p>
				<div className="mt-1">
					<DetailList
						empty="No open questions available."
						items={detail.openQuestions}
					/>
				</div>
			</div>

			<div>
				<p
					className={cn(
						"font-medium text-xs uppercase",
						toneClasses.foreground,
					)}
				>
					Evaluator evidence
				</p>
				<div className="mt-1">
					<DetailList
						empty="No evaluator evidence available."
						items={detail.rubricEvidence}
					/>
				</div>
			</div>

			<div>
				<p
					className={cn(
						"font-medium text-xs uppercase",
						toneClasses.foreground,
					)}
				>
					Citation support notes
				</p>
				<div className="mt-1 space-y-1.5">
					{detail.citationSupport.length === 0 ? (
						<p className="text-[var(--muted-foreground)] text-xs">
							No citation support notes available.
						</p>
					) : (
						detail.citationSupport.map((support) => (
							<p
								className="text-sm"
								key={`${support.citation}-${support.note}`}
							>
								<span className="font-medium">{support.citation}</span>:{" "}
								{support.note}
							</p>
						))
					)}
				</div>
			</div>

			<div>
				<p
					className={cn(
						"font-medium text-xs uppercase",
						toneClasses.foreground,
					)}
				>
					Artifacts
				</p>
				<div className="mt-1 space-y-1 font-mono text-[var(--muted-foreground)] text-xs">
					{detail.artifactPaths.length === 0 ? (
						<p>No artifact paths available.</p>
					) : (
						detail.artifactPaths.map((artifactPath) => (
							<p key={artifactPath}>{artifactPath}</p>
						))
					)}
				</div>
			</div>
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
					<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-center">
						<div>
							<h2 className="font-semibold text-base">Inspect Case</h2>
							<p className="text-[var(--muted-foreground)] text-sm">
								Use a case lens to inspect score variation, recommendations, and
								per-case artifacts.
							</p>
						</div>
						<label className="grid gap-1.5" htmlFor="lab-case-picker">
							<span className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
								Case
							</span>
							<NativeSelect
								aria-label="Inspect case"
								id="lab-case-picker"
								onChange={(event) => setSelectedCaseId(event.target.value)}
								value={selectedCase.caseId}
							>
								{caseBreakdown.map((entry) => (
									<option key={entry.caseId} value={entry.caseId}>
										{entry.title}
									</option>
								))}
							</NativeSelect>
						</label>
					</div>
				</CardHeader>
				<CardBody>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<div className="rounded-md border border-[var(--border)] p-3">
							<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
								{baselineLabel} score
							</p>
							<p className="mt-2 font-semibold text-2xl">
								{formatScore(selectedCase.baseline?.overall)}
							</p>
							<p className="text-[var(--muted-foreground)] text-xs">
								citations {formatScore(selectedCase.baseline?.citationSupport)}
							</p>
						</div>
						<div className="rounded-md border border-[var(--border)] p-3">
							<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
								{candidateLabel} score
							</p>
							<p className="mt-2 font-semibold text-2xl">
								{formatScore(selectedCase.candidate?.overall)}
							</p>
							<p className="text-[var(--muted-foreground)] text-xs">
								citations {formatScore(selectedCase.candidate?.citationSupport)}
							</p>
						</div>
						<div className="rounded-md border border-[var(--border)] p-3">
							<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
								Overall {changeLabelLower}
							</p>
							<Badge
								className="mt-2"
								tone={changeTone(selectedCase.delta.overall, changeLabel)}
							>
								{metricBadgeLabel(
									formatDelta(selectedCase.delta.overall),
									changeLabel,
								)}
							</Badge>
						</div>
						<div className="rounded-md border border-[var(--border)] p-3">
							<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
								Citation {changeLabelLower}
							</p>
							<Badge
								className="mt-2"
								tone={changeTone(
									selectedCase.delta.citationSupport,
									changeLabel,
								)}
							>
								{metricBadgeLabel(
									formatDelta(selectedCase.delta.citationSupport),
									changeLabel,
								)}
							</Badge>
						</div>
					</div>
					<p className="mt-3 text-[var(--muted-foreground)] text-xs">
						{selectedCase.failureTags.join(", ") || "No planned themes"}
					</p>
				</CardBody>
			</Card>

			<Card>
				<CardHeader>
					<h2 className="font-semibold text-base">Case Breakdown</h2>
					<p className="text-[var(--muted-foreground)] text-sm">
						Per-case evaluator scores from the compared run artifacts.
					</p>
				</CardHeader>
				<CardBody>
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
									<th className="px-3 py-2 font-medium">Evaluator artifacts</th>
								</tr>
							</thead>
							<tbody>
								{caseBreakdown.map((entry) => {
									const isSelected = entry.caseId === selectedCase.caseId;

									return (
										<tr
											className={cn(
												"border-[var(--border)] border-t align-top",
												isSelected && "bg-[var(--info)]",
											)}
											key={entry.caseId}
										>
											<td className="max-w-56 px-3 py-2">
												<button
													className="text-left font-medium text-[var(--foreground)] underline-offset-2 hover:underline"
													onClick={() => setSelectedCaseId(entry.caseId)}
													type="button"
												>
													{entry.title}
												</button>
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
											<td className="max-w-72 px-3 py-2 font-mono text-[var(--muted-foreground)] text-xs">
												<p>{entry.baseline?.artifactPath ?? "n/a"}</p>
												<p className="mt-1">
													{entry.candidate?.artifactPath ?? "n/a"}
												</p>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</CardBody>
			</Card>

			<Card>
				<CardHeader>
					<h2 className="font-semibold text-base">Case Diff</h2>
					<p className="text-[var(--muted-foreground)] text-sm">
						{selectedCase.title} briefing, claims, citations, evaluator
						evidence, and artifacts.
					</p>
				</CardHeader>
				<CardBody className="space-y-3">
					<div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
						<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
							Source evidence
						</p>
						<p className="mt-1 text-sm">{selectedCase.sourceEvidence}</p>
					</div>
					<div className="grid gap-3 lg:grid-cols-2">
						<CaseArtifactPanel
							detail={selectedCase.diff.baselineDetail}
							label={baselineLabel}
							tone="danger"
						/>
						<CaseArtifactPanel
							detail={selectedCase.diff.candidateDetail}
							label={candidateLabel}
							tone="success"
						/>
					</div>
					<div className="rounded-md border border-[var(--info-border)] bg-[var(--info)] p-3">
						<p className="font-medium text-[var(--info-foreground)] text-xs uppercase">
							Comparison note
						</p>
						<p className="mt-1 text-sm">{selectedCase.diff.evaluatorNote}</p>
					</div>
				</CardBody>
			</Card>
		</div>
	);
}
