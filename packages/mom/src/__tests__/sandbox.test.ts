import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
	spawnMock: vi.fn(),
}));

vi.mock("child_process", () => ({
	spawn: spawnMock,
}));

import { createExecutor } from "../sandbox.js";

class MockStream extends EventEmitter {}

class MockChildProcess extends EventEmitter {
	stdout = new MockStream();
	stderr = new MockStream();
	pid = 12345;
}

describe("HostExecutor", () => {
	beforeEach(() => {
		spawnMock.mockReset();
		spawnMock.mockImplementation(() => {
			const child = new MockChildProcess();
			queueMicrotask(() => {
				child.emit("close", 0);
			});
			return child;
		});
	});

	it("inherits process env when spawning host commands", async () => {
		const executor = createExecutor({ type: "host" });

		await executor.exec("echo test");

		expect(spawnMock).toHaveBeenCalledTimes(1);

		const spawnOptions = spawnMock.mock.calls[0][2] as {
			env?: NodeJS.ProcessEnv;
			detached?: boolean;
			stdio?: string[];
		};

		expect(spawnOptions.detached).toBe(true);
		expect(spawnOptions.stdio).toEqual(["ignore", "pipe", "pipe"]);
		expect(spawnOptions.env).toBeDefined();
		expect(spawnOptions.env).toMatchObject(process.env);
		expect(spawnOptions.env).not.toBe(process.env);
	});
});
