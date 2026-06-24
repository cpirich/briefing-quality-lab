import type { Metadata } from "next";

import { Badge } from "~/components/badge";
import { Card, CardBody, CardHeader } from "~/components/card";
import { cn } from "~/lib/utils";
import type { RunModelMetadata } from "~/schemas";
import { api } from "~/trpc/server";
import { LabActions } from "./lab-actions";
import { LabCaseInspector } from "./lab-case-inspector";

export const metadata: Metadata = {
	title: "Briefing Genie Improvement Lab",
};

const lowerIsBetterMetrics = new Set([
	"Grounding risk units",
	"Median latency",
	"Estimated cost",
	"Cost ratio",
]);

function comparisonSideLabel(runId: string) {
	if (runId.startsWith("baseline-local-")) {
		return "Generated baseline";
	}
	if (runId.startsWith("baseline-openai-")) {
		return "OpenAI baseline";
	}
	if (runId.startsWith("candidate-local-")) {
		return "Generated candidate";
	}
	if (runId.startsWith("candidate-openai-")) {
		return "OpenAI candidate";
	}
	if (runId === "candidate-citation-gates") {
		return "Reference target";
	}
	if (runId.startsWith("baseline-")) {
		return "Seeded baseline";
	}

	return runId;
}

function usesReferenceTarget(candidateRunId: string) {
	return candidateRunId === "candidate-citation-gates";
}

function comparisonChangeLabel(candidateLabel: string, candidateRunId: string) {
	return candidateLabel === "Reference target" ||
		usesReferenceTarget(candidateRunId)
		? "Gap"
		: "Delta";
}

function comparisonBarClass(label: string, baselineLabel: string) {
	return label === baselineLabel || label === "Baseline"
		? "bg-[var(--muted-foreground)]"
		: "bg-[var(--accent)]";
}

function numericDelta(value: string) {
	const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
	return Number.isFinite(parsed) ? parsed : 0;
}

function formatUsdCents(value: number) {
	return `$${value.toFixed(2)}`;
}

function formatCostDeltaForDisplay(value: string) {
	const trimmedValue = value.trim();
	const amountMatch = trimmedValue.match(/\$?([0-9]+(?:\.[0-9]+)?)/);
	const amount = amountMatch ? Number.parseFloat(amountMatch[1] ?? "") : NaN;
	if (!Number.isFinite(amount)) {
		return value;
	}

	const normalizedValue = value.toLowerCase();
	const sign =
		normalizedValue.includes("under budget") || trimmedValue.startsWith("-")
			? "-"
			: "+";

	return `${sign}${formatUsdCents(Math.abs(amount))}`;
}

function formatDollarsForDisplay(value: string) {
	return value.replace(/\$?([0-9]+(?:\.[0-9]+)?)/g, (_match, amount: string) =>
		formatUsdCents(Number.parseFloat(amount)),
	);
}

function formatCostValueForDisplay(value: string) {
	const trimmedValue = value.trim();
	const normalizedValue = value.toLowerCase();
	if (
		normalizedValue.includes("under budget") ||
		normalizedValue.includes("over budget") ||
		trimmedValue.match(/^[+-](?:\$?\d|\.)/)
	) {
		return formatCostDeltaForDisplay(value);
	}

	return formatDollarsForDisplay(value);
}

function displayMetricValue(metric: string, value: string) {
	return metric === "Estimated cost" ? formatCostValueForDisplay(value) : value;
}

function metricBadgeLabel(metric: string, value: string, changeLabel: string) {
	const displayValue = displayMetricValue(metric, value);
	return changeLabel === "Gap" ? `gap ${displayValue}` : displayValue;
}

type MetricDeltaTone = "amber" | "blue" | "green" | "red" | "slate";

