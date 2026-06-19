"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { Card, CardBody, CardHeader } from "~/components/card";
import { NativeSelect } from "~/components/native-select";
import type { BriefingOutput, SourcePacket } from "~/schemas";

type GeniePageClientProps = {
	sourcePackets: SourcePacket[];
	briefingOutputs: BriefingOutput[];
};

export function GeniePageClient({
	sourcePackets,
	briefingOutputs,
}: GeniePageClientProps) {
	const fallbackPacket = sourcePackets[0];
	const [selectedPacketId, setSelectedPacketId] = useState(fallbackPacket?.id);
	const [generationStatus, setGenerationStatus] = useState(
		"Seeded preview is ready.",
	);

	const selectedPacket =
		sourcePackets.find((packet) => packet.id === selectedPacketId) ??
		fallbackPacket;
	const fallbackBriefing = briefingOutputs[0];
	const briefingPreview =
		briefingOutputs.find(
			(output) => output.sourcePacketId === selectedPacket?.id,
		) ?? fallbackBriefing;

	function generateSeededBriefing() {
		setGenerationStatus(
			selectedPacket
				? `Seeded briefing refreshed for ${selectedPacket.title}.`
				: "Seeded briefing refreshed.",
		);
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
						<h2 className="font-semibold text-base">Source Packet</h2>
						<p className="text-[var(--muted-foreground)] text-sm">
							Choose the packet Briefing Genie should summarize.
						</p>
					</CardHeader>
					<CardBody className="space-y-4">
						<div>
							<label
								className="font-medium text-[var(--foreground)] text-sm"
								htmlFor="source-packet"
							>
								Packet
							</label>
							<NativeSelect
								id="source-packet"
								onChange={(event) => {
									setSelectedPacketId(event.target.value);
									setGenerationStatus("Seeded preview updated for selection.");
								}}
								value={selectedPacket?.id ?? ""}
								wrapperClassName="mt-1"
							>
								{sourcePackets.map((packet) => (
									<option key={packet.id} value={packet.id}>
										{packet.title}
									</option>
								))}
							</NativeSelect>
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
							onClick={generateSeededBriefing}
							tone="accent"
							type="button"
						>
							Generate seeded briefing
						</Button>
						<p
							aria-live="polite"
							className="text-[var(--muted-foreground)] text-xs"
						>
							{generationStatus} The next runtime slice will persist a
							Zod-validated trace for the lab.
						</p>
					</CardBody>
				</Card>

				<section className="grid gap-4">
					<Card>
						<CardHeader>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2 className="font-semibold text-base">
										Generated Briefing Preview
									</h2>
									<p className="text-[var(--muted-foreground)] text-sm">
										Seeded artifact for {selectedPacket?.caseId}
									</p>
								</div>
								<Badge tone="blue">trace-ready shape</Badge>
							</div>
						</CardHeader>
						<CardBody className="space-y-5">
							<div>
								<h3 className="font-semibold text-xl">
									{briefingPreview?.title}
								</h3>
								<p className="mt-2 text-[var(--muted-foreground)]">
									{briefingPreview?.summary}
								</p>
							</div>
							<div>
								<h4 className="font-semibold text-sm">Claims</h4>
								<div className="mt-2 grid gap-2">
									{briefingPreview?.claims.map((claim) => (
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
										{briefingPreview?.openQuestions.map((question) => (
											<li key={question}>{question}</li>
										))}
									</ul>
								</div>
								<div className="rounded-md border border-[var(--success-border)] bg-[var(--success)] p-3">
									<h4 className="font-semibold text-[var(--success-foreground)] text-sm">
										Recommendation
									</h4>
									<p className="mt-2 text-[var(--success-foreground)] text-sm">
										{briefingPreview?.recommendation}
									</p>
								</div>
							</div>
						</CardBody>
					</Card>
				</section>
			</div>
		</main>
	);
}
