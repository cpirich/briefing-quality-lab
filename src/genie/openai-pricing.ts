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

const currentOpenAIStandardPricingSource =
	"OpenAI API pricing, standard short-context rates, 2026-06-24";

function standardShortContextPricing({
	model,
	inputUsdPer1MTokens,
	cachedInputUsdPer1MTokens,
	outputUsdPer1MTokens,
	source = currentOpenAIStandardPricingSource,
}: {
	model: string;
	inputUsdPer1MTokens: number;
	cachedInputUsdPer1MTokens: number;
	outputUsdPer1MTokens: number;
	source?: string;
}): OpenAIPricing {
	return {
		model,
		inputUsdPer1MTokens,
		cachedInputUsdPer1MTokens,
		outputUsdPer1MTokens,
		currency: "USD",
		serviceTier: "standard",
		context: "short",
		source,
	};
}

export const openAIStandardShortContextPricing: Record<string, OpenAIPricing> =
	{
		"gpt-5.5": standardShortContextPricing({
			model: "gpt-5.5",
			inputUsdPer1MTokens: 5,
			cachedInputUsdPer1MTokens: 0.5,
			outputUsdPer1MTokens: 30,
		}),
		"gpt-5.5-pro": standardShortContextPricing({
			model: "gpt-5.5-pro",
			inputUsdPer1MTokens: 30,
			cachedInputUsdPer1MTokens: 30,
			outputUsdPer1MTokens: 180,
			source: `${currentOpenAIStandardPricingSource}; no cached-input discount published for this model, so cached input is estimated at input-token rates`,
		}),
		"gpt-5.4": standardShortContextPricing({
			model: "gpt-5.4",
			inputUsdPer1MTokens: 2.5,
			cachedInputUsdPer1MTokens: 0.25,
			outputUsdPer1MTokens: 15,
		}),
		"gpt-5.4-mini": standardShortContextPricing({
			model: "gpt-5.4-mini",
			inputUsdPer1MTokens: 0.75,
			cachedInputUsdPer1MTokens: 0.075,
			outputUsdPer1MTokens: 4.5,
		}),
		"gpt-5.4-nano": standardShortContextPricing({
			model: "gpt-5.4-nano",
			inputUsdPer1MTokens: 0.2,
			cachedInputUsdPer1MTokens: 0.02,
			outputUsdPer1MTokens: 1.25,
		}),
		"gpt-5.4-pro": standardShortContextPricing({
			model: "gpt-5.4-pro",
			inputUsdPer1MTokens: 30,
			cachedInputUsdPer1MTokens: 30,
			outputUsdPer1MTokens: 180,
			source: `${currentOpenAIStandardPricingSource}; no cached-input discount published for this model, so cached input is estimated at input-token rates`,
		}),
		"gpt-5.3-codex": standardShortContextPricing({
			model: "gpt-5.3-codex",
			inputUsdPer1MTokens: 1.75,
			cachedInputUsdPer1MTokens: 0.175,
			outputUsdPer1MTokens: 14,
			source: currentOpenAIStandardPricingSource,
		}),
		"gpt-5.2": standardShortContextPricing({
			model: "gpt-5.2",
			inputUsdPer1MTokens: 1.75,
			cachedInputUsdPer1MTokens: 0.175,
			outputUsdPer1MTokens: 14,
			source: "OpenAI API pricing, standard short-context rates, 2026-06-23",
		}),
		"gpt-5.2-chat-latest": standardShortContextPricing({
			model: "gpt-5.2-chat-latest",
			inputUsdPer1MTokens: 1.75,
			cachedInputUsdPer1MTokens: 0.175,
			outputUsdPer1MTokens: 14,
			source: "OpenAI API pricing, standard short-context rates, 2026-06-23",
		}),
		"gpt-5.2-codex": standardShortContextPricing({
			model: "gpt-5.2-codex",
			inputUsdPer1MTokens: 1.75,
			cachedInputUsdPer1MTokens: 0.175,
			outputUsdPer1MTokens: 14,
			source: "OpenAI API pricing, standard short-context rates, 2026-06-23",
		}),
		"chat-latest": standardShortContextPricing({
			model: "chat-latest",
			inputUsdPer1MTokens: 5,
			cachedInputUsdPer1MTokens: 0.5,
			outputUsdPer1MTokens: 30,
			source: currentOpenAIStandardPricingSource,
		}),
	};

const pricingFamilyPrefixes = [
	"gpt-5.5-pro",
	"gpt-5.5",
	"gpt-5.4-mini",
	"gpt-5.4-nano",
	"gpt-5.4-pro",
	"gpt-5.4",
	"gpt-5.3-codex",
	"gpt-5.2-chat-latest",
	"gpt-5.2-codex",
	"gpt-5.2",
] as const;

export function pricingForOpenAIModel(modelName: string) {
	const exactPricing = openAIStandardShortContextPricing[modelName];
	if (exactPricing) {
		return exactPricing;
	}

	const familyModel = pricingFamilyPrefixes.find((modelPrefix) =>
		modelName.startsWith(`${modelPrefix}-`),
	);
	if (!familyModel) {
		return undefined;
	}

	const familyPricing = openAIStandardShortContextPricing[familyModel];
	if (!familyPricing) {
		return undefined;
	}

	return {
		...familyPricing,
		model: modelName,
		source: `${familyPricing.source}; estimated using ${familyModel} rate card`,
	};
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