function metricDeltaTone(
	metric: string,
	value: string,
	changeLabel: string,
): MetricDeltaTone {
	const delta = numericDelta(value);

	if (delta === 0 || value === "unknown") {
		return "slate";
	}

	if (changeLabel === "Gap" && metric === "Estimated cost") {
		const normalizedValue = value.toLowerCase();
		const isUnderBudget =
			normalizedValue.includes("under budget") || value.trim().startsWith("-");

		return isUnderBudget ? "green" : "red";
	}

	const lowerIsBetter = lowerIsBetterMetrics.has(metric);

	if (changeLabel !== "Gap") {
		const isImprovement = lowerIsBetter ? delta < 0 : delta > 0;

		return isImprovement ? "green" : "red";
	}

	if (lowerIsBetter) {
		return delta < 0 ? "green" : "red";
	}

	const hasRemainingGap = delta > 0;
	if (hasRemainingGap) {
		return "amber";
	}
	return "green";
}

function targetGapDeltaTone(metric: string, value: string): MetricDeltaTone {
	const delta = numericDelta(value);

	if (delta === 0 || value === "unknown") {
		return "slate";
	}

	if (delta <= 0) {
		return "green";
	}

	return lowerIsBetterMetrics.has(metric) ? "red" : "amber";
}

function toneTextClass(tone: MetricDeltaTone) {
	if (tone === "green") {
		return "text-[var(--success-foreground)]";
	}
	if (tone === "red") {
		return "text-[var(--danger-foreground)]";
	}
	if (tone === "amber") {
		return "text-[var(--warning-foreground)]";
	}
	if (tone === "blue") {
		return "text-[var(--info-foreground)]";
	}
	return "text-[var(--muted-foreground)]";
}

function changeTextClass(metric: string, value: string, changeLabel: string) {
	return toneTextClass(metricDeltaTone(metric, value, changeLabel));
}

function targetGapTextClass(metric: string, value: string) {
	return toneTextClass(targetGapDeltaTone(metric, value));
}

function metadataValue(value: number | string | null | undefined) {
	if (value === null || value === undefined || value === "") {
		return "provider default";
	}

	return String(value);
}

function RunMetadataPanel({
	label,
	metadata,
}: {
	label: string;
	metadata: RunModelMetadata | null;
}) {
	if (!metadata) {
		return (
			<section className="space-y-2">
				<h3 className="font-semibold text-sm">{label}</h3>
				<p className="text-[var(--muted-foreground)] text-sm">
					No trace metadata available.
				</p>
			</section>
		);
	}

	const rows = [
		["Provider", metadata.provider],
		["Model", metadata.model],
		["Prompt", metadata.promptVersion],
		["Max output", metadata.maxOutputTokens],
		["Schema", metadata.structuredOutputName],
		["Reasoning", metadata.reasoningEffort],
		["Verbosity", metadata.textVerbosity],
		["Temperature", metadata.temperature],
	] as const;

	return (
		<section className="space-y-2">
			<h3 className="font-semibold text-sm">{label}</h3>
			<dl className="grid grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] gap-x-3 gap-y-1.5 text-sm">
				{rows.map(([name, value]) => (
					<div className="contents" key={name}>
						<dt className="text-[var(--muted-foreground)]">{name}</dt>
						<dd className="min-w-0 break-words font-medium">
							{metadataValue(value)}
						</dd>
					</div>
				))}
			</dl>
			{metadata.traceArtifactPath ? (
				<p className="break-all font-mono text-[var(--muted-foreground)] text-xs">
					{metadata.traceArtifactPath}
				</p>
			) : null}
		</section>
	);
}

function clusterSeverityFor(count: number) {
	if (count >= 5) {
		return "High" as const;
	}
	if (count >= 3) {
		return "Medium" as const;
	}
	return "Low" as const;
}

function inProgressRunLabel(run: {
	provider: string;
	role: string;
	evaluationCount: number;
	expectedCaseCount: number;
}) {
	if (run.expectedCaseCount <= 0) {
		return `${run.provider} ${run.role}`;
	}

	const activeCaseNumber = Math.min(
		run.expectedCaseCount,
		run.evaluationCount + 1,
	);
	return `${run.provider} ${run.role} case ${activeCaseNumber}/${run.expectedCaseCount}`;
}

