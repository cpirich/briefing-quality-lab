import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
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

type BaselineEvaluationSeed = Omit<EvaluationSeed, "citationSupport"> & {
	supportedCitations: string[];
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
				body: "Quickstart completion rose from 44% to 58% after the copy refresh, and the first API call step now has fewer exits. The biggest remaining drop happens during local setup and credential configuration, where users bounce after seeing environment-specific errors.",
				documentType: "analytics digest",
			},
			{
				id: "S2",
				title: "Support digest",
				body: "Most new tickets mention environment drift, stale CLI versions, and unclear recovery steps after failed installs. Several teams found the right command only after support pasted an internal checklist, which is not yet reflected in public docs.",
				documentType: "support summary",
			},
			{
				id: "S3",
				title: "Pilot interviews",
				body: "Senior engineers said they trust generated recommendations only when each claim points back to source snippets they can inspect. They were less concerned about prose polish than about knowing whether a recommendation came from analytics, support, or interview evidence.",
				documentType: "interview synthesis",
			},
			{
				id: "S4",
				title: "Pilot expansion note",
				body: "Two additional teams are available for a pilot next month, but the launch owner flagged setup recovery as the visible failure that would make the demo feel brittle. The note recommends expanding only after failed-install guidance and citation checks are observable in the lab.",
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
				overall: 0.92,
				grounding: 0.86,
				coverage: 0.94,
				citationSupport: 0.96,
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
				body: "Teams need smaller eval batches with visible failure clusters before expanding model coverage. The last broad run increased the number of cases scored, but reviewers could not tell which failures were repeated patterns and which were one-off mistakes.",
				documentType: "quality memo",
			},
			{
				id: "S2",
				title: "Release guardrail notes",
				body: "Coverage can improve while grounding regresses, so citation support needs an explicit shipping gate. The suggested threshold is not a leaderboard target; it is a release block when candidate outputs make unsupported claims.",
				documentType: "release notes",
			},
			{
				id: "S3",
				title: "Cost review",
				body: "Long traces help debug failures, but unchecked retries created a 1.34x cost increase in the last dry run. The finance reviewer accepted trace retention only if retries are capped and summarized in the run manifest.",
				documentType: "cost review",
			},
			{
				id: "S4",
				title: "Holdout protocol",
				body: "Holdout cases should appear in dashboards as summaries and aggregate scores, but their tuning labels should stay out of prompt-iteration workflows. Reviewers want confidence that prompt changes are not simply memorizing visible examples.",
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
				"Run the next experiment as a small visible batch with citation support and absolute cost as explicit gates.",
		},
		evaluation: {
			scores: {
				overall: 0.94,
				grounding: 1,
				coverage: 0.95,
				citationSupport: 0.98,
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
				body: "Median review wait time improved from 19 hours to 13 hours after adding reviewer rotation. The 90th percentile is still 46 hours because complex changes often wait for the same two senior reviewers.",
				documentType: "analytics digest",
			},
			{
				id: "S2",
				title: "Reviewer survey",
				body: "Reviewers like auto-assignment for routine changes, but they distrust bot approvals when tests are flaky or ownership is unclear. Several asked for risk labels that explain why a change is safe to fast-track.",
				documentType: "survey summary",
			},
			{
				id: "S3",
				title: "Post-merge defect review",
				body: "Defects did not rise for small documentation and config changes, but two incidents came from fast-tracking cross-service changes without the owning team. The review lead wants different treatment for low-risk and cross-boundary changes.",
				documentType: "defect review",
			},
			{
				id: "S4",
				title: "Tooling proposal",
				body: "The proposed queue helper can suggest reviewers, group similar low-risk changes, and surface missing ownership metadata. It cannot yet verify semantic ownership or override branch protection.",
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
				overall: 0.91,
				grounding: 0.84,
				coverage: 0.93,
				citationSupport: 0.96,
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
				body: "The generated notes covered 83% of merged changes, but 14% of entries described behavior that changed after final QA. The highest-risk errors came from stale pull-request descriptions that were never updated after scope cuts.",
				documentType: "audit summary",
			},
			{
				id: "S2",
				title: "Customer success note",
				body: "Customers value concise release notes, especially migration warnings and compatibility caveats. One customer escalated because a generated note promised an admin toggle that was removed before release.",
				documentType: "customer summary",
			},
			{
				id: "S3",
				title: "Engineering workflow memo",
				body: "Engineers can tag final-release deltas during QA, but they will not maintain a second changelog manually. The memo recommends a review queue that highlights changed or removed claims rather than asking authors to rewrite every note.",
				documentType: "workflow memo",
			},
			{
				id: "S4",
				title: "Compliance review",
				body: "Any customer-facing note that mentions security, data retention, or access control requires explicit human approval. The reviewer said summarization speed is useful only if sensitive claims are easy to spot.",
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
				overall: 0.9,
				grounding: 0.84,
				coverage: 0.92,
				citationSupport: 0.95,
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
				body: "Participants approved automatic drafting, summarization, and artifact linking when outputs are clearly marked as generated. They rejected automatic policy changes, customer commitments, and release blocking without a human approver.",
				documentType: "workshop notes",
			},
			{
				id: "S2",
				title: "Operations incident note",
				body: "A prior automation posted a recommendation as if it were an approved decision, causing two teams to pause rollout work unnecessarily. The incident review asks for explicit status labels: draft, recommendation, approved action, and blocked.",
				documentType: "incident review",
			},
			{
				id: "S3",
				title: "Product analytics",
				body: "Users are most likely to accept generated briefings when the interface separates evidence, recommendation, and action controls. Acceptance drops when the recommendation and execution button appear in the same visual cluster.",
				documentType: "analytics digest",
			},
			{
				id: "S4",
				title: "Legal review",
				body: "Any automated message that could be interpreted as a customer commitment needs an accountable human reviewer. Legal approved internal draft summaries as long as they cannot be confused with final commitments.",
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
				overall: 0.9,
				grounding: 0.83,
				coverage: 0.92,
				citationSupport: 0.95,
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
				body: "The candidate prompt reduced unsupported claims but increased median token usage by 11%. Latency improved by 6% because fewer generations needed manual reruns, even though each retained trace is longer.",
				documentType: "telemetry report",
			},
			{
				id: "S2",
				title: "Finance guidance",
				body: "Finance approved demo-quality eval runs up to the reference target cost budget if the report shows why extra tokens reduce review time. Anything above that budget needs a smaller case batch or stricter retry cap.",
				documentType: "finance note",
			},
			{
				id: "S3",
				title: "Reviewer feedback",
				body: "Reviewers said long traces are useful only when they are summarized next to the claim that failed. Raw provider payloads alone slowed review because people had to search for the relevant evidence.",
				documentType: "reviewer feedback",
			},
			{
				id: "S4",
				title: "Demo rehearsal",
				body: "The live demo felt responsive when single briefings finished under 10 seconds and eval progress showed the current case. Stakeholders were tolerant of longer full runs if progress and artifact paths updated continuously.",
				documentType: "rehearsal note",
			},
		],
		expectedCoverage: [
			"Candidate cost increased but stays within the reference target cost budget.",
			"Latency improved because fewer manual reruns were needed.",
			"Long traces need claim-level summaries, not raw payloads alone.",
			"Single-briefing UX should stay under 10 seconds while eval runs show progress.",
		],
		traps: [
			"Do not optimize cost by deleting traces reviewers need for grounding failures.",
			"Do not ignore the reference target cost budget.",
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
			title: "Recommendation: keep summarized traces inside the cost budget",
			summary:
				"Keep trace depth where it helps reviewers verify failed claims, but summarize traces at claim level and cap retries so the run stays under the reference target cost budget.",
			claims: [
				{
					text: "The candidate's extra token cost is currently inside the approved reference target cost budget.",
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
				"What retry cap keeps the candidate below the reference target cost budget on larger batches?",
			],
			recommendation:
				"Retain claim-level trace summaries, cap retries, and shrink the batch if cost rises above the reference target cost budget.",
		},
		evaluation: {
			scores: {
				overall: 0.89,
				grounding: 0.83,
				coverage: 0.92,
				citationSupport: 0.95,
			},
			failureTags: ["cost-guardrail", "trace-usability"],
			rubricEvidence: [
				"Candidate preserves traces but adds claim-level summarization and retry caps.",
				"Candidate ties the recommendation to the reference target cost budget and 10-second UX target.",
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
					note: "Supports the reference target cost budget.",
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
				body: "A failed installer release caused 31 setup tickets in two days. The highest-friction users had partial installs: they could not tell whether to rerun setup, clear credentials, or wait for a patched CLI.",
				documentType: "support recap",
			},
			{
				id: "S2",
				title: "Status page draft",
				body: "The draft status update says the issue is resolved, but engineering has only verified recovery on macOS and Linux. Windows recovery steps are still being validated by the tooling team.",
				documentType: "status draft",
			},
			{
				id: "S3",
				title: "Customer success guidance",
				body: "Customer success wants a concise message that separates who is affected, what action they should take, and which environments are still pending validation. They specifically asked not to claim universal resolution until Windows is verified.",
				documentType: "customer guidance",
			},
			{
				id: "S4",
				title: "Engineering fix note",
				body: "The patched CLI adds a recovery command that checks stale credentials and cleans partial install state. The command is available in the release candidate, but docs screenshots still show the old installer flow.",
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
				overall: 0.91,
				grounding: 0.82,
				coverage: 0.93,
				citationSupport: 0.97,
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
				body: "Local operation keeps the demo inspectable and makes file-backed artifacts easy to explain. The tradeoff is setup fragility: dependency pinning, seed commands, and deterministic fixture validation must be boring before a live walkthrough.",
				documentType: "reliability review",
			},
			{
				id: "S2",
				title: "Go-to-market note",
				body: "Hosted previews reduce onboarding friction for reviewers who do not want to run the app locally. The current roadmap, however, has no production hosting plan and no owner for preview secrets, deploys, or data retention.",
				documentType: "planning note",
			},
			{
				id: "S3",
				title: "Security note",
				body: "Public fixtures must avoid private planning paths, customer identifiers, and unreleased vendor data. Hosted previews would also need environment-variable review before anyone shares a link externally.",
				documentType: "security review",
			},
			{
				id: "S4",
				title: "Demo rehearsal",
				body: "The local demo failed once because a stale runtime used the wrong package manager. After mise pinned the runtime, the second rehearsal succeeded and reviewers valued seeing artifacts written directly into the repo.",
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
				body: "The smaller model answered routine summaries 42% faster with similar coverage on low-risk cases. It missed two caveats on high-risk recommendation cases where source documents contradicted each other.",
				documentType: "experiment report",
			},
			{
				id: "S2",
				title: "Cost analysis",
				body: "Routing low-risk summaries to the smaller model would reduce estimated demo-run cost by 18%. The savings disappear if high-risk cases require multiple retries after a missed caveat.",
				documentType: "cost note",
			},
			{
				id: "S3",
				title: "Evaluator notes",
				body: "Evaluator failures cluster around unsupported recommendations, not factual extraction. The routing policy should consider task risk and source disagreement rather than only packet length.",
				documentType: "evaluator synthesis",
			},
			{
				id: "S4",
				title: "Product manager note",
				body: "The PM wants a simple rule that can be explained in a demo: routine summaries may use the fast path, but recommendations that change release, customer, or compliance posture need the stronger model and citation checks.",
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

function evaluationId(caseId: string, variant: "baseline" | "candidate") {
	return `evaluation-${caseId.replace(/^case-/, "")}-${variant}`;
}

const baselineEvaluationsByCaseId: Record<string, BaselineEvaluationSeed> = {
	"case-adoption-friction": {
		scores: {
			overall: 0.62,
			grounding: 0.48,
			coverage: 0.7,
			citationSupport: 0.46,
		},
		failureTags: [
			"setup-recovery",
			"citation-grounding",
			"overconfident-rollout",
			"missing-recovery-gate",
			"weak-source-specificity",
		],
		rubricEvidence: [
			"Baseline cites adoption improvement but turns it into a broader pilot recommendation than the sources support.",
			"Setup recovery and source-traceability gates are mentioned only as follow-up questions.",
		],
		supportedCitations: ["S3"],
		notes:
			"Baseline overweights quickstart improvement and underplays setup-recovery risk.",
	},
	"case-eval-loop": {
		scores: {
			overall: 0.58,
			grounding: 0.44,
			coverage: 0.68,
			citationSupport: 0.42,
		},
		failureTags: [
			"citation-grounding",
			"cost-guardrail",
			"holdout-boundary",
			"coverage-overreach",
			"missing-release-gate",
		],
		rubricEvidence: [
			"Baseline recommends expansion based mostly on coverage and reviewer spot checks.",
			"It misses the explicit warning that citation support should block shipping when grounding regresses.",
		],
		supportedCitations: ["S3"],
		notes:
			"Baseline captures trace utility but misses citation-support, cost, and holdout boundaries.",
	},
	"case-code-review-queues": {
		scores: {
			overall: 0.65,
			grounding: 0.5,
			coverage: 0.72,
			citationSupport: 0.48,
		},
		failureTags: [
			"review-queue",
			"risk-labeling",
			"unsupported-automation",
			"missing-ownership-boundary",
			"overbroad-fast-track",
			"branch-protection-risk",
		],
		rubricEvidence: [
			"Baseline correctly notices median wait improvement but treats bot approvals as acceptable without the required risk labels.",
			"It claims fast-tracking did not increase defects while omitting the cross-service incident caveat.",
		],
		supportedCitations: ["S1"],
		notes:
			"Baseline conflates queue organization with approval authority and misses ownership gates.",
	},
	"case-release-note-drift": {
		scores: {
			overall: 0.68,
			grounding: 0.52,
			coverage: 0.75,
			citationSupport: 0.52,
		},
		failureTags: [
			"stale-source",
			"human-approval",
			"customer-claim-risk",
			"coverage-overreach",
			"missing-sensitive-claim-gate",
			"weak-drift-review",
		],
		rubricEvidence: [
			"Baseline covers generated-note usefulness but treats coverage as enough to publish with spot review.",
			"It omits the explicit compliance gate for security, retention, and access-control claims.",
		],
		supportedCitations: ["S1", "S3"],
		notes:
			"Baseline misses the drift-review and sensitive-claim approval gates.",
	},
	"case-human-approval-boundary": {
		scores: {
			overall: 0.7,
			grounding: 0.55,
			coverage: 0.77,
			citationSupport: 0.53,
		},
		failureTags: [
			"human-approval",
			"action-boundary",
			"status-label-risk",
			"customer-commitment-risk",
		],
		rubricEvidence: [
			"Baseline identifies that some actions need human review but leaves the automation boundary vague.",
			"It does not clearly separate drafting from approved action or customer commitment.",
		],
		supportedCitations: ["S1", "S2"],
		notes:
			"Baseline is directionally right but too broad about automating routine lab actions.",
	},
	"case-cost-latency-budget": {
		scores: {
			overall: 0.71,
			grounding: 0.58,
			coverage: 0.78,
			citationSupport: 0.58,
		},
		failureTags: [
			"cost-guardrail",
			"latency-progress",
			"trace-readability",
			"retry-visibility",
		],
		rubricEvidence: [
			"Baseline notices the value of traces but does not tie the recommendation to retry caps or manifest summaries.",
			"It treats cost and latency as generic monitoring concerns instead of demo guardrails.",
		],
		supportedCitations: ["S1", "S3"],
		notes:
			"Baseline partially covers trace value while missing the cost and progress UX constraints.",
	},
	"case-incident-recovery-comms": {
		scores: {
			overall: 0.68,
			grounding: 0.57,
			coverage: 0.78,
			citationSupport: 0.58,
		},
		failureTags: [
			"incident-comms",
			"platform-caveat",
			"customer-forwarding-risk",
			"docs-readiness",
			"overbroad-resolution",
			"missing-user-segmentation",
		],
		rubricEvidence: [
			"Baseline communicates recovery progress but blurs the unresolved Windows caveat.",
			"It does not separate affected users, recommended action, and pending validation strongly enough.",
		],
		supportedCitations: ["S1", "S4"],
		notes:
			"Baseline is useful but too broad about recovery status and customer-facing readiness.",
	},
};

const sourceBodyAdditions: Record<string, Record<string, string>> = {
	"case-adoption-friction": {
		S1: "The analytics pull covers the two weeks after the docs refresh. Completion improved most for users who already had a valid token, while new users without a configured environment still hit the same setup wall. The team noted that the success metric should not be presented as an end-to-end onboarding win until credential setup has its own recovery path.",
		S2: "Support agents grouped the tickets into stale CLI installs, missing environment variables, and credentials copied from the wrong workspace. The internal checklist resolved most cases, but it relied on steps that public docs do not mention. Several tickets reopened when users repeated the quickstart from the top and reproduced the same failed state.",
		S3: "Interviewees said they could tolerate a terse recommendation if the evidence trail was clear. One senior engineer said a confident recommendation without source links would be treated as a draft opinion, not a decision input. The strongest trust signal was seeing analytics, support tickets, and interview evidence separated rather than blended into one generic rationale.",
		S4: "The launch owner wants the next pilot to feel calm in front of observers. The note lists failed install recovery, credential reset copy, and trace-backed recommendations as prerequisites. It does not cancel the pilot expansion; it says expansion should wait until the most visible recovery failure has a documented path.",
	},
	"case-eval-loop": {
		S1: "The memo compares a broad dry run with a smaller reviewed batch. The broad run produced more scores, but reviewers spent extra time rediscovering whether each failure was new. The smaller batch made repeated citation issues easier to group and produced more actionable prompt changes.",
		S2: "The guardrail note came from a release review where the candidate covered more requested points but attached weak citations to several claims. Reviewers agreed that coverage and grounding must be tracked separately. A candidate can look better in aggregate and still be blocked if unsupported claims reach customer-facing recommendations.",
		S3: "The cost review separates trace usefulness from retry sprawl. Long traces helped diagnose why a claim failed, but retries created duplicate traces that nobody read. Finance accepted keeping detailed traces when the run manifest shows retry count, estimated cost, and a short explanation of what the trace helped resolve.",
		S4: "The holdout protocol distinguishes dashboard visibility from tuning visibility. Aggregate holdout scores may appear in the lab so reviewers know the set exists, but labels and expected answers should not appear in prompt-editing screens. The goal is to catch overfitting to the visible demo cases.",
	},
	"case-code-review-queues": {
		S1: "The queue report breaks out routine changes from cross-service changes. Documentation and configuration reviews moved quickly after rotation, but changes touching shared services still waited on scarce reviewers. The report recommends treating tail latency as an ownership-routing problem, not only a staffing problem.",
		S2: "Survey comments supported automated assignment but were skeptical of automated approval. Reviewers wanted the bot to explain why a change looked low risk, including ownership metadata, test health, and file categories. Several comments said a fast-track label would be useful only if it could be challenged before merge.",
		S3: "The defect review found no measurable increase for low-risk docs and config changes. The incidents came from cross-service changes where the apparent owner was not the team responsible for runtime behavior. The review lead asked for a hard distinction between queue organization and approval authority.",
		S4: "The tooling proposal describes a helper that can cluster changes, suggest reviewers, and flag missing ownership data. It explicitly says semantic ownership remains outside the helper's capability. Branch protection and required reviewers stay in force even when the helper marks a change as likely low risk.",
	},
	"case-release-note-drift": {
		S1: "The audit sampled generated notes against merged pull requests and final QA records. Most missing items were minor, but stale PR descriptions created the riskiest drift because the generated note described behavior that had been cut or renamed. The audit recommends checking final QA deltas before customer publication.",
		S2: "Customer success highlighted that concise notes work only when the remaining claims are accurate. The escalated admin-toggle example caused confusion because customers planned rollout steps around a feature that was removed. The team asked for migration warnings and compatibility caveats to be treated as higher risk than routine polish items.",
		S3: "The workflow memo says engineers will tag final-release deltas during QA if the queue is lightweight. They will not maintain a parallel changelog. The proposed review queue should show changed, removed, or sensitive claims so authors only review the parts most likely to drift.",
		S4: "Compliance reviewers are less concerned with grammatical quality than with claims that imply security, retention, or access-control guarantees. They want an explicit approval record for those categories. The note says speed is useful only if sensitive statements are easy to find before publishing.",
	},
	"case-human-approval-boundary": {
		S1: "Workshop participants drew a boundary between preparation and authority. Drafting, summarizing, and linking artifacts were acceptable because a human could inspect them before action. Policy changes, customer commitments, and release blocking were rejected because they change obligations or stop work without accountable approval.",
		S2: "The incident note describes an automation that posted a recommendation in a channel where readers assumed it was an approved decision. Two teams paused rollout work before anyone confirmed the recommendation. The incident owner asked for status labels that distinguish draft analysis from approved action.",
		S3: "Analytics showed higher acceptance when evidence, recommendation, and action controls were visually separated. Sessions with a combined recommendation-and-action cluster produced more cancellations and clarification clicks. The product team interpreted that as a sign that users need time to inspect evidence before acting.",
		S4: "Legal approved generated internal drafts because they remain advisory. The same review rejected automated customer-facing commitments without an accountable reviewer. The legal note asks the product to make it impossible to confuse generated summaries with final commitments.",
	},
	"case-cost-latency-budget": {
		S1: "Telemetry compares the candidate prompt with the baseline over the visible eval set. Token usage rose because the candidate retained more claim-level evidence, but fewer outputs needed manual reruns. The latency improvement came from fewer repeated attempts, not from shorter single generations.",
		S2: "Finance accepted the reference target cost budget for demo-quality runs because better traces can reduce reviewer time. The approval is conditional: if the run exceeds that budget, the team should reduce batch size, cap retries, or summarize traces more aggressively. The note does not approve unlimited trace retention.",
		S3: "Reviewers liked traces when they were attached to the failed claim and cited source. Raw payload dumps slowed them down because they had to search for the relevant turn. The requested improvement is a short trace summary near each evaluator finding.",
		S4: "The rehearsal note separates product responsiveness from lab-run duration. A single briefing felt live-demo safe under 10 seconds. Full eval runs could take longer if the UI showed the current case, elapsed time, and artifact path so observers understood progress.",
	},
	"case-incident-recovery-comms": {
		S1: "The support recap lists partial installs as the biggest source of confusion. Users were unsure whether rerunning setup would corrupt local state or clear credentials. Agents asked for a recovery message that starts with symptoms and then gives one safe next action.",
		S2: "The status draft was written before Windows recovery validation finished. Engineering confirmed macOS and Linux, but the Windows path still had an unresolved credential-cache issue. The draft's word 'resolved' was flagged as too broad unless the environment caveat stayed visible.",
		S3: "Customer success asked for a message that separates affected users, recommended action, and pending validation. They wanted the Windows caveat in the first paragraph rather than a footnote. Their concern was that customers would forward the status update internally as proof of universal recovery.",
		S4: "The engineering note says the recovery command handles stale credentials and partial install cleanup. The command is available in the release candidate, while screenshots and public docs still show the old installer path. Engineering asked docs to update before broad promotion.",
	},
	"case-runtime-choice": {
		S1: "The reliability review favors local operation for the next demo because artifacts are easy to inspect in the repo. The risk is setup fragility: reviewers must have the pinned runtime, seed data, and validation commands working before the walkthrough. The note treats boring setup as a prerequisite, not a nice-to-have.",
		S2: "The go-to-market note says hosted previews would help reviewers who do not want local setup. It also records that no one owns preview secrets, deploys, or data retention yet. The note recommends not implying a production hosting plan until those responsibilities are assigned.",
		S3: "The security note focuses on public fixture hygiene. It calls out private planning paths, customer identifiers, unreleased vendor data, and environment variables as review items before external sharing. Hosted previews add another review surface because secrets and retention settings become visible operational concerns.",
		S4: "The rehearsal note explains why runtime pinning mattered. The first local run failed with the wrong package manager; after mise pinned the runtime, the second run succeeded. Reviewers liked seeing files written into the repo because it made the demo evidence tangible.",
	},
	"case-model-routing-policy": {
		S1: "The latency experiment split routine summaries from high-risk recommendations. The smaller model handled straightforward summaries quickly, but missed caveats when sources disagreed. The experiment owner warned that speed should not be averaged across cases with different risk profiles.",
		S2: "The cost analysis estimates savings if low-risk summaries use the smaller model. The savings vanish when missed caveats trigger retries or human repair on high-risk recommendations. The finance note therefore treats routing as a risk decision, not simply a cost optimization.",
		S3: "Evaluator notes show that the worst failures came from unsupported recommendations rather than factual extraction errors. Packet length alone did not predict failure. Cases with source disagreement or customer-facing consequences needed stronger citation checks even when the packet was short.",
		S4: "The product manager wanted a rule that could be explained during a demo. Routine summaries may use the fast path. Recommendations that affect releases, customers, compliance, or governance should use the stronger model and preserve citation evidence for review.",
	},
};

const supplementalSourcesByCase: Record<string, SourcePacket["sources"]> = {
	"case-adoption-friction": [
		{
			id: "S5",
			title: "Onboarding triage notes",
			body: "The onboarding triage notes summarize a working session between docs, support, and developer relations. The group agreed that the quickstart copy is clearer than before, but the failure mode after a partial setup still feels like a dead end. Support wants a public recovery checklist for stale CLI versions, credential mismatches, and repeated setup attempts. Developer relations wants the pilot expansion message to say that recovery guidance is being hardened before more teams are added.",
			documentType: "triage notes",
		},
		{
			id: "S6",
			title: "Pilot readiness checklist",
			body: "The pilot readiness checklist lists three gates for adding teams: the failed-install path must have public recovery steps, generated recommendations must show source citations, and the lab must expose whether a recommendation came from analytics, support, or interviews. The owner marked two teams as ready to participate but blocked scheduling until the setup recovery path can be demonstrated without support pasting an internal checklist.",
			documentType: "readiness checklist",
		},
	],
	"case-eval-loop": [
		{
			id: "S5",
			title: "Reviewer retro notes",
			body: "The reviewer retro says the last eval review felt slower than expected because failures were not grouped by pattern. Reviewers asked for a dashboard that clusters unsupported claims, weak citations, cost regressions, and holdout concerns separately. They preferred fewer cases with clearer evidence over a larger run where every row required manual interpretation.",
			documentType: "retro notes",
		},
		{
			id: "S6",
			title: "Experiment proposal",
			body: "The experiment proposal recommends one more visible batch before live orchestration. It asks the team to hold citation support as a shipping gate, keep retry counts in the manifest, and report holdout performance only in aggregate. The proposal frames expansion as acceptable only if the next candidate improves grounding without exceeding the cost guardrail.",
			documentType: "experiment proposal",
		},
	],
	"case-code-review-queues": [
		{
			id: "S5",
			title: "Ownership metadata audit",
			body: "The ownership metadata audit found that low-risk docs changes usually have clear owners, while shared service changes often inherit stale ownership entries. The audit recommends showing missing or conflicting ownership as a queue risk, not hiding it behind an auto-assignment. Reviewers asked for the helper to explain uncertainty before suggesting a faster path.",
			documentType: "metadata audit",
		},
		{
			id: "S6",
			title: "Branch protection policy note",
			body: "The branch protection policy note says automation may organize the queue and suggest reviewers, but it must not bypass required approvals. The policy owner approved fast-track labels for documentation and configuration changes when tests are healthy. Cross-service changes still require an owning-team reviewer even if the helper predicts low defect risk.",
			documentType: "policy note",
		},
	],
	"case-release-note-drift": [
		{
			id: "S5",
			title: "QA delta log",
			body: "The QA delta log lists changes that landed after pull-request descriptions were written. Two feature names changed, one admin toggle was removed, and one migration warning was added late. QA asked generated release notes to compare against this log before publication because stale PR text is no longer reliable after scope cuts.",
			documentType: "qa log",
		},
		{
			id: "S6",
			title: "Release editor checklist",
			body: "The release editor checklist asks reviewers to inspect generated notes for changed claims, removed features, sensitive categories, and compatibility warnings. Editors are not expected to rewrite every note manually. They should focus on claims that customers could treat as commitments or migration instructions.",
			documentType: "editor checklist",
		},
	],
	"case-human-approval-boundary": [
		{
			id: "S5",
			title: "Action taxonomy draft",
			body: "The action taxonomy draft divides Genie behavior into generated drafts, recommendations, approved actions, and blocked actions. Drafting and artifact linking are listed as safe defaults. Release blocks, customer commitments, policy changes, and external messages require an approver recorded in the artifact trail.",
			documentType: "taxonomy draft",
		},
		{
			id: "S6",
			title: "Interface review notes",
			body: "The interface review notes warn against placing an execution button directly beside an AI recommendation. Reviewers want the evidence panel, recommendation panel, and action controls separated so users understand what is generated and what has been approved. The note recommends a visible status label before any action can be taken.",
			documentType: "interface review",
		},
	],
	"case-cost-latency-budget": [
		{
			id: "S5",
			title: "Retry policy draft",
			body: "The retry policy draft proposes a small retry cap for demo eval runs. It allows one automatic retry for transient provider errors and requires a manifest entry when retries change cost or latency. The policy rejects silent repeated generations because they make cost harder to explain during review.",
			documentType: "policy draft",
		},
		{
			id: "S6",
			title: "Trace summary mock",
			body: "The trace summary mock shows a short explanation beside each failed claim: selected source ids, missing evidence, retry count, and final output path. Reviewers preferred that mock to raw provider payloads. The mock keeps detailed traces on disk while making the dashboard readable during a live demo.",
			documentType: "trace mock",
		},
	],
	"case-incident-recovery-comms": [
		{
			id: "S5",
			title: "Docs update checklist",
			body: "The docs update checklist requires the new recovery command, credential cleanup instructions, and screenshots for the patched installer path. The docs owner marked Windows screenshots as pending. The checklist says customer communication should not point users to the old installer flow once the release candidate is promoted.",
			documentType: "docs checklist",
		},
		{
			id: "S6",
			title: "Support macro draft",
			body: "The support macro draft separates users into verified macOS, verified Linux, and pending Windows recovery paths. It gives partial-install users one safe command and tells Windows users that validation is still in progress. Support asked for the same segmentation to appear in any generated incident briefing.",
			documentType: "support macro",
		},
	],
	"case-runtime-choice": [
		{
			id: "S5",
			title: "Local setup checklist",
			body: "The local setup checklist records the commands needed before a live walkthrough: install the pinned runtime, seed the fixtures, validate the run store, and launch the local server. The owner wants the checklist rehearsed before inviting reviewers because a failed local setup undermines the inspectability benefit.",
			documentType: "setup checklist",
		},
		{
			id: "S6",
			title: "Preview ownership note",
			body: "The preview ownership note lists the unresolved owners for hosting, environment variables, deployment cadence, and retention settings. It says a preview can be useful later, but the next iteration should not imply hosted reliability until those responsibilities are assigned and public fixture safety has been reviewed.",
			documentType: "ownership note",
		},
	],
	"case-model-routing-policy": [
		{
			id: "S5",
			title: "Routing decision table",
			body: "The routing decision table marks routine summaries as eligible for the fast path when sources agree and the output is not customer-facing. It marks release, customer, compliance, and governance recommendations as strong-model cases. The table also requires escalation when sources contradict each other.",
			documentType: "decision table",
		},
		{
			id: "S6",
			title: "Failure review notes",
			body: "The failure review notes show that missed caveats were expensive because they triggered retries and manual correction. The reviewer concluded that a cheap first pass is not cheap when the task changes release posture. The note recommends routing by task risk and source disagreement rather than by packet length alone.",
			documentType: "failure review",
		},
	],
};

function sourceBodyFor(
	fixture: CaseFixture,
	source: SourcePacket["sources"][number],
) {
	const addition = sourceBodyAdditions[fixture.caseId]?.[source.id];
	if (!addition) {
		throw new Error(
			`Missing source body addition for ${fixture.caseId} ${source.id}`,
		);
	}

	return `${source.body}

${addition}`;
}

function supplementalSourcesFor(fixture: CaseFixture) {
	const supplementalSources = supplementalSourcesByCase[fixture.caseId];
	if (!supplementalSources) {
		throw new Error(`Missing supplemental sources for ${fixture.caseId}`);
	}

	return supplementalSources;
}

function sourcesFor(fixture: CaseFixture) {
	const authoredSources = fixture.sources.map((source) => ({
		...source,
		body: sourceBodyFor(fixture, source),
	}));
	const minimumSourceCount = 6;

	return [
		...authoredSources,
		...supplementalSourcesFor(fixture).slice(
			0,
			Math.max(0, minimumSourceCount - authoredSources.length),
		),
	];
}

function sourcePacketFor(fixture: CaseFixture): SourcePacket {
	return {
		id: fixture.packetId,
		title: fixture.packetTitle,
		summary: fixture.packetSummary,
		caseId: fixture.caseId,
		sources: sourcesFor(fixture),
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
		acceptedCitations: sourcesFor(fixture).map((source) => source.id),
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
	const sources = sourcesFor(fixture);
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
			settings: {
				promptVersion: "briefing-genie-v1",
				maxOutputTokens: 1200,
				structuredOutputName: "seeded-fixture",
				textVerbosity: null,
				reasoningEffort: null,
				reasoningSummary: null,
				temperature: 0,
				topP: null,
				truncation: null,
				toolChoice: "read_source_packet",
				parallelToolCalls: false,
			},
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
					sourceCount: sources.length,
					sourceIds: sources.map((source) => source.id),
				},
				status: "success",
				startedAt: "2026-06-18T17:45:00.000Z",
				endedAt: "2026-06-18T17:45:00.005Z",
			},
		],
		cost: {
			inputTokens: 1800 + sources.length * 120,
			outputTokens: 420,
			estimatedUsd: 0.014,
		},
		latencyMs: 7200 + sources.length * 120,
		artifactPaths: [
			`data/source-packets/${fixture.packetId}.json`,
			briefingPath,
			tracePath,
		],
	};
}

