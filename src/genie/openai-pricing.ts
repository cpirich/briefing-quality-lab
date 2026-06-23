export interface OpenAIPricing {
	model: string;
	inputUsdPer1MTokens: number;
	cachedInputUsdPer1MTokens: number;
	outputUsdPer1MTokens: number;
	currency: "USD";
	serviceTier: string;
	context: string;
	source: string;
}

export const openAIStandardShortContextPricing: Record<string, OpenAIPricing> =
	{
		"gpt-5.2": {
			model: "gpt-5.2",
			inputUsdPer1MTokens: 1.75,
			cachedInputUsdPer1MTokens: 0.175,
			outputUsdPer1MTokens: 14,
			currency: "USD",
			serviceTier: "standard",
			context: "short",
			source: "OpenAI API pricing, standard short-context rates, 2026-06-23",
		},
		"gpt-5.2-chat-latest": {
			model: "gpt-5.2-chat-latest",
			inputUsdPer1MTokens: 1.75,
			cachedInputUsdPer1MTokens: 0.175,
			outputUsdPer1MTokens: 14,
			currency: "USD",
			serviceTier: "standard",
			context: "short",
			source: "OpenAI API pricing, standard short-context rates, 2026-06-23",
		},
		"gpt-5.2-codex": {
			model: "gpt-5.2-codex",
			inputUsdPer1MTokens: 1.75,
			cachedInputUsdPer1MTokens: 0.175,
			outputUsdPer1MTokens: 14,
			currency: "USD",
			serviceTier: "standard",
			context: "short",
			source: "OpenAI API pricing, standard short-context rates, 2026-06-23",
		},
	};

export function pricingForOpenAIModel(modelName: string) {
	return openAIStandardShortContextPricing[modelName];
}

function roundUsd(value: number) {
	return Math.round(value * 100_000_000) / 100_000_000;
}

export function estimateOpenAIUsd({
	modelName,
	inputTokens,
	cachedInputTokens,
	outputTokens,
}: {
	modelName: string;
	inputTokens: number;
	cachedInputTokens: number;
	outputTokens: number;
}): { estimatedUsd: number | null; pricing?: OpenAIPricing } {
	const pricing = pricingForOpenAIModel(modelName);
	if (!pricing) {
		return { estimatedUsd: null };
	}

	const billableCachedInputTokens = Math.min(inputTokens, cachedInputTokens);
	const billableInputTokens = Math.max(
		0,
		inputTokens - billableCachedInputTokens,
	);
	const estimatedUsd = roundUsd(
		(billableInputTokens * pricing.inputUsdPer1MTokens +
			billableCachedInputTokens * pricing.cachedInputUsdPer1MTokens +
			outputTokens * pricing.outputUsdPer1MTokens) /
			1_000_000,
	);

	return { estimatedUsd, pricing };
}
