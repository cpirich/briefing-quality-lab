import { z } from "zod";

const fixtureIdSchema = z
	.string()
	.min(1)
	.regex(/^[a-z0-9][a-z0-9-]*$/);

const citationIdSchema = z
	.string()
	.min(1)
	.regex(/^[A-Z][0-9]+$/);

const artifactPathSchema = z
	.string()
	.min(1)
	.refine(
		(value) =>
			/^(data|reports|runs)\//.test(value) &&
			!value.startsWith("/") &&
			!value.includes("\\") &&
			!value.includes("//") &&
			!value.split("/").includes(".") &&
			!value.split("/").includes(".."),
		{
			message:
				"Artifact paths must be normalized repo-relative paths under data/, reports/, or runs/",
		},
	);

export const SourceDocumentSchema = z.object({
	id: citationIdSchema,
	title: z.string().min(1),
	body: z.string().min(1),
	documentType: z.string().min(1).optional(),
});

export const SourcePacketSchema = z.object({
	id: fixtureIdSchema,
	title: z.string().min(1),
	summary: z.string().min(1),
	caseId: fixtureIdSchema,
	sources: z.array(SourceDocumentSchema).min(1),
	metadata: z.object({
		theme: z.string().min(1),
		synthetic: z.literal(true),
		publicSafe: z.literal(true),
		createdBy: z.string().min(1).optional(),
	}),
});

export const EvalCaseSchema = z.object({
	id: fixtureIdSchema,
	title: z.string().min(1),
	sourcePacketId: fixtureIdSchema,
	task: z.string().min(1),
	expectedCoverage: z.array(z.string().min(1)).min(1),
	traps: z.array(z.string().min(1)),
	acceptedCitations: z.array(citationIdSchema).min(1),
	holdout: z.boolean(),
	demoHighlight: z.boolean(),
	failureTags: z.array(z.string().min(1)),
	metadata: z.object({
		synthetic: z.literal(true),
		publicSafe: z.literal(true),
		notes: z.string().min(1).optional(),
	}),
});

export const BriefingClaimSchema = z.object({
	text: z.string().min(1),
	citations: z.array(citationIdSchema).min(1),
});

export const BriefingOutputSchema = z.object({
	id: fixtureIdSchema,
	sourcePacketId: fixtureIdSchema,
	caseId: fixtureIdSchema,
	title: z.string().min(1),
	summary: z.string().min(1),
	claims: z.array(BriefingClaimSchema).min(1),
	openQuestions: z.array(z.string().min(1)),
	recommendation: z.string().min(1),
	metadata: z.object({
		variant: z.string().min(1),
		runId: fixtureIdSchema,
		model: z.string().min(1).optional(),
	}),
});

export const GenerationVariantSchema = z.object({
	id: fixtureIdSchema,
	label: z.string().min(1),
	provider: z.string().min(1),
	model: z.string().min(1),
	promptVersion: fixtureIdSchema,
	maxOutputTokens: z.number().int().positive().optional(),
});

export const GenerationModelSettingsSchema = z.object({
	promptVersion: fixtureIdSchema,
	maxOutputTokens: z.number().int().positive().nullable(),
	structuredOutputName: z.string().min(1).nullable(),
	textVerbosity: z.enum(["low", "medium", "high"]).nullable(),
	reasoningEffort: z.enum(["none", "low", "medium", "high"]).nullable(),
	reasoningSummary: z.string().min(1).nullable(),
	temperature: z.number().min(0).nullable(),
	topP: z.number().min(0).max(1).nullable(),
	truncation: z.enum(["auto", "disabled"]).nullable(),
	toolChoice: z.string().min(1).nullable(),
	parallelToolCalls: z.boolean().nullable(),
});

export const ToolCallTraceSchema = z.object({
	id: fixtureIdSchema,
	toolName: z.string().min(1),
	arguments: z.record(z.unknown()),
	result: z.record(z.unknown()).optional(),
	status: z.enum(["success", "error", "skipped"]),
	startedAt: z.string().datetime(),
	endedAt: z.string().datetime().optional(),
	error: z.string().min(1).optional(),
});