function candidateEvaluationFor(fixture: CaseFixture): EvaluatorOutput {
	if (!fixture.evaluation) {
		throw new Error(`Missing evaluator seed for ${fixture.caseId}`);
	}

	return {
		id: evaluationId(fixture.caseId, "candidate"),
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

function baselineCitationSupportFor({
	fixture,
	seed,
}: {
	fixture: CaseFixture;
	seed: BaselineEvaluationSeed;
}): EvaluatorOutput["citationSupport"] {
	const baseline = fixture.baseline;
	if (!baseline) {
		throw new Error(`Missing baseline briefing seed for ${fixture.caseId}`);
	}
	const supportedCitationIds = new Set(seed.supportedCitations);
	const citationIds = [
		...new Set(baseline.claims.flatMap((claim) => claim.citations)),
	];

	return citationIds.map((citation) => ({
		citation,
		supported: supportedCitationIds.has(citation),
		note: supportedCitationIds.has(citation)
			? `${citation} supports a baseline claim, but the overall recommendation still misses important gates.`
			: `${citation} is used for a claim that overstates or omits the relevant source caveat.`,
	}));
}

function baselineEvaluationFor(fixture: CaseFixture): EvaluatorOutput {
	const seed = baselineEvaluationsByCaseId[fixture.caseId];
	if (!seed) {
		throw new Error(`Missing baseline evaluator seed for ${fixture.caseId}`);
	}

	return {
		id: evaluationId(fixture.caseId, "baseline"),
		runId: baselineRunId,
		caseId: fixture.caseId,
		scores: seed.scores,
		failureTags: seed.failureTags,
		rubricEvidence: seed.rubricEvidence,
		citationSupport: baselineCitationSupportFor({ fixture, seed }),
		notes: seed.notes,
		artifactPaths: [
			`runs/${baselineRunId}/evaluations/${fixture.caseId}.json`,
			`runs/${baselineRunId}/briefings/${fixture.packetId}.json`,
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
	const runEvaluationPaths = visibleFixtures.map(
		(fixture) => `runs/${runId}/evaluations/${fixture.caseId}.json`,
	);
	const runArtifactPaths = isCandidate
		? [
				...visibleFixtures.map(
					(fixture) => `runs/${runId}/traces/${fixture.caseId}.json`,
				),
				...runEvaluationPaths,
			]
		: runEvaluationPaths;

	return {
		runId,
		createdAt: isCandidate
			? "2026-06-18T17:45:00.000Z"
			: "2026-06-10T15:30:00.000Z",
		variantLabel: isCandidate ? "candidate-citation-gates" : "baseline",
		status: "complete",
		gitRef: isCandidate ? "synthetic-candidate-phase-5" : "synthetic-baseline",
		command: "bun run data:seed-phase5",
		caseIds: visibleFixtures.map((fixture) => fixture.caseId),
		aggregateMetrics: isCandidate
			? {
					overall: 0.91,
					grounding: 0.86,
					coverage: 0.93,
					citationSupport: 0.96,
					unsupportedClaims: 6,
					groundingRiskUnits: 6,
					medianLatencyMs: 8000,
					estimatedCostUsd: null,
					costBudgetUsd: 0.1,
					latencyRatio: 0.94,
				}
			: {
					overall: 0.66,
					grounding: 0.52,
					coverage: 0.74,
					citationSupport: 0.51,
					unsupportedClaims: 26,
					groundingRiskUnits: 26,
					medianLatencyMs: 8400,
					estimatedCostUsd: 0.098,
					latencyRatio: 1,
				},
		guardrails: [
			{
				id: "citation-support",
				label: "Citation support",
				status: isCandidate ? "pass" : "fail",
				value: isCandidate ? "0.96" : "0.51",
				threshold: isCandidate ? ">= 0.96" : ">= 0.72",
			},
			{
				id: isCandidate ? "cost-budget" : "estimated-cost",
				label: isCandidate
					? "Generation cost budget"
					: "Estimated generation cost",
				status: "pass",
				value: isCandidate ? "$0.1000" : "$0.0980",
				threshold: isCandidate
					? "OpenAI corpus generation cost target"
					: "Generation USD only; eval cost is separate",
			},
		],
		artifactPaths: [
			`runs/${runId}/manifest.json`,
			...briefingPaths,
			...runArtifactPaths,
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
				value: "0.91",
				delta: "+0.25",
				status: "Candidate clears expanded set",
				tone: "green",
			},
			{
				label: "Citation grounding",
				value: "0.96",
				delta: "+0.45",
				status: "Unsupported synthesis reduced",
				tone: "green",
			},
			{
				label: "Coverage",
				value: "0.93",
				delta: "+0.19",
				status: "Expected points covered",
				tone: "blue",
			},
			{
				label: "Estimated generation cost",
				value: "0.098",
				delta: "-0.002",
				status: "Baseline generation cost vs Reference target budget <= 0.1",
				tone: "green",
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
				score: 91,
			},
		],
		comparisonRows: [
			{
				metric: "Overall score",
				baseline: "0.66",
				candidate: "0.91",
				delta: "+0.25",
			},
			{
				metric: "Citation support",
				baseline: "0.51",
				candidate: "0.96",
				delta: "+0.45",
			},
			{
				metric: "Grounding risk units",
				baseline: "26",
				candidate: "6",
				delta: "-20",
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
				count: 2,
				severity: "Medium",
				evidence:
					"Recommendations mention cost or speed without tying the decision to the reference target cost budget, retry caps, or progress UX.",
				cases: ["case-cost-latency-budget", "case-eval-loop"],
			},
		],
		featuredCase: {
			id: "case-release-note-drift",
			title: "Release note drift briefing",
			sourceEvidence:
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
			"runs/baseline-2026-06-10/evaluations/case-release-note-drift.json",
			"runs/candidate-citation-gates/manifest.json",
			"runs/candidate-citation-gates/traces/case-release-note-drift.json",
			"runs/candidate-citation-gates/evaluations/case-release-note-drift.json",
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

async function main() {
	const visibleFixtures = fixtures.filter((fixture) => !fixture.holdout);
	await Promise.all([
		cleanJsonFiles("data/source-packets"),
		cleanJsonFiles("data/eval-cases"),
		cleanJsonFiles(`runs/${baselineRunId}/briefings`),
		cleanJsonFiles(`runs/${baselineRunId}/evaluations`),
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
				`runs/${baselineRunId}/evaluations/${fixture.caseId}.json`,
				baselineEvaluationFor(fixture),
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
				candidateEvaluationFor(fixture),
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
	]);

	console.log(
		`Seeded ${fixtures.length} eval cases and ${visibleFixtures.length} visible briefing pairs.`,
	);
}

await main();
