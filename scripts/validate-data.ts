import { validateRunStore } from "../src/run-store";

try {
	const counts = await validateRunStore();

	console.log("Validated fixture-backed run store:");
	for (const [label, count] of Object.entries(counts)) {
		console.log(`- ${label}: ${count}`);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
