import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	BriefingOutput,
	EvalCase,
	EvaluatorOutput,
	GenerationTrace,
	RunComparison,
	RunManifest,
	SourcePacket,
} from "~/schemas";

const baselineRunId = "baseline-2026-06-10";
const candidateRunId = "candidate-citation-gates";
const repoRoot = process.cwd();

type CaseFixture = {
	caseId: string;
	packetId: string;
	title: string;
	packetTitle: string;
	packetSummary: string;
	theme: string;
	task: string;
	sources: SourcePacket["sources"];
	expectedCoverage: string[];
	traps: string[];
	holdout: boolean;
	demoHighlight: boolean;
	failureTags: string[];
	notes: string;
	baseline?: BriefingSeed;
	candidate?: BriefingSeed;
	evaluation?: EvaluationSeed;
};

type BriefingSeed = {
	title: string;
	summary: string;
	claims: BriefingOutput["claims"];
	openQuestions: string[];
	recommendation: string;
};

type EvaluationSeed = {
	scores: EvaluatorOutput["scores"];
	failureTags: string[];
	rubricEvidence: string[];
	citationSupport: EvaluatorOutput["citationSupport"];
	notes: string;
};

const fixtures: CaseFixture[] = [
	{
		caseId: "case-adoption-friction",
		packetId: "packet-dev-adoption",
		title: "Developer adoption friction briefing",
		packetTitle: "Developer Adoption Review",
		packetSummary:
			"Product signals from docs usage, support tickets, onboarding interviews, and pilot-team notes.",
		theme: "developer adoption",
		task: "Summarize adoption risks and recommend the next product-quality improvement for pilot expansion.",
		sources: [
			{
				id: "S1",
				title: "Docs analytics",
				excerpt:
					"Quickstart completion rose from 44% to 58% after the copy refresh, and the first API call step now has fewer exits. The biggest remaining drop happens during local setup and credential configuration, where users bounce after seeing environment-specific errors.",
				documentType: "analytics digest",
			},
			{
				id: "S2",
				title: "Support digest",
				excerpt:
					"Most new tickets mention environment drift, stale CLI versions, and unclear recovery steps after failed installs. Several teams found the right command only after support pasted an internal checklist, which is not yet reflected in public docs.",
				documentType: "support summary",
			},
			{
				id: "S3",
				title: "Pilot interviews",
				excerpt:
					"Senior engineers said they trust generated recommendations only when each claim points back to source snippets they can inspect. They were less concerned about prose polish than about knowing whether a recommendation came from analytics, support, or interview evidence.",
				documentType: "interview synthesis",
			},
			{
				id: "S4",
				title: "Pilot expansion note",
				excerpt:
					"Two additional teams are available for a pilot next month, but the launch owner flagged setup recovery as the visible failure that would make the demo feel brittle. The note recommends expanding only after failed-install guidance and citation checks are observable in the lab.",
				documentType: "planning note",
			},
		],
		expectedCoverage: [
			"Quickstart completion is improving but setup remains a drop-off point.",
			"Environment drift, stale CLI versions, and credential recovery drive support volume.",
			"Senior reviewers require traceable recommendations tied to source snippets.",
			"Pilot expansion should wait for failed-install recovery and citation checks.",
		],
		traps: [
			"Do not claim pilot expansion is safe without addressing setup recovery.",
			"Do not omit citation traceability when making product recommendations.",
			"Do not cite the analytics improvement as evidence that setup is solved.",
		],
		holdout: false,
		demoHighlight: true,
		failureTags: ["setup-recovery", "citation-grounding"],
		notes:
			"Visible case for setup reliability and trace-backed recommendation behavior.",
		baseline: {
			title: "Recommendation: expand pilots after adoption lift",
			summary:
				"Adoption is moving in the right direction, so the team can widen pilots while continuing to monitor setup issues.",
			claims: [
				{
					text: "The docs refresh improved quickstart completion enough to justify broader pilots.",
					citations: ["S1"],
				},
				{
					text: "Support issues are mostly implementation details that can be handled reactively.",
					citations: ["S2"],
				},
				{
					text: "Reviewers want more traceability in generated recommendations.",
					citations: ["S3"],
				},
			],
			openQuestions: [
				"Which teams should join the next pilot?",
				"How much setup friction is acceptable during expansion?",
			],
			recommendation:
				"Expand the pilot and keep support ready to handle setup questions.",
		},
		candidate: {
			title: "Recommendation: fix setup recovery before expanding pilots",
			summary:
				"Developer adoption is improving, but the most visible remaining friction is setup recovery. Treat environment reliability and citation traceability as the product-quality gate before adding more pilot teams.",
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
					text: "Pilot expansion should wait until failed-install recovery and trace-backed citation checks are visible.",
					citations: ["S2", "S4"],
				},
			],
			openQuestions: [
				"Which setup failures are caused by stale CLI versions versus missing credentials?",
				"Should the lab block releases when citation support drops even if coverage improves?",
			],
			recommendation:
				"Ship the recovery-path copy and trace-backed citation checks before widening the pilot.",
		},
		evaluation: {
			scores: {
				overall: 0.86,
				grounding: 0.83,
				coverage: 0.9,
				citationSupport: 0.85,
			},
			failureTags: ["setup-recovery", "citation-grounding"],
			rubricEvidence: [
				"Candidate preserves the adoption improvement while refusing to overstate readiness for pilot expansion.",
				"Recommendation cites both support-ticket recovery evidence and the explicit pilot expansion note.",
			],
			citationSupport: [
				{
					citation: "S1",
					supported: true,
					note: "Supports quickstart improvement and remaining setup drop-off.",
				},
				{
					citation: "S2",
					supported: true,
					note: "Supports environment drift and failed-install recovery friction.",
				},
				{
					citation: "S3",
					supported: true,
					note: "Supports traceability requirement from senior reviewers.",
				},
				{
					citation: "S4",
					supported: true,
					note: "Supports gating pilot expansion on recovery and citation checks.",
				},
			],
			notes:
				"Candidate fixes the baseline's overconfident expansion recommendation and uses source-specific citations.",
		},
	},
	{
		caseId: "case-eval-loop",
		packetId: "packet-eval-loop",
		title: "Eval loop strategy briefing",
		packetTitle: "Eval Loop Strategy",
		packetSummary:
			"Notes comparing weekly human review, automated scoring, holdout cases, and release guardrails.",
		theme: "eval strategy",
		task: "Recommend whether to expand automated evals, balancing coverage, citation support, trace utility, and cost.",
		sources: [
			{
				id: "S1",
				title: "Quality review memo",
				excerpt:
					"Teams need smaller eval batches with visible failure clusters before expanding model coverage. The last broad run increased the number of cases scored, but reviewers could not tell which failures were repeated patterns and which were one-off mistakes.",
				documentType: "quality memo",
			},
			{
				id: "S2",
				title: "Release guardrail notes",
				excerpt:
					"Coverage can improve while grounding regresses, so citation support needs an explicit shipping gate. The suggested threshold is not a leaderboard target; it is a release block when candidate outputs make unsupported claims.",
				documentType: "release notes",
			},
			{
				id: "S3",
				title: "Cost review",
				excerpt:
					"Long traces help debug failures, but unchecked retries created a 1.34x cost increase in the last dry run. The finance reviewer accepted trace retention only if retries are capped and summarized in the run manifest.",
				documentType: "cost review",
			},
			{
				id: "S4",
				title: "Holdout protocol",
				excerpt:
					"Holdout cases should appear in dashboards as summaries and aggregate scores, but their tuning labels should stay out of prompt-iteration workflows. Reviewers want confidence that prompt changes are not simply memorizing visible examples.",
				documentType: "governance note",
			},
		],
		expectedCoverage: [
			"Smaller eval batches make failure clusters easier to inspect.",
			"Citation support must remain an explicit shipping gate when coverage improves.",
			"Trace depth is useful but retry behavior needs a cost guardrail.",
			"Holdout labels should not be exposed during prompt iteration.",
		],
		traps: [
			"Do not recommend expansion based only on coverage gains.",
			"Do not ignore the 1.34x retry-cost signal.",
			"Do not expose holdout tuning labels as part of the Genie product surface.",
		],
		holdout: false,
		demoHighlight: true,
		failureTags: ["citation-grounding", "cost-guardrail", "holdout-boundary"],
		notes: "Featured dashboard case for baseline versus candidate comparison.",
		baseline: {
			title: "Recommendation: expand automated eval coverage",
			summary:
				"The team should expand automated evals because broader coverage will speed review and provide more data for model iteration.",
			claims: [
				{
					text: "More cases will make the eval loop more reliable.",
					citations: ["S1"],
				},
				{
					text: "Coverage gains are enough to justify shipping the candidate.",
					citations: ["S2"],
				},
				{
					text: "Long traces are worth keeping because they help debug failures.",
					citations: ["S3"],
				},
			],
			openQuestions: [
				"How many cases should the next run include?",
				"How much trace detail should be retained?",
			],
			recommendation:
				"Expand automated evals and rely on reviewer spot checks to catch regressions.",
		},
		candidate: {
			title: "Recommendation: gate eval expansion on citation support",
			summary:
				"The eval loop is ready for broader automation only if citation support remains a release guardrail. Smaller batches with visible failure clusters are the safer next step.",
			claims: [
				{
					text: "Smaller eval batches make repeated failure patterns inspectable before widening model coverage.",
					citations: ["S1"],
				},
				{
					text: "Coverage gains should not ship when grounding regresses.",
					citations: ["S2"],
				},
				{
					text: "Trace depth is useful, but retry behavior needs a cost cap and run-manifest summary.",
					citations: ["S3"],
				},
				{
					text: "Holdout labels should remain outside prompt-iteration workflows.",
					citations: ["S4"],
				},
			],
			openQuestions: [
				"What citation-support threshold should block a candidate run?",
				"Which traces are worth keeping when retry costs rise?",
			],
			recommendation:
				"Run the next experiment as a small visible batch with citation support and cost ratio as explicit gates.",
		},
		evaluation: {
			scores: {
				overall: 0.88,
				grounding: 0.86,
				coverage: 0.92,
				citationSupport: 0.87,
			},
			failureTags: ["citation-grounding", "cost-guardrail"],
			rubricEvidence: [
				"Candidate rejects the baseline's coverage-only shipping logic.",
				"Candidate includes cost, trace, and holdout boundaries in the recommendation.",
			],
			citationSupport: [
				{
					citation: "S1",
					supported: true,
					note: "Supports smaller batches and failure clusters.",
				},
				{
					citation: "S2",
					supported: true,
					note: "Supports citation support as a release block.",
				},
				{
					citation: "S3",
					supported: true,
					note: "Supports trace value and 1.34x retry-cost guardrail.",
				},
				{
					citation: "S4",
					supported: true,
					note: "Supports holdout label restrictions.",
				},
			],
			notes:
				"Candidate grounds the shipping gate in citation support instead of treating coverage as sufficient.",
		},
	},
	{
		caseId: "case-code-review-queues",
		packetId: "packet-code-review-queues",
		title: "Code review queue briefing",
		packetTitle: "Code Review Queue Signals",
		packetSummary:
			"Operational notes on review latency, reviewer load, bot suggestions, and merge quality.",
		theme: "code review operations",
		task: "Recommend how to reduce code review queue time without increasing low-quality merges.",
		sources: [
			{
				id: "S1",
				title: "Queue analytics",
				excerpt:
					"Median review wait time improved from 19 hours to 13 hours after adding reviewer rotation. The 90th percentile is still 46 hours because complex changes often wait for the same two senior reviewers.",
				documentType: "analytics digest",
			},
			{
				id: "S2",
				title: "Reviewer survey",
				excerpt:
					"Reviewers like auto-assignment for routine changes, but they distrust bot approvals when tests are flaky or ownership is unclear. Several asked for risk labels that explain why a change is safe to fast-track.",
				documentType: "survey summary",
			},
			{
				id: "S3",
				title: "Post-merge defect review",
				excerpt:
					"Defects did not rise for small documentation and config changes, but two incidents came from fast-tracking cross-service changes without the owning team. The review lead wants different treatment for low-risk and cross-boundary changes.",
				documentType: "defect review",
			},
			{
				id: "S4",
				title: "Tooling proposal",
				excerpt:
					"The proposed queue helper can suggest reviewers, group similar low-risk changes, and surface missing ownership metadata. It cannot yet verify semantic ownership or override branch protection.",
				documentType: "tooling note",
			},
		],
		expectedCoverage: [
			"Median wait improved but tail latency remains high for complex changes.",
			"Fast-tracking should be limited to low-risk changes with clear ownership and healthy tests.",
			"Cross-service changes need owning-team review.",
			"The helper should suggest and label risk, not replace branch protection.",
		],
		traps: [
			"Do not recommend blanket bot approvals.",
			"Do not ignore post-merge incidents from cross-service fast-tracking.",
		],
		holdout: false,
		demoHighlight: true,
		failureTags: ["review-queue", "risk-labeling", "unsupported-automation"],
		notes:
			"Visible case for automation boundaries and risk-aware recommendations.",
		baseline: {
			title: "Recommendation: automate routine code reviews",
			summary:
				"Review waits are improving, so the queue helper should approve routine changes and free senior reviewers for complex work.",
			claims: [
				{
					text: "Reviewer rotation already reduced median wait time.",
					citations: ["S1"],
				},
				{
					text: "Bot approvals are acceptable for routine changes.",
					citations: ["S2"],
				},
				{
					text: "Fast-tracking did not increase defects.",
					citations: ["S3"],
				},
			],
			openQuestions: ["Which changes should count as routine?"],
			recommendation:
				"Enable bot approvals for routine changes and monitor defect rates.",
		},
		candidate: {
			title: "Recommendation: fast-track only labeled low-risk changes",
			summary:
				"Use the queue helper to reduce tail latency, but keep it advisory. Fast-track only low-risk changes with clear ownership and healthy tests, while routing cross-service changes to owning teams.",
			claims: [
				{
					text: "Queue tail latency is still concentrated in complex changes that wait for senior reviewers.",
					citations: ["S1"],
				},
				{
					text: "Reviewers need risk labels before trusting automation on routine changes.",
					citations: ["S2", "S4"],
				},
				{
					text: "Cross-service changes should not be fast-tracked without owning-team review.",
					citations: ["S3"],
				},
			],
			openQuestions: [
				"Which ownership metadata is reliable enough to drive risk labels?",
				"Should flaky-test status automatically block fast-track suggestions?",
			],
			recommendation:
				"Ship advisory reviewer suggestions and risk labels first; defer any auto-approval path until ownership and test-health gates are proven.",
		},
		evaluation: {
			scores: {
				overall: 0.82,
				grounding: 0.8,
				coverage: 0.84,
				citationSupport: 0.81,
			},
			failureTags: ["risk-labeling", "unsupported-automation"],
			rubricEvidence: [
				"Candidate distinguishes low-risk changes from cross-service changes.",
				"Candidate keeps the helper advisory because the source says it cannot verify semantic ownership.",
			],
			citationSupport: [
				{
					citation: "S1",
					supported: true,
					note: "Supports median and tail latency framing.",
				},
				{
					citation: "S2",
					supported: true,
					note: "Supports reviewer distrust and risk-label request.",
				},
				{
					citation: "S3",
					supported: true,
					note: "Supports cross-service fast-track incident risk.",
				},
				{
					citation: "S4",
					supported: true,
					note: "Supports helper capabilities and limitations.",
				},
			],
			notes:
				"Candidate avoids the baseline's unsupported leap from suggestions to approvals.",
		},
	},
	{
		caseId: "case-release-note-drift",
		packetId: "packet-release-note-drift",
		title: "Release note drift briefing",
		packetTitle: "Release Note Drift Packet",
		packetSummary:
			"Signals about generated release notes, stale changelog entries, customer-facing accuracy, and reviewer workflow.",
		theme: "release communications",
		task: "Advise how to improve generated release notes while keeping customer-facing claims accurate.",
		sources: [
			{
				id: "S1",
				title: "Changelog audit",
				excerpt:
					"The generated notes covered 83% of merged changes, but 14% of entries described behavior that changed after final QA. The highest-risk errors came from stale pull-request descriptions that were never updated after scope cuts.",
				documentType: "audit summary",
			},
			{
				id: "S2",
				title: "Customer success note",
				excerpt:
					"Customers value concise release notes, especially migration warnings and compatibility caveats. One customer escalated because a generated note promised an admin toggle that was removed before release.",
				documentType: "customer summary",
			},
			{
				id: "S3",
				title: "Engineering workflow memo",
				excerpt:
					"Engineers can tag final-release deltas during QA, but they will not maintain a second changelog manually. The memo recommends a review queue that highlights changed or removed claims rather than asking authors to rewrite every note.",
				documentType: "workflow memo",
			},
			{
				id: "S4",
				title: "Compliance review",
				excerpt:
					"Any customer-facing note that mentions security, data retention, or access control requires explicit human approval. The reviewer said summarization speed is useful only if sensitive claims are easy to spot.",
				documentType: "compliance review",
			},
		],
		expectedCoverage: [
			"Generated notes have good coverage but drift when PR descriptions become stale.",
			"Customer-facing accuracy matters most for migration, compatibility, and removed features.",
			"Workflow should highlight changed or removed claims instead of requiring a second manual changelog.",
			"Sensitive claims require explicit human approval.",
		],
		traps: [
			"Do not treat 83% coverage as proof the notes are safe to publish.",
			"Do not omit human approval for security, data-retention, or access-control claims.",
		],
		holdout: false,
		demoHighlight: true,
		failureTags: ["stale-source", "human-approval", "customer-claim-risk"],
		notes: "Featured case for stale evidence and human approval gates.",
		baseline: {
			title: "Recommendation: publish generated release notes with spot review",
			summary:
				"Generated release notes cover most changes, so the team should publish them faster and rely on spot review for sensitive items.",
			claims: [
				{
					text: "Generated notes cover most merged changes.",
					citations: ["S1"],
				},
				{
					text: "Customers prefer concise notes over exhaustive manual changelogs.",
					citations: ["S2"],
				},
				{
					text: "Engineers do not want to maintain a second changelog.",
					citations: ["S3"],
				},
			],
			openQuestions: [
				"How often should reviewers sample generated notes?",
				"Which customers need extra release detail?",
			],
			recommendation:
				"Publish generated release notes after a lightweight spot review.",
		},
		candidate: {
			title:
				"Recommendation: gate generated notes on drift and sensitive-claim review",
			summary:
				"Generated release notes are useful, but coverage is not the limiting risk. Add a drift review for changed or removed claims, and require explicit approval for sensitive customer-facing statements.",
			claims: [
				{
					text: "Release-note coverage is high, but stale PR descriptions create customer-facing inaccuracies.",
					citations: ["S1", "S2"],
				},
				{
					text: "The workflow should highlight changed or removed claims instead of asking engineers to maintain a second changelog.",
					citations: ["S3"],
				},
				{
					text: "Security, retention, and access-control claims need explicit human approval before publication.",
					citations: ["S4"],
				},
			],
			openQuestions: [
				"Can QA delta tags be generated automatically from merged scope changes?",
				"Which release-note categories should be blocked until compliance approval is recorded?",
			],
			recommendation:
				"Ship generated notes behind a drift-highlighting review queue, with hard approval gates for sensitive claims.",
		},
		evaluation: {
			scores: {
				overall: 0.84,
				grounding: 0.82,
				coverage: 0.87,
				citationSupport: 0.83,
			},
			failureTags: ["stale-source", "human-approval"],
			rubricEvidence: [
				"Candidate treats stale PR descriptions as the central risk rather than celebrating coverage alone.",
				"Candidate includes the compliance approval gate for sensitive claims.",
			],
			citationSupport: [
				{
					citation: "S1",
					supported: true,
					note: "Supports coverage and stale-description drift.",
				},
				{
					citation: "S2",
					supported: true,
					note: "Supports customer-facing impact of removed features.",
				},
				{
					citation: "S3",
					supported: true,
					note: "Supports drift queue instead of manual second changelog.",
				},
				{
					citation: "S4",
					supported: true,
					note: "Supports sensitive-claim approval gate.",
				},
			],
			notes:
				"Candidate improves over baseline by adding drift detection and human approval for sensitive claims.",
		},
	},
	{
		caseId: "case-human-approval-boundary",
		packetId: "packet-human-approval",
		title: "Human approval boundary briefing",
		packetTitle: "Human Approval Boundary Packet",
		packetSummary:
			"Notes about when AI-generated operational recommendations can act automatically versus require review.",
		theme: "human governance",
		task: "Recommend which Briefing Genie actions can be automated and which should require human approval.",
		sources: [
			{
				id: "S1",
				title: "Governance workshop",
				excerpt:
					"Participants approved automatic drafting, summarization, and artifact linking when outputs are clearly marked as generated. They rejected automatic policy changes, customer commitments, and release blocking without a human approver.",
				documentType: "workshop notes",
			},
			{
				id: "S2",
				title: "Operations incident note",
				excerpt:
					"A prior automation posted a recommendation as if it were an approved decision, causing two teams to pause rollout work unnecessarily. The incident review asks for explicit status labels: draft, recommendation, approved action, and blocked.",
				documentType: "incident review",
			},
			{
				id: "S3",
				title: "Product analytics",
				excerpt:
					"Users are most likely to accept generated briefings when the interface separates evidence, recommendation, and action controls. Acceptance drops when the recommendation and execution button appear in the same visual cluster.",
				documentType: "analytics digest",
			},
			{
				id: "S4",
				title: "Legal review",
				excerpt:
					"Any automated message that could be interpreted as a customer commitment needs an accountable human reviewer. Legal approved internal draft summaries as long as they cannot be confused with final commitments.",
				documentType: "legal review",
			},
		],
		expectedCoverage: [
			"Drafting, summarization, and artifact linking can be automated with generated status.",
			"Policy changes, customer commitments, and release blocking require human approval.",
			"UI status labels should distinguish drafts, recommendations, approved actions, and blocked states.",
			"Recommendation and execution controls should be visually separated.",
		],
		traps: [
			"Do not allow automated customer commitments.",
			"Do not present generated recommendations as approved decisions.",
		],
		holdout: false,
		demoHighlight: false,
		failureTags: ["human-approval", "action-boundary"],
		notes:
			"Visible governance case for distinguishing recommendation from action.",
		baseline: {
			title: "Recommendation: automate low-risk lab actions",
			summary:
				"Briefing Genie can automate many lab actions if it keeps a human in the loop for major decisions.",
			claims: [
				{
					text: "Drafting and summaries are acceptable automation candidates.",
					citations: ["S1"],
				},
				{
					text: "Teams were confused by a prior automated recommendation.",
					citations: ["S2"],
				},
				{
					text: "Users accept generated briefings when evidence is visible.",
					citations: ["S3"],
				},
			],
			openQuestions: ["Which actions are low risk enough to automate?"],
			recommendation:
				"Automate routine lab actions and ask for approval only on major decisions.",
		},
		candidate: {
			title: "Recommendation: automate drafting, not approval",
			summary:
				"Briefing Genie can automate draft briefings, summaries, and artifact links, but decisions that change policy, block releases, or commit to customers need explicit human approval and clear status labels.",
			claims: [
				{
					text: "Automatic drafting and artifact linking are acceptable when outputs are labeled as generated.",
					citations: ["S1"],
				},
				{
					text: "Generated recommendations must not appear as approved decisions or blocked states.",
					citations: ["S2"],
				},
				{
					text: "Evidence, recommendations, and action controls should remain visually distinct.",
					citations: ["S3"],
				},
				{
					text: "Customer commitments require an accountable human reviewer.",
					citations: ["S4"],
				},
			],
			openQuestions: [
				"Which UI labels should map to backend artifact statuses?",
				"Should customer-facing messages be blocked unless an approver is recorded?",
			],
			recommendation:
				"Let Genie draft and link evidence automatically, but require human approval for policy, release, and customer-commitment actions.",
		},
		evaluation: {
			scores: {
				overall: 0.81,
				grounding: 0.79,
				coverage: 0.85,
				citationSupport: 0.8,
			},
			failureTags: ["human-approval", "action-boundary"],
			rubricEvidence: [
				"Candidate distinguishes drafting from approved action.",
				"Candidate cites the incident review and legal review for approval boundaries.",
			],
			citationSupport: [
				{
					citation: "S1",
					supported: true,
					note: "Supports allowed automatic drafting and disallowed policy changes.",
				},
				{
					citation: "S2",
					supported: true,
					note: "Supports status-label need from prior incident.",
				},
				{
					citation: "S3",
					supported: true,
					note: "Supports visual separation of evidence, recommendation, and actions.",
				},
				{
					citation: "S4",
					supported: true,
					note: "Supports human review for customer commitments.",
				},
			],
			notes:
				"Candidate keeps automation bounded to draft and evidence workflows.",
		},
	},
	{
		caseId: "case-cost-latency-budget",
		packetId: "packet-cost-latency",
		title: "Cost and latency budget briefing",
		packetTitle: "Cost And Latency Budget Packet",
		packetSummary:
			"Run data, finance guidance, and user feedback about trace depth, retries, and demo responsiveness.",
		theme: "cost latency tradeoff",
		task: "Recommend how much tracing and retry behavior to keep for the next demo run.",
		sources: [
			{
				id: "S1",
				title: "Run telemetry",
				excerpt:
					"The candidate prompt reduced unsupported claims but increased median token usage by 11%. Latency improved by 6% because fewer generations needed manual reruns, even though each retained trace is longer.",
				documentType: "telemetry report",
			},
			{
				id: "S2",
				title: "Finance guidance",
				excerpt:
					"Finance approved up to a 1.15x cost ratio for demo-quality eval runs if the report shows why extra tokens reduce review time. Anything above that threshold needs a smaller case batch or stricter retry cap.",
				documentType: "finance note",
			},
			{
				id: "S3",
				title: "Reviewer feedback",
				excerpt:
					"Reviewers said long traces are useful only when they are summarized next to the claim that failed. Raw provider payloads alone slowed review because people had to search for the relevant evidence.",
				documentType: "reviewer feedback",
			},
			{
				id: "S4",
				title: "Demo rehearsal",
				excerpt:
					"The live demo felt responsive when single briefings finished under 10 seconds and eval progress showed the current case. Stakeholders were tolerant of longer full runs if progress and artifact paths updated continuously.",
				documentType: "rehearsal note",
			},
		],
		expectedCoverage: [
			"Candidate cost increased but stays within the 1.15x guardrail.",
			"Latency improved because fewer manual reruns were needed.",
			"Long traces need claim-level summaries, not raw payloads alone.",
			"Single-briefing UX should stay under 10 seconds while eval runs show progress.",
		],
		traps: [
			"Do not optimize cost by deleting traces reviewers need for grounding failures.",
			"Do not ignore the 1.15x cost threshold.",
		],
		holdout: false,
		demoHighlight: false,
		failureTags: ["cost-guardrail", "trace-usability", "latency"],
		notes: "Visible case for cost and latency guardrail behavior.",
		baseline: {
			title: "Recommendation: keep full traces for the next run",
			summary:
				"Full traces are valuable for debugging, and the next demo should preserve them even if token usage rises.",
			claims: [
				{
					text: "The candidate reduced unsupported claims with a modest token increase.",
					citations: ["S1"],
				},
				{
					text: "Finance allows some cost growth for demo-quality evals.",
					citations: ["S2"],
				},
				{
					text: "Reviewers find traces useful for debugging.",
					citations: ["S3"],
				},
			],
			openQuestions: ["How much trace detail is enough?"],
			recommendation:
				"Keep full traces for all cases and revisit cost after the demo.",
		},
		candidate: {
			title: "Recommendation: keep summarized traces inside the cost guardrail",
			summary:
				"Keep trace depth where it helps reviewers verify failed claims, but summarize traces at claim level and cap retries so the run stays under the 1.15x cost guardrail.",
			claims: [
				{
					text: "The candidate's extra token cost is currently inside the approved 1.15x guardrail.",
					citations: ["S1", "S2"],
				},
				{
					text: "Trace retention is useful only when summarized near the failed claim.",
					citations: ["S3"],
				},
				{
					text: "The product UX should keep single briefings under 10 seconds while lab runs show progress and artifact paths.",
					citations: ["S4"],
				},
			],
			openQuestions: [
				"Which trace fields should be summarized next to evaluator failures?",
				"What retry cap keeps the candidate below the finance threshold on larger batches?",
			],
			recommendation:
				"Retain claim-level trace summaries, cap retries, and shrink the batch if cost rises above 1.15x.",
		},
		evaluation: {
			scores: {
				overall: 0.8,
				grounding: 0.78,
				coverage: 0.83,
				citationSupport: 0.78,
			},
			failureTags: ["cost-guardrail", "trace-usability"],
			rubricEvidence: [
				"Candidate preserves traces but adds claim-level summarization and retry caps.",
				"Candidate ties the recommendation to the 1.15x finance guardrail and 10-second UX target.",
			],
			citationSupport: [
				{
					citation: "S1",
					supported: true,
					note: "Supports token and latency changes.",
				},
				{
					citation: "S2",
					supported: true,
					note: "Supports 1.15x cost guardrail.",
				},
				{
					citation: "S3",
					supported: true,
					note: "Supports claim-level trace summaries.",
				},
				{
					citation: "S4",
					supported: true,
					note: "Supports under-10-second single briefing and progress updates.",
				},
			],
			notes:
				"Candidate is grounded but still needs stronger specificity on retry caps in a live runner.",
		},
	},
	{
		caseId: "case-incident-recovery-comms",
		packetId: "packet-incident-recovery",
		title: "Incident recovery communication briefing",
		packetTitle: "Incident Recovery Communication Packet",
		packetSummary:
			"Support, status-page, and customer-success notes about communicating recovery after failed installs.",
		theme: "incident communication",
		task: "Recommend how Briefing Genie should summarize recovery work after a setup incident.",
		sources: [
			{
				id: "S1",
				title: "Support incident recap",
				excerpt:
					"A failed installer release caused 31 setup tickets in two days. The highest-friction users had partial installs: they could not tell whether to rerun setup, clear credentials, or wait for a patched CLI.",
				documentType: "support recap",
			},
			{
				id: "S2",
				title: "Status page draft",
				excerpt:
					"The draft status update says the issue is resolved, but engineering has only verified recovery on macOS and Linux. Windows recovery steps are still being validated by the tooling team.",
				documentType: "status draft",
			},
			{
				id: "S3",
				title: "Customer success guidance",
				excerpt:
					"Customer success wants a concise message that separates who is affected, what action they should take, and which environments are still pending validation. They specifically asked not to claim universal resolution until Windows is verified.",
				documentType: "customer guidance",
			},
			{
				id: "S4",
				title: "Engineering fix note",
				excerpt:
					"The patched CLI adds a recovery command that checks stale credentials and cleans partial install state. The command is available in the release candidate, but docs screenshots still show the old installer flow.",
				documentType: "engineering note",
			},
		],
		expectedCoverage: [
			"Partial installs created unclear recovery choices.",
			"The issue is not universally resolved until Windows recovery is validated.",
			"Customer communication should separate affected users, recommended action, and pending environments.",
			"Docs need updates for the patched recovery command.",
		],
		traps: [
			"Do not say the incident is fully resolved across all environments.",
			"Do not omit the Windows validation caveat.",
		],
		holdout: false,
		demoHighlight: false,
		failureTags: ["setup-recovery", "stale-source", "customer-claim-risk"],
		notes: "Visible case for avoiding overbroad incident-resolution claims.",
		baseline: {
			title: "Recommendation: announce installer recovery resolution",
			summary:
				"The installer issue has a patched CLI recovery command, so the team should announce resolution and point users to the new recovery path.",
			claims: [
				{
					text: "The failed installer caused a spike in setup tickets.",
					citations: ["S1"],
				},
				{
					text: "The issue is resolved and ready for customer communication.",
					citations: ["S2"],
				},
				{
					text: "The patched CLI gives users a recovery command.",
					citations: ["S4"],
				},
			],
			openQuestions: ["When should docs screenshots be updated?"],
			recommendation:
				"Publish the recovery announcement and update docs afterward.",
		},
		candidate: {
			title:
				"Recommendation: communicate partial recovery with environment caveats",
			summary:
				"Briefing Genie should summarize the incident as partially recovered: macOS and Linux are verified, Windows remains pending, and users need clear steps for partial installs and stale credentials.",
			claims: [
				{
					text: "The incident created recovery confusion for users with partial installs.",
					citations: ["S1"],
				},
				{
					text: "Resolution should not be described as universal until Windows recovery is validated.",
					citations: ["S2", "S3"],
				},
				{
					text: "The patched CLI recovery command needs matching docs updates before broad rollout.",
					citations: ["S4"],
				},
			],
			openQuestions: [
				"When will Windows recovery validation finish?",
				"Can docs show the new recovery command before the release candidate is promoted?",
			],
			recommendation:
				"Send a segmented recovery message now, with clear Windows caveats and docs updates tied to the patched recovery command.",
		},
		evaluation: {
			scores: {
				overall: 0.83,
				grounding: 0.81,
				coverage: 0.86,
				citationSupport: 0.82,
			},
			failureTags: ["customer-claim-risk", "stale-source"],
			rubricEvidence: [
				"Candidate avoids the baseline's unsupported universal-resolution claim.",
				"Candidate separates affected users, action, and pending environments.",
			],
			citationSupport: [
				{
					citation: "S1",
					supported: true,
					note: "Supports partial-install recovery confusion.",
				},
				{
					citation: "S2",
					supported: true,
					note: "Supports macOS/Linux-only verification and Windows caveat.",
				},
				{
					citation: "S3",
					supported: true,
					note: "Supports customer-success communication structure.",
				},
				{
					citation: "S4",
					supported: true,
					note: "Supports patched recovery command and stale docs.",
				},
			],
			notes:
				"Candidate grounds the communication plan in environment-specific evidence.",
		},
	},
	{
		caseId: "case-runtime-choice",
		packetId: "packet-local-cloud",
		title: "Runtime choice briefing",
		packetTitle: "Local vs Cloud Execution",
		packetSummary:
			"Synthetic planning packet for a product decision on local reliability, hosted convenience, and demo risk.",
		theme: "runtime decision",
		task: "Advise whether the demo should stay local or move to hosted previews for the next iteration.",
		sources: [
			{
				id: "S1",
				title: "Reliability review",
				excerpt:
					"Local operation keeps the demo inspectable and makes file-backed artifacts easy to explain. The tradeoff is setup fragility: dependency pinning, seed commands, and deterministic fixture validation must be boring before a live walkthrough.",
				documentType: "reliability review",
			},
			{
				id: "S2",
				title: "Go-to-market note",
				excerpt:
					"Hosted previews reduce onboarding friction for reviewers who do not want to run the app locally. The current roadmap, however, has no production hosting plan and no owner for preview secrets, deploys, or data retention.",
				documentType: "planning note",
			},
			{
				id: "S3",
				title: "Security note",
				excerpt:
					"Public fixtures must avoid private planning paths, customer identifiers, and unreleased vendor data. Hosted previews would also need environment-variable review before anyone shares a link externally.",
				documentType: "security review",
			},
			{
				id: "S4",
				title: "Demo rehearsal",
				excerpt:
					"The local demo failed once because a stale runtime used the wrong package manager. After mise pinned the runtime, the second rehearsal succeeded and reviewers valued seeing artifacts written directly into the repo.",
				documentType: "rehearsal note",
			},
		],
		expectedCoverage: [
			"Local operation improves inspectability but requires reliable dependency pinning and seed data.",
			"Hosted previews reduce onboarding friction but are outside the current hosting plan.",
			"Public fixtures must exclude private paths, customer identifiers, and unreleased vendor data.",
			"Runtime pinning reduced local demo risk in rehearsal.",
		],
		traps: [
			"Do not invent a production hosting plan.",
			"Do not treat public fixture safety as optional.",
			"Do not expose holdout tuning labels in the product UI.",
		],
		holdout: true,
		demoHighlight: false,
		failureTags: ["runtime-choice", "public-data-safety"],
		notes:
			"Holdout-style summary case; tuning labels should remain read-only in the lab.",
	},
	{
		caseId: "case-model-routing-policy",
		packetId: "packet-model-routing",
		title: "Model routing policy briefing",
		packetTitle: "Model Routing Policy Packet",
		packetSummary:
			"Holdout packet about routing simple and high-risk briefing jobs across model tiers.",
		theme: "model routing",
		task: "Recommend a model-routing policy for low-risk summaries versus high-risk recommendations.",
		sources: [
			{
				id: "S1",
				title: "Latency experiment",
				excerpt:
					"The smaller model answered routine summaries 42% faster with similar coverage on low-risk cases. It missed two caveats on high-risk recommendation cases where source documents contradicted each other.",
				documentType: "experiment report",
			},
			{
				id: "S2",
				title: "Cost analysis",
				excerpt:
					"Routing low-risk summaries to the smaller model would reduce estimated demo-run cost by 18%. The savings disappear if high-risk cases require multiple retries after a missed caveat.",
				documentType: "cost note",
			},
			{
				id: "S3",
				title: "Evaluator notes",
				excerpt:
					"Evaluator failures cluster around unsupported recommendations, not factual extraction. The routing policy should consider task risk and source disagreement rather than only packet length.",
				documentType: "evaluator synthesis",
			},
			{
				id: "S4",
				title: "Product manager note",
				excerpt:
					"The PM wants a simple rule that can be explained in a demo: routine summaries may use the fast path, but recommendations that change release, customer, or compliance posture need the stronger model and citation checks.",
				documentType: "planning note",
			},
		],
		expectedCoverage: [
			"Smaller models are faster for low-risk summaries.",
			"High-risk recommendation cases need stronger models when sources conflict.",
			"Cost savings disappear if missed caveats cause retries.",
			"Routing should consider task risk and source disagreement, not only packet length.",
		],
		traps: [
			"Do not route solely by source-packet length.",
			"Do not send release, customer, or compliance recommendations through the fast path without checks.",
		],
		holdout: true,
		demoHighlight: false,
		failureTags: ["model-routing", "cost-guardrail", "citation-grounding"],
		notes:
			"Holdout case for routing-policy robustness; expected labels should stay out of product flows.",
	},
];

