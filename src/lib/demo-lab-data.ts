export const sourcePackets = [
	{
		id: "packet-dev-adoption",
		title: "Developer Adoption Review",
		summary:
			"Product signals from docs usage, support tickets, onboarding interviews, and pilot-team notes.",
		caseId: "case-adoption-friction",
		sources: [
			{
				id: "S1",
				title: "Docs analytics",
				excerpt:
					"Quickstart completion rose to 58%, but teams still drop during local setup and credential configuration.",
			},
			{
				id: "S2",
				title: "Support digest",
				excerpt:
					"Most tickets mention environment drift, stale CLI versions, and unclear recovery steps after failed installs.",
			},
			{
				id: "S3",
				title: "Pilot interviews",
				excerpt:
					"Senior engineers value traceability and want generated recommendations tied back to source snippets.",
			},
		],
	},
	{
		id: "packet-eval-loop",
		title: "Eval Loop Strategy",
		summary:
			"Notes comparing weekly human review, automated scoring, holdout cases, and release guardrails.",
		caseId: "case-eval-loop",
		sources: [
			{
				id: "S1",
				title: "Quality review memo",
				excerpt:
					"Teams need smaller eval batches with visible failure clusters before expanding model coverage.",
			},
			{
				id: "S2",
				title: "Release guardrail notes",
				excerpt:
					"Coverage can improve while grounding regresses, so citation support needs an explicit shipping gate.",
			},
			{
				id: "S3",
				title: "Cost review",
				excerpt:
					"Long traces help debug failures, but unchecked retries created a 1.34x cost increase in the last dry run.",
			},
		],
	},
	{
		id: "packet-local-cloud",
		title: "Local vs Cloud Execution",
		summary:
			"Synthetic planning packet for a product decision on local reliability, hosted convenience, and demo risk.",
		caseId: "case-runtime-choice",
		sources: [
			{
				id: "S1",
				title: "Reliability review",
				excerpt:
					"Local operation keeps the demo inspectable but makes dependency pinning and seed data more important.",
			},
			{
				id: "S2",
				title: "Go-to-market note",
				excerpt:
					"Hosted previews reduce onboarding friction, but the current roadmap has no production hosting plan.",
			},
			{
				id: "S3",
				title: "Security note",
				excerpt:
					"Public fixtures must avoid private planning paths, customer identifiers, and unreleased vendor data.",
			},
		],
	},
];

export const briefingPreviews = {
	"packet-dev-adoption": {
		title: "Recommendation: fix setup recovery before expanding pilots",
		summary:
			"Developer adoption is improving, but the most visible friction is still setup recovery. Treat environment reliability and citation traceability as the next product-quality gate before adding more pilot teams.",
		claims: [
			{
				text: "Quickstart completion improved, yet local setup remains the highest-friction step.",
				citations: ["S1", "S2"],
			},
			{
				text: "Senior reviewers want recommendations to stay tied to source snippets, not just synthesized summaries.",
				citations: ["S3"],
			},
			{
				text: "The next iteration should add clearer failed-install recovery and trace-backed recommendations.",
				citations: ["S2", "S3"],
			},
		],
		openQuestions: [
			"Which setup failures are caused by stale CLI versions versus missing credentials?",
			"Should the lab block releases when citation support drops even if coverage improves?",
		],
		recommendation:
			"Ship the recovery-path copy and trace-backed citation checks before widening the pilot.",
	},
	"packet-eval-loop": {
		title: "Recommendation: gate eval expansion on citation support",
		summary:
			"The eval loop is ready for broader automation only if citation support remains a release guardrail. Smaller batches with visible failure clusters are the safer next step.",
		claims: [
			{
				text: "Smaller eval batches make failures easier to inspect before widening model coverage.",
				citations: ["S1"],
			},
			{
				text: "Coverage gains should not ship when grounding regresses.",
				citations: ["S2"],
			},
			{
				text: "Trace depth is useful, but retry behavior needs a cost cap.",
				citations: ["S3"],
			},
		],
		openQuestions: [
			"What citation-support threshold should block a candidate run?",
			"Which traces are worth keeping when retry costs rise?",
		],
		recommendation:
			"Run the next experiment as a small visible batch with citation support and cost ratio as explicit gates.",
	},
	"packet-local-cloud": {
		title:
			"Recommendation: keep the demo local until seed reliability is boring",
		summary:
			"Local execution is still the better demo default because it keeps artifacts inspectable. The tradeoff is that dependency pinning and public-safe fixtures must be treated as product requirements.",
		claims: [
			{
				text: "Local operation improves inspectability but depends on reliable setup and seed data.",
				citations: ["S1"],
			},
			{
				text: "Hosted previews may reduce onboarding friction, but they are outside the current plan.",
				citations: ["S2"],
			},
			{
				text: "Public fixtures need explicit privacy and data-safety checks.",
				citations: ["S3"],
			},
		],
		openQuestions: [
			"What setup failures must be eliminated before a live demo?",
			"Which artifacts are safe to commit in a public repo?",
		],
		recommendation:
			"Keep the first demo local and invest the next slice in deterministic fixtures, validation, and seed commands.",
	},
};

