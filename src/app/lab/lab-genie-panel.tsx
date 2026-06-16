"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Card, CardBody, CardHeader } from "~/components/ui/card";
import type { BriefingOutput, SourcePacket } from "~/schemas";

const defaultLabPacketId = "packet-eval-loop";

type LabGeniePanelProps = {
	sourcePackets: SourcePacket[];
	briefingOutputs: BriefingOutput[];
};

export function LabGeniePanel({
	sourcePackets,
	briefingOutputs,
}: LabGeniePanelProps) {
	const fallbackPacket =
		sourcePackets.find((packet) => packet.id === defaultLabPacketId) ??
		sourcePackets[0];
	const [selectedPacketId, setSelectedPacketId] = useState(fallbackPacket?.id);
	const [status, setStatus] = useState("Seeded briefing preview ready.");

	const selectedPacket =
		sourcePackets.find((packet) => packet.id === selectedPacketId) ??
		fallbackPacket;
	const fallbackBriefing = briefingOutputs[0];
	const briefingPreview =
		briefingOutputs.find(
			(output) => output.sourcePacketId === selectedPacket?.id,
		) ?? fallbackBriefing;

	return (
		<Card>
			<CardHeader>
				<h2 className="font-semibold text-base">Briefing Genie</h2>
				<p className="text-[var(--muted-foreground)] text-sm">
					Quick product action embedded for demo continuity.
				</p>
			</CardHeader>
			<CardBody className="space-y-4">
				<div>
					<label
						className="font-medium text-[var(--foreground)] text-sm"
						htmlFor="lab-source-packet"
					>
						Source packet
					</label>
					<select
						className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-[var(--foreground)] text-sm"
						id="lab-source-packet"
						onChange={(event) => {
							setSelectedPacketId(event.target.value);
							setStatus("Seeded briefing preview updated for selection.");
						}}
						value={selectedPacket?.id ?? ""}
					>
						{sourcePackets.map((packet) => (
							<option key={packet.id} value={packet.id}>
								{packet.title}
							</option>
						))}
					</select>
					<p className="mt-2 text-[var(--muted-foreground)] text-sm">
						{selectedPacket?.summary}
					</p>
				</div>
				<Button
					className="w-full"
					onClick={() =>
						setStatus(
							selectedPacket
								? `Seeded briefing refreshed for ${selectedPacket.title}.`
								: "Seeded briefing refreshed.",
						)
					}
					tone="accent"
					type="button"
				>
					Generate seeded briefing
				</Button>
				<p
					aria-live="polite"
					className="text-[var(--muted-foreground)] text-xs"
				>
					{status}
				</p>
				<div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
					<h3 className="font-semibold text-sm">{briefingPreview?.title}</h3>
					<p className="mt-2 text-[var(--muted-foreground)] text-sm">
						{briefingPreview?.summary}
					</p>
				</div>
			</CardBody>
		</Card>
	);
}