function briefingId(caseId: string, variant: "baseline" | "candidate") {
	return `briefing-${caseId.replace(/^case-/, "")}-${variant}`;
}

function traceId(caseId: string) {
	return `trace-${caseId.replace(/^case-/, "")}-candidate`;
}

function evaluationId(caseId: string) {
	return `evaluation-${caseId.replace(/^case-/, "")}-candidate`;
}

function sourcePacketFor(fixture: CaseFixture): SourcePacket {
	return {
		id: fixture.packetId,
		title: fixture.packetTitle,
		summary: fixture.packetSummary,
		caseId: fixture.caseId,
		sources: fixture.sources,
		metadata: {
			theme: fixture.theme,
			synthetic: true,
			publicSafe: true,
			createdBy: "phase-5-expanded-eval-set",
		},
	};
}

function evalCaseFor(fixture: CaseFixture): EvalCase {
	return {
		id: fixture.caseId,
		title: fixture.title,
		sourcePacketId: fixture.packetId,
		task: fixture.task,
		expectedCoverage: fixture.expectedCoverage,
		traps: fixture.traps,
		acceptedCitations: fixture.sources.map((source) => source.id),
		holdout: fixture.holdout,
		demoHighlight: fixture.demoHighlight,
		failureTags: fixture.failureTags,
		metadata: {
			synthetic: true,
			publicSafe: true,
			notes: fixture.notes,
		},
	};
}

