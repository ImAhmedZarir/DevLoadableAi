import { describe, it, expect } from "vitest";
import { AsyncStreamQueue } from "./agent-provider.server";

describe("AsyncStreamQueue", () => {
  it("yields chunks via for await async iterable", async () => {
    const queue = new AsyncStreamQueue();
    const chunks: string[] = [];

    // Push chunks asynchronously
    setTimeout(() => {
      queue.push("Hello, ");
      queue.push("world!");
      queue.end();
    }, 10);

    for await (const chunk of queue) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello, ", "world!"]);
  });

  it("resolves full concatenated text when awaited as a Promise", async () => {
    const queue = new AsyncStreamQueue();

    setTimeout(() => {
      queue.push("Part 1. ");
      queue.push("Part 2.");
      queue.end();
    }, 10);

    const fullText = await queue;
    expect(fullText).toBe("Part 1. Part 2.");
  });

  it("handles both for await and promise resolution simultaneously", async () => {
    const queue = new AsyncStreamQueue();
    const chunks: string[] = [];

    setTimeout(() => {
      queue.push("A");
      queue.push("B");
      queue.end();
    }, 10);

    for await (const chunk of queue) {
      chunks.push(chunk);
    }

    const fullText = await queue;
    expect(chunks).toEqual(["A", "B"]);
    expect(fullText).toBe("AB");
  });

  it("propagates errors to for await", async () => {
    const queue = new AsyncStreamQueue();

    setTimeout(() => {
      queue.push("first chunk");
      queue.fail(new Error("Network failure"));
    }, 10);

    const received: string[] = [];
    let caughtErr: Error | null = null;
    try {
      for await (const chunk of queue) {
        received.push(chunk);
      }
    } catch (err: unknown) {
      caughtErr = err instanceof Error ? err : new Error(String(err));
    }

    expect(received).toEqual(["first chunk"]);
    expect(caughtErr?.message).toBe("Network failure");
  });

  it("propagates errors to promise await", async () => {
    const queue = new AsyncStreamQueue();

    setTimeout(() => {
      queue.fail(new Error("Promise failure"));
    }, 10);

    await expect(queue).rejects.toThrow("Promise failure");
  });
});
