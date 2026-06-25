"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { Card, CardBody, CardHeader } from "~/components/card";
import { NativeSelect } from "~/components/native-select";
import type { BriefingOutput, GenerationTrace, SourcePacket } from "~/schemas";
import { api } from "~/trpc/react";

type GeniePageClientProps = {
	caseTitlesBySourcePacketId: Record<string, string>;
	sourcePackets: SourcePacket[];
};

function metadataValue(value: number | string | boolean | null | undefined) {
	if (value === null || value === undefined || value === "") {
		return "provider default";
	}

	return String(value);
}

function formatLatency(milliseconds: number) {
	return `${(milliseconds / 1000).toFixed(1)}s`;
}

function formatUsd(value: number | null) {
	return value === null ? "unknown" : `$${value.toFixed(2)}`;
}

function TraceMetadataPanel({ trace }: { trace: GenerationTrace }) {
	const [isOpen, setIsOpen] = useState(false);
	const settings = trace.model.settings;
	const metadataRows = [
		["Provider", trace.model.provider],
		["Model", trace.model.name],
		["Prompt version", settings.promptVersion],
		["Latency", formatLatency(trace.latencyMs)],
		["Estimated cost", formatUsd(trace.cost.estimatedUsd)],
		["Input tokens", trace.cost.inputTokens],
		["Cached input tokens", trace.cost.cachedInputTokens ?? 0],
		["Output tokens", trace.cost.outputTokens],
		["Max output tokens", settings.maxOutputTokens],
		["Structured output", settings.structuredOutputName],
		["Verbosity", settings.textVerbosity],
		["Reasoning effort", settings.reasoningEffort],
		["Temperature", settings.temperature],
		["Tool choice", settings.toolChoice],
	] as const;

	return (
		<div className="rounded-md border border-[var(--border)] bg-[var(--muted)]">
			<button
				aria-controls="generation-metadata-panel"
				aria-expanded={isOpen}
				className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 p-3 text-left"
				onClick={() => setIsOpen((current) => !current)}
				type="button"
			>
				<span className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className={
							isOpen
								? "rotate-90 text-[var(--muted-foreground)] transition-transform"
								: "text-[var(--muted-foreground)] transition-transform"
						}
					>
						{">"}
					</span>
					<span className="font-semibold text-sm">Generation Metadata</span>
				</span>
				<Badge tone={trace.cost.estimatedUsd === null ? "amber" : "green"}>
					{trace.cost.estimatedUsd === null
						? "cost unknown"
						: formatUsd(trace.cost.estimatedUsd)}
				</Badge>
			</button>
			{isOpen ? (
				<div
					className="border-[var(--border)] border-t p-3 pt-3"
					id="generation-metadata-panel"
				>
					<dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{metadataRows.map(([label, value]) => (
							<div
								className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2"
								key={label}
							>
								<dt className="text-[var(--muted-foreground)] text-xs">
									{label}
								</dt>
								<dd className="mt-1 break-words font-medium text-sm">
									{metadataValue(value)}
								</dd>
							</div>
						))}
					</dl>
					{trace.cost.pricing ? (
						<p className="mt-3 text-[var(--muted-foreground)] text-xs">
							Pricing: {trace.cost.pricing.source}
						</p>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export function GeniePageClient({
	caseTitlesBySourcePacketId,
	sourcePackets,
}: GeniePageClientProps) {
	const fallbackPacket = sourcePackets[0];
	const [selectedPacketId, setSelectedPacketId] = useState(fallbackPacket?.id);
	const [generationStatus, setGenerationStatus] = useState("Ready.");
	const [generatedBriefing, setGeneratedBriefing] = useState<BriefingOutput>();
	const [generatedTrace, setGeneratedTrace] = useState<GenerationTrace>();
	const generateBriefing = api.genie.generateBriefing.useMutation({
		onSuccess: (result) => {
			setGeneratedBriefing(result.briefing);
			setGeneratedTrace(result.trace);
			setGenerationStatus(
				`Generated ${result.briefing.title} with ${result.trace.model.name}.`,
			);
		},
		onError: (error) => {
			setGenerationStatus(error.message);
		},
	});

	const selectedPacket =
		sourcePackets.find((packet) => packet.id === selectedPacketId) ??
		fallbackPacket;
	const selectedCaseTitle =
		(selectedPacket
			? caseTitlesBySourcePacketId[selectedPacket.id]
			: undefined) ??
		selectedPacket?.title ??
		"Selected briefing case";
	const briefingPreview =
		generatedBriefing?.sourcePacketId === selectedPacket?.id
			? generatedBriefing
			: undefined;
	const activeTrace =
		generatedBriefing?.sourcePacketId === selectedPacket?.id
			? generatedTrace
			: undefined;

	function generateSeededBriefing() {
		if (!selectedPacket) {
			setGenerationStatus("Select a source packet before generating.");
			return;
		}

		setGenerationStatus(`Generating briefing for ${selectedCaseTitle}...`);
		generateBriefing.mutate({
			sourcePacketId: selectedPacket.id,
			userRequest: `Generate a concise, citation-aware strategy briefing for ${selectedCaseTitle}.`,
		});
	}

	return (
		<main className="genie-route min-h-screen bg-[var(--background)] text-[var(--foreground)]">
			<header className="border-[var(--border)] border-b bg-[var(--header)]">
				<div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
					<div>
						<Badge tone="green">Genie product</Badge>
						<h1 className="mt-2 font-semibold text-3xl tracking-tight">
							Briefing Genie
						</h1>
						<p className="max-w-2xl text-[var(--muted-foreground)] text-sm">
							Select a synthetic source packet and generate a concise,
							citation-aware strategy briefing.
						</p>
					</div>
					<Link
						className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] px-3 font-medium text-[var(--foreground)] text-sm shadow-sm hover:bg-[var(--muted)]"
						href="/lab"
					>
						Open Improvement Lab
					</Link>
				</div>
			</header>

			<div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
				<Card>
					<CardHeader>
						<h2 className="font-semibold text-base">Briefing Case</h2>
						<p className="text-[var(--muted-foreground)] text-sm">
							Choose the evaluation case Briefing Genie should summarize.
						</p>
					</CardHeader>
					<CardBody className="space-y-4">
						<div>
							<label
								className="font-medium text-[var(--foreground)] text-sm"
								htmlFor="source-packet"
							>
								Case
							</label>
							<NativeSelect
								id="source-packet"
								onChange={(event) => {
									setSelectedPacketId(event.target.value);
									setGeneratedBriefing(undefined);
									setGeneratedTrace(undefined);
									setGenerationStatus("Ready.");
								}}
								value={selectedPacket?.id ?? ""}
								wrapperClassName="mt-1"
							>
								{sourcePackets.map((packet) => (
									<option key={packet.id} value={packet.id}>
										{caseTitlesBySourcePacketId[packet.id] ?? packet.title}
									</option>
								))}
							</NativeSelect>
							{selectedPacket ? (
								<p className="mt-2 text-[var(--muted-foreground)] text-xs">
									Source packet: {selectedPacket.title}
								</p>
							) : null}
						</div>
						<div className="space-y-3">
							{selectedPacket?.sources.map((source) => (
								<div
									className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3"
									key={source.id}
								>
									<div className="flex items-center justify-between gap-2">
										<h3 className="font-semibold text-sm">{source.title}</h3>
										<Badge>{source.id}</Badge>
									</div>
									<p className="mt-2 text-[var(--muted-foreground)] text-sm">
										{source.body}
									</p>
								</div>
							))}
						</div>
						<Button
							className="w-full"
							disabled={generateBriefing.isPending}
							onClick={generateSeededBriefing}
							tone="accent"
							type="button"
						>
							{generateBriefing.isPending
								? "Generating..."
								: "Generate briefing"}
						</Button>
						<p
							aria-live="polite"
							className="text-[var(--muted-foreground)] text-xs"
						>
							{generationStatus}
						</p>
					</CardBody>
				</Card>

				<section className="grid gap-4">
					<Card>
						<CardHeader>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2 className="font-semibold text-base">Briefing Result</h2>
									<p className="text-[var(--muted-foreground)] text-sm">
										{selectedPacket?.caseId}
									</p>
								</div>
								<Badge tone={activeTrace ? "green" : "blue"}>
									{activeTrace ? activeTrace.model.name : "not generated"}
								</Badge>
							</div>
						</CardHeader>
						<CardBody className="space-y-5">
							{briefingPreview ? (
								<>
									<div>
										<h3 className="font-semibold text-xl">
											{briefingPreview.title}
										</h3>
										<p className="mt-2 text-[var(--muted-foreground)]">
											{briefingPreview.summary}
										</p>
									</div>
									<div>
										<h4 className="font-semibold text-sm">Claims</h4>
										<div className="mt-2 grid gap-2">
											{briefingPreview.claims.map((claim) => (
												<div
													className="rounded-md border border-[var(--border)] p-3"
													key={claim.text}
												>
													<p className="text-sm">{claim.text}</p>
													<div className="mt-2 flex flex-wrap gap-1">
														{claim.citations.map((citation) => (
															<Badge key={citation} tone="green">
																{citation}
															</Badge>
														))}
													</div>
												</div>
											))}
										</div>
									</div>
									<div className="grid gap-3 md:grid-cols-2">
										<div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
											<h4 className="font-semibold text-sm">Open Questions</h4>
											<ul className="mt-2 space-y-2 text-[var(--muted-foreground)] text-sm">
												{briefingPreview.openQuestions.map((question) => (
													<li key={question}>{question}</li>
												))}
											</ul>
										</div>
										<div className="rounded-md border border-[var(--success-border)] bg-[var(--success)] p-3">
											<h4 className="font-semibold text-[var(--success-foreground)] text-sm">
												Recommendation
											</h4>
											<p className="mt-2 text-[var(--success-foreground)] text-sm">
												{briefingPreview.recommendation}
											</p>
										</div>
									</div>
									{activeTrace ? (
										<TraceMetadataPanel trace={activeTrace} />
									) : null}
								</>
							) : (
								<div className="flex min-h-96 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] p-6 text-center">
									<div>
										<h3 className="font-semibold text-lg">No briefing yet</h3>
										<p className="mt-2 max-w-md text-[var(--muted-foreground)] text-sm">
											This packet does not have a generated result in the
											product view.
										</p>
									</div>
								</div>
							)}
						</CardBody>
					</Card>
				</section>
			</div>
		</main>
	);
}