function briefingFor(
	fixture: CaseFixture,
	variant: "baseline" | "candidate",
): BriefingOutput {
	const seed = fixture[variant];
	if (!seed) {
		throw new Error(`Missing ${variant} briefing seed for ${fixture.caseId}`);
	}

	return {
		id: briefingId(fixture.caseId, variant),
		sourcePacketId: fixture.packetId,
		caseId: fixture.caseId,
		title: seed.title,
		summary: seed.summary,
		claims: seed.claims,
		openQuestions: seed.openQuestions,
		recommendation: seed.recommendation,
		metadata: {
			variant: variant === "baseline" ? "baseline" : "candidate-citation-gates",
			runId: variant === "baseline" ? baselineRunId : candidateRunId,
			model: "seeded-fixture",
		},
	};
}

function traceFor(fixture: CaseFixture): GenerationTrace {
	const output = briefingFor(fixture, "candidate");
	const tracePath = `runs/${candidateRunId}/traces/${fixture.caseId}.json`;
	const briefingPath = `runs/${candidateRunId}/briefings/${fixture.packetId}.json`;

	return {
		id: traceId(fixture.caseId),
		runId: candidateRunId,
		caseId: fixture.caseId,
		sourcePacketId: fixture.packetId,
		input: {
			userRequest: fixture.task,
			sourcePacketPath: `data/source-packets/${fixture.packetId}.json`,
		},
		messages: [
			{
				role: "system",
				content:
					"You are Briefing Genie. Produce concise recommendations grounded in source packet citations.",
			},
			{
				role: "user",
				content: fixture.task,
			},
			{
				role: "assistant",
				content: output.summary,
			},
		],
		model: {
			provider: "seeded-fixture",
			name: "phase-5-candidate",
			temperature: 0,
		},
		output,
		toolCalls: [
			{
				id: `tool-read-${fixture.caseId.replace(/^case-/, "")}`,
				toolName: "read_source_packet",
				arguments: {
					sourcePacketId: fixture.packetId,
				},
				result: {
					sourceCount: fixture.sources.length,
					sourceIds: fixture.sources.map((source) => source.id),
				},
				status: "success",
				startedAt: "2026-06-18T17:45:00.000Z",
				endedAt: "2026-06-18T17:45:00.005Z",
			},
		],
		cost: {
			inputTokens: 1800 + fixture.sources.length * 120,
			outputTokens: 420,
			estimatedUsd: 0.014,
		},
		latencyMs: 7200 + fixture.sources.length * 120,
		artifactPaths: [
			`data/source-packets/${fixture.packetId}.json`,
			briefingPath,
			tracePath,
		],
	};
}