export default async function LabPage() {
	const [runComparison, artifacts, caseBreakdown, inProgressRuns] =
		await Promise.all([
			api.lab.compareRuns(),
			api.lab.listArtifacts(),
			api.lab.listCaseBreakdown(),
			api.lab.listInProgressRuns(),
		]);
	const publicCaseIds = new Set(
		caseBreakdown.map((caseBreakdownEntry) => caseBreakdownEntry.caseId),
	);
	const failureClusters = runComparison.failureClusters
		.map((cluster) => {
			const cases = cluster.cases.filter((caseId) => publicCaseIds.has(caseId));

			return {
				...cluster,
				cases,
				count: cases.length,
				severity: clusterSeverityFor(cases.length),
			};
		})
		.filter((cluster) => cluster.count > 0);
	const baselineLabel =
		runComparison.baselineLabel ??
		comparisonSideLabel(runComparison.baselineRunId);
	const candidateLabel =
		runComparison.candidateLabel ??
		comparisonSideLabel(runComparison.candidateRunId);
	const changeLabel = comparisonChangeLabel(
		candidateLabel,
		runComparison.candidateRunId,
	);
	const hasReferenceTargetColumns = runComparison.comparisonRows.some(
		(row) => row.referenceTarget || row.gapToTarget,
	);
	const summaryTitle = hasReferenceTargetColumns
		? "Candidate vs Reference Target"
		: changeLabel === "Gap"
			? "Reference Target Summary"
			: "Candidate Summary";
	const summaryDescription = hasReferenceTargetColumns
		? `Large values are ${candidateLabel} metrics; badges show the gap to the Reference target.`
		: changeLabel === "Gap"
			? `Large values are ${candidateLabel} metrics; badges show the gap from ${baselineLabel}.`
			: `Large values are ${candidateLabel} metrics; badges show deltas from ${baselineLabel}.`;
	const comparedCaseCount = caseBreakdown.length;

	return (
		<main className="lab-route min-h-screen bg-[var(--background)] text-[var(--foreground)]">
			<header className="border-[var(--border)] border-b bg-[var(--header)]">
				<div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<Badge>{baselineLabel}</Badge>
							<Badge tone="blue">{candidateLabel}</Badge>
						</div>
						<h1 className="mt-2 font-semibold text-2xl tracking-tight">
							Briefing Genie Improvement Lab
						</h1>
						<p className="text-[var(--muted-foreground)] text-sm">
							Run comparison, failure evidence, and artifact trail for the
							current Briefing Genie experiment.
						</p>
					</div>
					<nav className="flex justify-start lg:justify-end">
						<LabActions />
					</nav>
				</div>
			</header>

			<div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 xl:grid-cols-[minmax(0,1fr)_360px]">
				<section className="grid min-w-0 gap-4">
					{inProgressRuns.length > 0 ? (
						<div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning)] p-3 text-[var(--warning-foreground)]">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p className="font-medium text-sm">Run in progress</p>
									<p className="text-xs">
										Showing the last complete comparison while new artifacts are
										being written.
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									{inProgressRuns.map((run) => (
										<Badge key={run.runId} tone="amber">
											<span
												aria-hidden="true"
												className="mr-1.5 size-2 animate-spin rounded-full border border-current border-t-transparent motion-reduce:animate-none"
											/>
											{inProgressRunLabel(run)}
										</Badge>
									))}
								</div>
							</div>
						</div>
					) : null}
					<div className="grid gap-2">
						<div>
							<h2 className="font-semibold text-base">{summaryTitle}</h2>
							<p className="text-[var(--muted-foreground)] text-sm">
								{summaryDescription}
							</p>
						</div>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
							{runComparison.metrics.map((metric) => {
								const badgeValue = metric.targetDelta ?? metric.delta;
								const badgeChangeLabel = metric.targetDelta
									? "Gap"
									: changeLabel;
								const badgeTone = metric.targetDelta
									? targetGapDeltaTone(metric.label, metric.targetDelta)
									: metricDeltaTone(metric.label, metric.delta, changeLabel);

								return (
									<Card className="min-h-32" key={metric.label}>
										<CardBody className="space-y-3 p-3 xl:p-4">
											<div className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 xl:gap-2">
												<p className="min-w-0 font-medium text-[var(--muted-foreground)] text-xs uppercase leading-4">
													{metric.label}
												</p>
												<Badge className="justify-self-end" tone={badgeTone}>
													{metricBadgeLabel(
														metric.label,
														badgeValue,
														badgeChangeLabel,
													)}
												</Badge>
											</div>
											<p className="font-semibold text-3xl">
												{displayMetricValue(metric.label, metric.value)}
											</p>
											<p className="text-[var(--muted-foreground)] text-xs">
												{displayMetricValue(metric.label, metric.status)}
											</p>
										</CardBody>
									</Card>
								);
							})}
						</div>
					</div>

					<Card>
						<CardHeader>
							<div className="flex items-center justify-between gap-3">
								<div>
									<h2 className="font-semibold text-base">Run Score Trend</h2>
									<p className="text-[var(--muted-foreground)] text-sm">
										Overall score for the compared run artifacts.
									</p>
								</div>
								<Badge tone={runComparison.recommendation.tone}>
									{runComparison.recommendation.label}
								</Badge>
							</div>
						</CardHeader>
						<CardBody>
							<div
								className="grid h-52 gap-3 px-2"
								style={{
									gridTemplateColumns: `repeat(${Math.max(1, runComparison.trend.length)}, minmax(0, 1fr))`,
								}}
							>
								{runComparison.trend.map((point) => (
									<div
										className="grid min-w-0 grid-rows-[1fr_auto] gap-2"
										key={point.label}
									>
										<div className="flex h-full items-end">
											<div
												aria-label={`${point.label} score ${point.score}`}
												className={cn(
													"mx-auto w-full max-w-16 rounded-t-md",
													comparisonBarClass(point.label, baselineLabel),
												)}
												role="img"
												style={{ height: `${point.score}%` }}
											/>
										</div>
										<span className="text-center font-medium text-[var(--muted-foreground)] text-xs">
											{point.label}
										</span>
									</div>
								))}
							</div>
							<div className="overflow-x-auto rounded-md border border-[var(--border)]">
								<table className="w-full text-left text-sm">
									<thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
										<tr>
											<th className="px-3 py-2 font-medium">Metric</th>
											<th className="px-3 py-2 font-medium">{baselineLabel}</th>
											<th className="px-3 py-2 font-medium">
												{candidateLabel}
											</th>
											{hasReferenceTargetColumns ? (
												<>
													<th className="px-3 py-2 font-medium">
														Reference target
													</th>
													<th className="px-3 py-2 font-medium">Delta</th>
													<th className="px-3 py-2 font-medium">
														Gap to target
													</th>
												</>
											) : (
												<th className="px-3 py-2 font-medium">{changeLabel}</th>
											)}
										</tr>
									</thead>
									<tbody>
										{runComparison.comparisonRows.map((row) => (
											<tr
												className="border-[var(--border)] border-t"
												key={row.metric}
											>
												<td className="px-3 py-2 font-medium">{row.metric}</td>
												<td className="px-3 py-2 text-[var(--muted-foreground)]">
													{displayMetricValue(row.metric, row.baseline)}
												</td>
												<td className="px-3 py-2 text-[var(--foreground)]">
													{displayMetricValue(row.metric, row.candidate)}
												</td>
												{hasReferenceTargetColumns ? (
													<td className="px-3 py-2 text-[var(--muted-foreground)]">
														{row.referenceTarget
															? displayMetricValue(
																	row.metric,
																	row.referenceTarget,
																)
															: "n/a"}
													</td>
												) : null}
												<td
													className={cn(
														"px-3 py-2 font-medium",
														changeTextClass(
															row.metric,
															row.delta,
															hasReferenceTargetColumns ? "Delta" : changeLabel,
														),
													)}
												>
													{displayMetricValue(row.metric, row.delta)}
												</td>
												{hasReferenceTargetColumns ? (
													<td
														className={cn(
															"px-3 py-2 font-medium",
															row.gapToTarget
																? targetGapTextClass(
																		row.metric,
																		row.gapToTarget,
																	)
																: "text-[var(--muted-foreground)]",
														)}
													>
														{row.gapToTarget
															? displayMetricValue(row.metric, row.gapToTarget)
															: "n/a"}
													</td>
												) : null}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</CardBody>
					</Card>

					<LabCaseInspector
						baselineLabel={baselineLabel}
						candidateLabel={candidateLabel}
						caseBreakdown={caseBreakdown}
						changeLabel={changeLabel}
					/>

					<div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
						<Card>
							<CardHeader>
								<h2 className="font-semibold text-base">Failure Themes</h2>
								<p className="text-[var(--muted-foreground)] text-sm">
									Case-tag themes from file-backed evaluator outputs across{" "}
									{comparedCaseCount} compared cases.
								</p>
							</CardHeader>
							<CardBody className="space-y-3">
								{failureClusters.length === 0 ? (
									<p className="text-[var(--muted-foreground)] text-sm">
										No public failure themes for this comparison.
									</p>
								) : null}
								{failureClusters.map((cluster) => (
									<div
										className="rounded-md border border-[var(--border)] p-3"
										key={cluster.title}
									>
										<div className="flex items-start justify-between gap-3">
											<div>
												<h3 className="font-semibold text-sm">
													{cluster.title}
												</h3>
												<p className="mt-1 text-[var(--muted-foreground)] text-sm">
													{cluster.evidence}
												</p>
											</div>
											<Badge
												tone={cluster.severity === "High" ? "red" : "amber"}
											>
												{cluster.count} cases
											</Badge>
										</div>
										<p className="mt-2 text-[var(--muted-foreground)] text-xs">
											{cluster.cases.join(", ")}
										</p>
									</div>
								))}
							</CardBody>
						</Card>

						<Card>
							<CardHeader>
								<h2 className="font-semibold text-base">Artifact Trail</h2>
								<p className="text-[var(--muted-foreground)] text-sm">
									File-backed paths for the current comparison, including local
									generated artifacts and seeded fallback artifacts.
								</p>
							</CardHeader>
							<CardBody>
								<div className="overflow-x-auto rounded-md border border-[var(--border)]">
									<table className="w-full text-left text-sm">
										<thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
											<tr>
												<th className="px-3 py-2 font-medium">Artifact</th>
												<th className="px-3 py-2 font-medium">Type</th>
												<th className="px-3 py-2 font-medium">Path</th>
											</tr>
										</thead>
										<tbody>
											{artifacts.map((artifact) => (
												<tr
													className="border-[var(--border)] border-t"
													key={artifact.path}
												>
													<td className="px-3 py-2 font-medium">
														{artifact.label}
													</td>
													<td className="px-3 py-2 text-[var(--muted-foreground)]">
														{artifact.type}
													</td>
													<td className="px-3 py-2 font-mono text-[var(--muted-foreground)] text-xs">
														{artifact.path}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</CardBody>
						</Card>
					</div>
				</section>

				<aside className="grid min-w-0 content-start gap-4">
					<Card>
						<CardHeader>
							<h2 className="font-semibold text-base">Evidence Status</h2>
						</CardHeader>
						<CardBody className="space-y-3">
							<Badge tone={runComparison.recommendation.tone}>
								{runComparison.recommendation.label}
							</Badge>
							<p className="text-sm">{runComparison.recommendation.text}</p>
							<div className="rounded-md border border-[var(--warning-border)] bg-[var(--warning)] p-3 text-[var(--warning-foreground)] text-sm">
								{runComparison.recommendation.warning}
							</div>
						</CardBody>
					</Card>

					<Card>
						<CardHeader>
							<h2 className="font-semibold text-base">Run Metadata</h2>
							<p className="text-[var(--muted-foreground)] text-sm">
								Model and generation settings from trace artifacts.
							</p>
						</CardHeader>
						<CardBody className="space-y-5">
							<RunMetadataPanel
								label={baselineLabel}
								metadata={runComparison.runMetadata?.baseline ?? null}
							/>
							<RunMetadataPanel
								label={candidateLabel}
								metadata={runComparison.runMetadata?.candidate ?? null}
							/>
						</CardBody>
					</Card>
				</aside>
			</div>
		</main>
	);
}
