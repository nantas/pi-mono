import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../agent.js";

describe("buildSystemPrompt", () => {
	it("adds mem0 search retry and limit guardrails to the prompt", () => {
		const prompt = buildSystemPrompt("/workspace", "C123", "(memory)", { type: "host" }, [], [], []);

		expect(prompt).toMatch(/mem0 search retry guardrails/i);
		expect(prompt).toMatch(/exactly two mem0 search calls/i);
		expect(prompt).toMatch(/first call\s*\+\s*optional second call only/i);
		expect(prompt).toMatch(/after the second call/i);
		expect(prompt).toMatch(/no further retries/i);
		expect(prompt).toMatch(/no third mem0 search call/i);

		expect(prompt).toMatch(/N\s*>\s*5/i);
		expect(prompt).toMatch(/limit\s*=\s*min\(N,\s*20\)/i);
		expect(prompt).toMatch(/broad or no-number/i);
		expect(prompt).toMatch(/limit\s*=\s*10/i);
		expect(prompt).toMatch(/insufficient after the second call/i);
		expect(prompt).toMatch(/report .* insufficient/i);
	});
});