export const GenerationTraceSchema = z
	.object({
		id: fixtureIdSchema,
		runId: fixtureIdSchema,
		caseId: fixtureIdSchema,
		sourcePacketId: fixtureIdSchema,
		input: z.object({
			userRequest: z.string().min(1),
			sourcePacketPath: artifactPathSchema,
		}),
		messages: z
			.array(
				z.object({
					role: z.enum(["system", "user", "assistant", "tool"]),
					content: z.string().min(1),
				}),
			)
			.min(1),
		model: z.object({
			provider: z.string().min(1),
			name: z.string().min(1),
			temperature: z.number().min(0).optional(),
			settings: GenerationModelSettingsSchema,
		}),
		output: BriefingOutputSchema,
		toolCalls: z.array(ToolCallTraceSchema),
		cost: z.object({
			inputTokens: z.number().int().nonnegative(),
			cachedInputTokens: z.number().int().nonnegative().optional(),
			outputTokens: z.number().int().nonnegative(),
			estimatedUsd: z.number().nonnegative().nullable(),
			pricing: z
				.object({
					model: z.string().min(1),
					inputUsdPer1MTokens: z.number().nonnegative(),
					cachedInputUsdPer1MTokens: z.number().nonnegative(),
					outputUsdPer1MTokens: z.number().nonnegative(),
					currency: z.literal("USD"),
					serviceTier: z.string().min(1),
					context: z.string().min(1),
					source: z.string().min(1),
				})
				.optional(),
		}),
		latencyMs: z.number().int().nonnegative(),
		artifactPaths: z.array(artifactPathSchema).min(1),
		error: z.string().min(1).optional(),
	})
	.superRefine((trace, context) => {
		const expectedSourcePacketPath = `data/source-packets/${trace.sourcePacketId}.json`;
		if (trace.input.sourcePacketPath !== expectedSourcePacketPath) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Trace input sourcePacketPath must match trace sourcePacketId",
				path: ["input", "sourcePacketPath"],
			});
		}

		if (trace.output.caseId !== trace.caseId) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Trace output caseId must match trace caseId",
				path: ["output", "caseId"],
			});
		}

		if (trace.output.sourcePacketId !== trace.sourcePacketId) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Trace output sourcePacketId must match trace sourcePacketId",
				path: ["output", "sourcePacketId"],
			});
		}

		if (trace.output.metadata.runId !== trace.runId) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Trace output metadata.runId must match trace runId",
				path: ["output", "metadata", "runId"],
			});
		}
	});

export const EvaluatorOutputSchema = z.object({
	id: fixtureIdSchema,
	runId: fixtureIdSchema,
	caseId: fixtureIdSchema,
	scores: z.object({
		overall: z.number().min(0).max(1),
		grounding: z.number().min(0).max(1),
		coverage: z.number().min(0).max(1),
		citationSupport: z.number().min(0).max(1),
	}),
	failureTags: z.array(z.string().min(1)),
	rubricEvidence: z.array(z.string().min(1)).min(1),
	citationSupport: z.array(
		z.object({
			citation: citationIdSchema,
			supported: z.boolean(),
			note: z.string().min(1),
		}),
	),
	notes: z.string().min(1),
	artifactPaths: z.array(artifactPathSchema).min(1),
});

export const RunManifestSchema = z.object({
	runId: fixtureIdSchema,
	createdAt: z.string().datetime(),
	variantLabel: z.string().min(1),
	status: z.enum(["seeded", "running", "complete", "failed"]),
	gitRef: z.string().min(1),
	command: z.string().min(1),
	caseIds: z.array(fixtureIdSchema),
	aggregateMetrics: z.object({
		overall: z.number().min(0).max(1),
		grounding: z.number().min(0).max(1),
		coverage: z.number().min(0).max(1),
		citationSupport: z.number().min(0).max(1),
		unsupportedClaims: z.number().int().nonnegative(),
		medianLatencyMs: z.number().int().nonnegative(),
		estimatedCostUsd: z.number().nonnegative().nullable().optional(),
		costBudgetUsd: z.number().positive().optional(),
		costRatio: z.number().positive(),
		latencyRatio: z.number().positive(),
	}),
	guardrails: z.array(
		z.object({
			id: fixtureIdSchema,
			label: z.string().min(1),
			status: z.enum(["pass", "warn", "fail"]),
			value: z.string().min(1),
			threshold: z.string().min(1),
		}),
	),
	artifactPaths: z.array(artifactPathSchema).min(1),
	error: z.string().min(1).optional(),
});