function evaluationFor(fixture: CaseFixture): EvaluatorOutput {
	if (!fixture.evaluation) {
		throw new Error(`Missing evaluator seed for ${fixture.caseId}`);
	}

	return {
		id: evaluationId(fixture.caseId),
		runId: candidateRunId,
		caseId: fixture.caseId,
		scores: fixture.evaluation.scores,
		failureTags: fixture.evaluation.failureTags,
		rubricEvidence: fixture.evaluation.rubricEvidence,
		citationSupport: fixture.evaluation.citationSupport,
		notes: fixture.evaluation.notes,
		artifactPaths: [
			`runs/${candidateRunId}/evaluations/${fixture.caseId}.json`,
			`runs/${candidateRunId}/briefings/${fixture.packetId}.json`,
		],
	};
}

function runManifestFor(
	variant: "baseline" | "candidate",
	visibleFixtures: CaseFixture[],
): RunManifest {
	const runId = variant === "baseline" ? baselineRunId : candidateRunId;
	const isCandidate = variant === "candidate";
	const briefingPaths = visibleFixtures.map(
		(fixture) => `runs/${runId}/briefings/${fixture.packetId}.json`,
	);
	const candidateArtifactPaths = isCandidate
		? [
				...visibleFixtures.map(
					(fixture) => `runs/${runId}/traces/${fixture.caseId}.json`,
				),
				...visibleFixtures.map(
					(fixture) => `runs/${runId}/evaluations/${fixture.caseId}.json`,
				),
				"reports/latest-eval-summary.md",
			]
		: [];

	return {
		runId,
		createdAt: isCandidate
			? "2026-06-18T17:45:00.000Z"
			: "2026-06-10T15:30:00.000Z",
		variantLabel: isCandidate ? "candidate-citation-gates" : "baseline",
		status: "complete",
		gitRef: isCandidate ? "synthetic-candidate-phase-5" : "synthetic-baseline",
		command: isCandidate
			? "bun run data:seed-phase5 -- --variant candidate-citation-gates"
			: "bun run data:seed-phase5 -- --variant baseline",
		caseIds: fixtures.map((fixture) => fixture.caseId),
		aggregateMetrics: isCandidate
			? {
					overall: 0.83,
					grounding: 0.79,
					coverage: 0.86,
					citationSupport: 0.8,
					unsupportedClaims: 7,
					medianLatencyMs: 7900,
					costRatio: 1.1,
					latencyRatio: 0.94,
				}
			: {
					overall: 0.66,
					grounding: 0.52,
					coverage: 0.74,
					citationSupport: 0.51,
					unsupportedClaims: 26,
					medianLatencyMs: 8400,
					costRatio: 1,
					latencyRatio: 1,
				},
		guardrails: [
			{
				id: "citation-support",
				label: "Citation support",
				status: isCandidate ? "pass" : "fail",
				value: isCandidate ? "0.80" : "0.51",
				threshold: ">= 0.72",
			},
			{
				id: "cost-ratio",
				label: "Cost ratio",
				status: isCandidate ? "warn" : "pass",
				value: isCandidate ? "1.10x" : "1.00x",
				threshold: "<= 1.15x",
			},
		],
		artifactPaths: [
			`runs/${runId}/manifest.json`,
			...briefingPaths,
			...candidateArtifactPaths,
		],
	};
}

