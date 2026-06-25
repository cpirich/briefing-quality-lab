"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "~/components/button";
import { api } from "~/trpc/react";

export function LabActions() {
	const [status, setStatus] = useState<string | null>(null);
	const activePollId = useRef(0);
	const utils = api.useUtils();
	async function pollEvalRun(jobId: string) {
		activePollId.current += 1;
		const pollId = activePollId.current;

		for (;;) {
			await new Promise((resolve) => setTimeout(resolve, 750));
			if (pollId !== activePollId.current) {
				return;
			}

			try {
				const job = await utils.lab.getEvalRun.fetch({ jobId });
				if (job.status === "complete") {
					setStatus(
						`Completed ${job.provider} generation run ${job.runId}; wrote ${job.completedCases}/${job.totalCases} cases.`,
					);
					return;
				}
				if (job.status === "failed") {
					setStatus(
						`Failed ${job.provider} generation run ${job.runId}: ${job.error ?? "Unknown error"}`,
					);
					return;
				}
				setStatus(
					`Running ${job.provider} generation run ${job.runId}: ${job.completedCases}/${job.totalCases || "visible"} cases complete.`,
				);
			} catch (error) {
				setStatus(error instanceof Error ? error.message : String(error));
				return;
			}
		}
	}
	const startEvalRun = api.lab.startEvalRun.useMutation({
		onSuccess: (job) => {
			setStatus(
				`Queued ${job.provider} generation run ${job.runId}; waiting for progress...`,
			);
			void pollEvalRun(job.id);
		},
		onError: (error) => {
			setStatus(error.message);
		},
	});

	return (
		<div className="grid gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<Link
					className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] px-3 font-medium text-[var(--foreground)] text-sm shadow-sm hover:bg-[var(--muted)]"
					href="/genie"
				>
					Open Genie
				</Link>
				<Button
					disabled={startEvalRun.isPending}
					onClick={() => {
						setStatus("Starting OpenAI candidate run...");
						startEvalRun.mutate({ provider: "openai" });
					}}
					type="button"
				>
					{startEvalRun.isPending ? "Starting..." : "Run OpenAI variant"}
				</Button>
			</div>
			{status ? (
				<p
					aria-live="polite"
					className="text-[var(--muted-foreground)] text-xs"
				>
					{status}
				</p>
			) : null}
		</div>
	);
}