export const briefingPreview = briefingPreviews["packet-dev-adoption"];

export function getBriefingPreview(packetId: string | undefined) {
	if (packetId && packetId in briefingPreviews) {
		return briefingPreviews[packetId as keyof typeof briefingPreviews];
	}

	return briefingPreview;
}

export const labMetrics = [
	{
		label: "Overall quality",
		value: "0.84",
		delta: "+0.12",
		status: "Candidate passes target",
		tone: "green" as const,
	},
	{
		label: "Citation grounding",
		value: "0.78",
		delta: "+0.19",
		status: "Weak cluster shrinking",
		tone: "green" as const,
	},
	{
		label: "Coverage",
		value: "0.88",
		delta: "+0.07",
		status: "Expected points covered",
		tone: "blue" as const,
	},
	{
		label: "Cost ratio",
		value: "1.08x",
		delta: "+0.04x",
		status: "Inside 1.15x guardrail",
		tone: "amber" as const,
	},
	{
		label: "Latency ratio",
		value: "0.94x",
		delta: "-0.09x",
		status: "Faster than baseline",
		tone: "green" as const,
	},
];

export const runTrend = [
	{ label: "Base", score: 59 },
	{ label: "Trace", score: 68 },
	{ label: "Cite", score: 77 },
	{ label: "Latest", score: 84 },
];

export const runComparison = [
	{
		metric: "Overall score",
		baseline: "0.72",
		candidate: "0.84",
		delta: "+0.12",
	},
	{
		metric: "Citation support",
		baseline: "0.59",
		candidate: "0.78",
		delta: "+0.19",
	},
	{
		metric: "Unsupported claims",
		baseline: "11",
		candidate: "4",
		delta: "-7",
	},
	{
		metric: "Median latency",
		baseline: "8.1s",
		candidate: "7.6s",
		delta: "-0.5s",
	},
];

export const failureClusters = [
	{
		title: "Weak citation grounding",
		count: 4,
		severity: "High",
		evidence:
			"Briefings include plausible strategic claims that are only loosely connected to packet excerpts.",
		cases: ["case-eval-loop", "case-adoption-friction"],
	},
	{
		title: "Coverage misses governance risk",
		count: 2,
		severity: "Medium",
		evidence:
			"Outputs mention speed and cost but underweight human approval and holdout-case boundaries.",
		cases: ["case-eval-loop"],
	},
	{
		title: "Cost tradeoff too vague",
		count: 2,
		severity: "Medium",
		evidence:
			"Recommendations do not quantify retry or trace costs even when source notes provide ratios.",
		cases: ["case-runtime-choice"],
	},
];

export const featuredCase = {
	id: "case-eval-loop",
	title: "Eval loop strategy briefing",
	sourceExcerpt:
		"Coverage can improve while grounding regresses, so citation support needs an explicit shipping gate.",
	baseline:
		"The team should expand automated evals because coverage improved and review time dropped.",
	candidate:
		"The team should expand smaller eval batches only if citation support remains above the guardrail; coverage gains alone are not enough to ship.",
	evaluatorNote:
		"Candidate preserves the positive eval-loop recommendation while grounding the shipping condition in the guardrail note.",
};

export const artifacts = [
	{
		label: "Baseline manifest",
		path: "runs/baseline-2026-06-10/manifest.json",
		type: "Run manifest",
	},
	{
		label: "Latest candidate",
		path: "runs/candidate-citation-gates/manifest.json",
		type: "Run manifest",
	},
	{
		label: "Featured trace",
		path: "runs/candidate-citation-gates/traces/case-eval-loop.json",
		type: "Generation trace",
	},
	{
		label: "Eval report",
		path: "reports/latest-eval-summary.md",
		type: "Report",
	},
];