function comparisonFor(): RunComparison {
	return {
		id: "baseline-2026-06-10-candidate-citation-gates",
		baselineRunId,
		candidateRunId,
		metrics: [
			{
				label: "Overall quality",
				value: "0.83",
				delta: "+0.17",
				status: "Candidate clears expanded set",
				tone: "green",
			},
			{
				label: "Citation grounding",
				value: "0.79",
				delta: "+0.27",
				status: "Unsupported synthesis reduced",
				tone: "green",
			},
			{
				label: "Coverage",
				value: "0.86",
				delta: "+0.12",
				status: "Expected points covered",
				tone: "blue",
			},
			{
				label: "Cost ratio",
				value: "1.10x",
				delta: "+0.10x",
				status: "Inside 1.15x guardrail",
				tone: "amber",
			},
			{
				label: "Latency ratio",
				value: "0.94x",
				delta: "-0.06x",
				status: "Faster than baseline",
				tone: "green",
			},
		],
		trend: [
			{
				label: "Base",
				score: 66,
			},
			{
				label: "Trace",
				score: 72,
			},
			{
				label: "Cite",
				score: 79,
			},
			{
				label: "Phase 5",
				score: 83,
			},
		],
		comparisonRows: [
			{
				metric: "Overall score",
				baseline: "0.66",
				candidate: "0.83",
				delta: "+0.17",
			},
			{
				metric: "Citation support",
				baseline: "0.51",
				candidate: "0.80",
				delta: "+0.29",
			},
			{
				metric: "Unsupported claims",
				baseline: "26",
				candidate: "7",
				delta: "-19",
			},
			{
				metric: "Visible eval cases",
				baseline: "7",
				candidate: "7",
				delta: "0",
			},
			{
				metric: "Median latency",
				baseline: "8.4s",
				candidate: "7.9s",
				delta: "-0.5s",
			},
		],
		failureClusters: [
			{
				title: "Unsupported rollout recommendations",
				count: 5,
				severity: "High",
				evidence:
					"Baseline outputs often turn partial progress signals into broad rollout or publication recommendations.",
				cases: [
					"case-adoption-friction",
					"case-eval-loop",
					"case-release-note-drift",
					"case-incident-recovery-comms",
					"case-human-approval-boundary",
				],
			},
			{
				title: "Weak citation selection",
				count: 4,
				severity: "High",
				evidence:
					"Outputs cite broadly relevant sources but miss the snippet that contains the actual gate, caveat, or constraint.",
				cases: [
					"case-code-review-queues",
					"case-eval-loop",
					"case-cost-latency-budget",
					"case-adoption-friction",
				],
			},
			{
				title: "Cost and latency tradeoff too vague",
				count: 3,
				severity: "Medium",
				evidence:
					"Recommendations mention cost or speed without tying the decision to the 1.15x guardrail, retry caps, or progress UX.",
				cases: [
					"case-cost-latency-budget",
					"case-eval-loop",
					"case-runtime-choice",
				],
			},
			{
				title: "Holdout boundary risk",
				count: 2,
				severity: "Medium",
				evidence:
					"Holdout cases should remain visible as summaries while their tuning labels stay out of product flows.",
				cases: ["case-runtime-choice", "case-model-routing-policy"],
			},
		],
		featuredCase: {
			id: "case-release-note-drift",
			title: "Release note drift briefing",
			sourceExcerpt:
				"The generated notes covered 83% of merged changes, but 14% of entries described behavior that changed after final QA.",
			baseline:
				"Publish generated release notes after a lightweight spot review because coverage is high and customers prefer concise notes.",
			candidate:
				"Gate generated notes on drift review for changed or removed claims, and require explicit approval for sensitive customer-facing statements.",
			evaluatorNote:
				"Candidate keeps the coverage benefit while grounding the shipping gate in stale-source drift and compliance evidence.",
		},
		recommendation: {
			tone: "green",
			label: "ready for runtime",
			text: "Use the expanded synthetic set as the default demo eval surface before adding live LLM generation and lab-owned run orchestration.",
			warning:
				"Cost remains inside guardrail, but the next runtime slice should keep retry caps and claim-level trace summaries visible.",
		},
		artifactPaths: [
			"runs/baseline-2026-06-10/manifest.json",
			"runs/candidate-citation-gates/manifest.json",
			"runs/candidate-citation-gates/traces/case-release-note-drift.json",
			"runs/candidate-citation-gates/evaluations/case-release-note-drift.json",
			"reports/latest-eval-summary.md",
		],
	};
}

