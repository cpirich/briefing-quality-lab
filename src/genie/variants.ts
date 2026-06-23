import { type GenerationVariant, GenerationVariantSchema } from "~/schemas";

export const defaultOpenAIModel = "gpt-5.2";

export const localExtractiveVariant: GenerationVariant =
	GenerationVariantSchema.parse({
		id: "local-extractive-v1",
		label: "Local extractive baseline",
		provider: "local",
		model: "deterministic-extractive",
		promptVersion: "briefing-genie-v1",
		maxOutputTokens: 900,
	});

export function openAIResponsesVariant(modelName: string): GenerationVariant {
	return GenerationVariantSchema.parse({
		id: "openai-responses-v1",
		label: "OpenAI Responses baseline",
		provider: "openai",
		model: modelName,
		promptVersion: "briefing-genie-v1",
		maxOutputTokens: 1200,
	});
}
