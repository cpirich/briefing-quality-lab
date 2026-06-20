"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "~/components/button";
import { api } from "~/trpc/react";

export function LabActions() {
	const [status, setStatus] = useState("Seeded artifacts loaded.");
	const startEvalRun = api.lab.startEvalRun.useMutation({
		onSuccess: (job) => {
			setStatus(
				`Started ${job.provider} generation run ${job.runId}; writing ${job.totalCases || "visible"} cases to runs/.`,
			);
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
						setStatus("Starting local generation run...");
						startEvalRun.mutate({ provider: "local" });
					}}
					type="button"
				>
					{startEvalRun.isPending ? "Starting..." : "Run evals"}
				</Button>
				<Button
					onClick={() =>
						setStatus("Showing seeded baseline versus candidate comparison.")
					}
					tone="accent"
					type="button"
				>
					Compare
				</Button>
			</div>
			<p aria-live="polite" className="text-[var(--muted-foreground)] text-xs">
				{status}
			</p>
		</div>
	);
}