async function cleanJsonFiles(relativeDir: string) {
	const directory = path.join(repoRoot, relativeDir);
	await mkdir(directory, { recursive: true });
	const entries = await readdir(directory, { withFileTypes: true });

	await Promise.all(
		entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
			.map((entry) => unlink(path.join(directory, entry.name))),
	);
}

async function writeJson(relativePath: string, value: unknown) {
	const filePath = path.join(repoRoot, relativePath);
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(value, null, "\t")}\n`);
}

async function writeText(relativePath: string, value: string) {
	const filePath = path.join(repoRoot, relativePath);
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, value);
}

async function main() {
	const visibleFixtures = fixtures.filter((fixture) => !fixture.holdout);
	await Promise.all([
		cleanJsonFiles("data/source-packets"),
		cleanJsonFiles("data/eval-cases"),
		cleanJsonFiles(`runs/${baselineRunId}/briefings`),
		cleanJsonFiles(`runs/${candidateRunId}/briefings`),
		cleanJsonFiles(`runs/${candidateRunId}/traces`),
		cleanJsonFiles(`runs/${candidateRunId}/evaluations`),
	]);

	await Promise.all(
		fixtures.flatMap((fixture) => [
			writeJson(
				`data/source-packets/${fixture.packetId}.json`,
				sourcePacketFor(fixture),
			),
			writeJson(`data/eval-cases/${fixture.caseId}.json`, evalCaseFor(fixture)),
		]),
	);

	await Promise.all(
		visibleFixtures.flatMap((fixture) => [
			writeJson(
				`runs/${baselineRunId}/briefings/${fixture.packetId}.json`,
				briefingFor(fixture, "baseline"),
			),
			writeJson(
				`runs/${candidateRunId}/briefings/${fixture.packetId}.json`,
				briefingFor(fixture, "candidate"),
			),
			writeJson(
				`runs/${candidateRunId}/traces/${fixture.caseId}.json`,
				traceFor(fixture),
			),
			writeJson(
				`runs/${candidateRunId}/evaluations/${fixture.caseId}.json`,
				evaluationFor(fixture),
			),
		]),
	);

	await Promise.all([
		writeJson(
			`runs/${baselineRunId}/manifest.json`,
			runManifestFor("baseline", visibleFixtures),
		),
		writeJson(
			`runs/${candidateRunId}/manifest.json`,
			runManifestFor("candidate", visibleFixtures),
		),
		writeJson(
			"runs/comparisons/baseline-2026-06-10__candidate-citation-gates.json",
			comparisonFor(),
		),
		writeText(
			"reports/latest-eval-summary.md",
			`# Latest Eval Summary

This synthetic report compares \`${baselineRunId}\` with \`${candidateRunId}\` on the expanded Phase 5 fixture set.

The dataset now contains 9 synthetic eval cases: 7 visible cases for demo walkthroughs and 2 holdout cases that stay out of the Genie product flow. Source packets now include 3-6 richer documents with distractors, overlapping evidence, caveats, and explicit citation traps.

The candidate improves overall quality from \`0.66\` to \`0.83\` and citation support from \`0.51\` to \`0.80\`. Unsupported claims drop from \`26\` to \`7\`, while cost stays inside the \`1.15x\` guardrail at \`1.10x\`.

Featured case: \`case-release-note-drift\`. The baseline recommends publishing generated release notes because coverage is high. The candidate keeps the automation benefit but gates publication on stale-claim drift review and explicit approval for sensitive customer-facing statements.
`,
		),
	]);

	const priorReport = await readFile(
		path.join(repoRoot, "reports/latest-eval-summary.md"),
		"utf8",
	);
	console.log(
		`Seeded ${fixtures.length} eval cases, ${visibleFixtures.length} visible briefing pairs, and report ${priorReport.length} bytes.`,
	);
}

await main();
