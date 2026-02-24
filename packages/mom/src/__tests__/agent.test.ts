import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../agent.js";

describe("buildSystemPrompt", () => {
	it("adds mem0 search retry and limit guardrails to the prompt", () => {
		const prompt = buildSystemPrompt("/workspace", "C123", "(memory)", { type: "host" }, [], [], []);

		expect(prompt).toContain("at most two mem0 search calls total");
		expect(prompt).toContain("one normal search + one exception retry");
		expect(prompt).toContain("never 3 or more searches");
		expect(prompt).toContain("explicit quantity request N > 5");
		expect(prompt).toContain("set limit = min(N, 20)");
		expect(prompt).toContain("broad or no-number requests (more/comprehensive)");
		expect(prompt).toContain("default limit = 10");
		expect(prompt).toContain("report that mem0 results are insufficient");
		expect(prompt).toContain("do not continue retrying");
	});
});
