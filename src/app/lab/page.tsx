import type { Metadata } from "next";

import { Badge } from "~/components/ui/badge";
import { Card, CardBody, CardHeader } from "~/components/ui/card";
import { api } from "~/trpc/server";
import { LabActions } from "./lab-actions";
import { LabGeniePanel } from "./lab-genie-panel";

export const metadata: Metadata = {
	title: "Briefing Genie Improvement Lab",
};

export default async function LabPage() {
	const [runComparison, artifacts, evalCases, sourcePackets, briefingOutputs] =
		await Promise.all([
			api.lab.compareRuns(),
			api.lab.listArtifacts(),
			api.lab.listEvalCases(),
			api.genie.listSourcePackets(),
			api.genie.listSeededBriefingOutputs(),
		]);
	const { featuredCase, failureClusters } = runComparison;

	return (
		<main className="lab-route min-h-screen bg-[var(--background)] text-[var(--foreground)]">
			<header className="border-[var(--border)] border-b bg-[var(--header)]">
				<div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<Badge tone="blue">{runComparison.candidateRunId}</Badge>
							<Badge>{runComparison.baselineRunId}</Badge>
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
					<div className="grid gap-3 md:grid-cols-5">
						{runComparison.metrics.map((metric) => (
							<Card className="min-h-32" key={metric.label}>
								<CardBody className="space-y-3">
									<div className="flex items-center justify-between gap-2">
										<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
											{metric.label}
										</p>
										<Badge tone={metric.tone}>{metric.delta}</Badge>
									</div>
									<p className="font-semibold text-3xl">{metric.value}</p>
									<p className="text-[var(--muted-foreground)] text-xs">
										{metric.status}
									</p>
								</CardBody>
							</Card>
						))}
					</div>

					<div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between gap-3">
									<div>
										<h2 className="font-semibold text-base">Run Score Trend</h2>
										<p className="text-[var(--muted-foreground)] text-sm">
											Overall score across seeded experiment snapshots.
										</p>
									</div>
									<Badge tone="green">ship candidate</Badge>
								</div>
							</CardHeader>
							<CardBody>
								<div className="flex h-52 items-end gap-3 border-[var(--border)] border-b px-2">
									{runComparison.trend.map((point) => (
										<div
											className="flex min-w-0 flex-1 flex-col items-center gap-2"
											key={point.label}
										>
											<div
												aria-label={`${point.label} score ${point.score}`}
												className="w-full rounded-t-md bg-[var(--accent)]"
												role="img"
												style={{ height: `${point.score}%` }}
											/>
											<span className="font-medium text-[var(--muted-foreground)] text-xs">
												{point.label}
											</span>
										</div>
									))}
								</div>
								<div className="mt-4 overflow-x-auto rounded-md border border-[var(--border)]">
									<table className="w-full text-left text-sm">
										<thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
											<tr>
												<th className="px-3 py-2 font-medium">Metric</th>
												<th className="px-3 py-2 font-medium">Baseline</th>
												<th className="px-3 py-2 font-medium">Candidate</th>
												<th className="px-3 py-2 font-medium">Delta</th>
											</tr>
										</thead>
										<tbody>
											{runComparison.comparisonRows.map((row) => (
												<tr
													className="border-[var(--border)] border-t"
													key={row.metric}
												>
													<td className="px-3 py-2 font-medium">
														{row.metric}
													</td>
													<td className="px-3 py-2 text-[var(--muted-foreground)]">
														{row.baseline}
													</td>
													<td className="px-3 py-2 text-[var(--foreground)]">
														{row.candidate}
													</td>
													<td className="px-3 py-2 font-medium text-[var(--success-foreground)]">
														{row.delta}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</CardBody>
						</Card>

						<Card>
							<CardHeader>
								<h2 className="font-semibold text-base">Featured Case Diff</h2>
								<p className="text-[var(--muted-foreground)] text-sm">
									{featuredCase.title}
								</p>
							</CardHeader>
							<CardBody className="space-y-3">
								<div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
									<p className="font-medium text-[var(--muted-foreground)] text-xs uppercase">
										Source excerpt
									</p>
									<p className="mt-1 text-sm">{featuredCase.sourceExcerpt}</p>
								</div>
								<div className="grid gap-3 md:grid-cols-2">
									<div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger)] p-3">
										<p className="font-medium text-[var(--danger-foreground)] text-xs uppercase">
											Baseline
										</p>
										<p className="mt-1 text-sm">{featuredCase.baseline}</p>
									</div>
									<div className="rounded-md border border-[var(--success-border)] bg-[var(--success)] p-3">
										<p className="font-medium text-[var(--success-foreground)] text-xs uppercase">
											Candidate
										</p>
										<p className="mt-1 text-sm">{featuredCase.candidate}</p>
									</div>
								</div>
								<div className="rounded-md border border-[var(--info-border)] bg-[var(--info)] p-3">
									<p className="font-medium text-[var(--info-foreground)] text-xs uppercase">
										Evaluator note
									</p>
									<p className="mt-1 text-sm">{featuredCase.evaluatorNote}</p>
								</div>
							</CardBody>
						</Card>
					</div>

					<div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
						<Card>
							<CardHeader>
								<h2 className="font-semibold text-base">Failure Clusters</h2>
								<p className="text-[var(--muted-foreground)] text-sm">
									Ranked evaluator findings across {evalCases.length} validated
									cases.
								</p>
							</CardHeader>
							<CardBody className="space-y-3">
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
									File-backed evidence the lab will validate and expose through
									tRPC.
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
					<LabGeniePanel
						briefingOutputs={briefingOutputs}
						sourcePackets={sourcePackets}
					/>

					<Card>
						<CardHeader>
							<h2 className="font-semibold text-base">Next Action</h2>
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
				</aside>
			</div>
		</main>
	);
}