export const MetricToneSchema = z.enum(["green", "blue", "amber", "red"]);

export const RunModelMetadataSchema = z.object({
	provider: z.string().min(1),
	model: z.string().min(1),
	promptVersion: fixtureIdSchema.nullable(),
	maxOutputTokens: z.number().int().positive().nullable(),
	structuredOutputName: z.string().min(1).nullable(),
	textVerbosity: z.enum(["low", "medium", "high"]).nullable(),
	reasoningEffort: z.enum(["none", "low", "medium", "high"]).nullable(),
	temperature: z.number().min(0).nullable(),
	traceArtifactPath: artifactPathSchema.nullable(),
});

export const RunComparisonSchema = z.object({
	id: fixtureIdSchema,
	baselineRunId: fixtureIdSchema,
	candidateRunId: fixtureIdSchema,
	baselineLabel: z.string().min(1).optional(),
	candidateLabel: z.string().min(1).optional(),
	runMetadata: z
		.object({
			baseline: RunModelMetadataSchema.nullable(),
			candidate: RunModelMetadataSchema.nullable(),
		})
		.optional(),
	metrics: z.array(
		z.object({
			label: z.string().min(1),
			value: z.string().min(1),
			delta: z.string().min(1),
			status: z.string().min(1),
			tone: MetricToneSchema,
		}),
	),
	trend: z.array(
		z.object({
			label: z.string().min(1),
			score: z.number().min(0).max(100),
		}),
	),
	comparisonRows: z.array(
		z.object({
			metric: z.string().min(1),
			baseline: z.string().min(1),
			candidate: z.string().min(1),
			delta: z.string().min(1),
		}),
	),
	failureClusters: z.array(
		z.object({
			title: z.string().min(1),
			count: z.number().int().positive(),
			severity: z.enum(["High", "Medium", "Low"]),
			evidence: z.string().min(1),
			cases: z.array(fixtureIdSchema).min(1),
		}),
	),
	featuredCase: z.object({
		id: fixtureIdSchema,
		title: z.string().min(1),
		sourceEvidence: z.string().min(1),
		baseline: z.string().min(1),
		candidate: z.string().min(1),
		evaluatorNote: z.string().min(1),
	}),
	recommendation: z.object({
		tone: MetricToneSchema,
		label: z.string().min(1),
		text: z.string().min(1),
		warning: z.string().min(1),
	}),
	artifactPaths: z.array(artifactPathSchema).min(1),
});

export const ArtifactEntrySchema = z.object({
	label: z.string().min(1),
	path: artifactPathSchema,
	type: z.string().min(1),
});

export type SourcePacket = z.infer<typeof SourcePacketSchema>;
export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type BriefingOutput = z.infer<typeof BriefingOutputSchema>;
export type GenerationVariant = z.infer<typeof GenerationVariantSchema>;
export type GenerationModelSettings = z.infer<
	typeof GenerationModelSettingsSchema
>;
export type GenerationTrace = z.infer<typeof GenerationTraceSchema>;
export type EvaluatorOutput = z.infer<typeof EvaluatorOutputSchema>;
export type RunManifest = z.infer<typeof RunManifestSchema>;
export type RunComparison = z.infer<typeof RunComparisonSchema>;
export type RunModelMetadata = z.infer<typeof RunModelMetadataSchema>;
export type ArtifactEntry = z.infer<typeof ArtifactEntrySchema>;
