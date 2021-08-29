import * as assert from "assert";
import { EventEmitter } from "events";
import { AsyncPushIterator } from "../../src";
import { toError } from "../../src/util/toError";

describe("An AsyncPushIterator", () => {
  it("should iterate over asynchronously pushed data", async () => {
    let cleared = false;

    const iterator = new AsyncPushIterator<number>((it) => {
      let i = 0;
      const intervalId = setInterval(() => it.push(++i), 100);
      const timeoutId = setTimeout(() => it.return(), 550);

      return () => {
        cleared = true;
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      };
    });

    const results: number[] = [];

    for await (const i of iterator) {
      results.push(i);
    }

    assert.deepStrictEqual(results, [1, 2, 3, 4, 5]);
    assert.ok(cleared, "not cleared");
  });

  it("should be finishable", async () => {
    let cleared = false;

    const iterator = new AsyncPushIterator<number>((it) => {
      let i = 0;
      const intervalId = setInterval(() => it.push(++i), 100);
      const timeoutId = setTimeout(() => {
        it.push(++i);
        it.finish();
      }, 550);

      return () => {
        cleared = true;
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      };
    });

    const results: number[] = [];

    for await (const i of iterator) {
      results.push(i);
    }

    assert.deepStrictEqual(results, [1, 2, 3, 4, 5, 6]);
    assert.ok(cleared, "not cleared");
  });

  it("should be cancelable", async () => {
    let cleared = false;

    const iterator = new AsyncPushIterator<number>((it) => {
      let i = 0;
      const intervalId = setInterval(() => it.push(++i), 100);

      return () => {
        cleared = true;
        clearInterval(intervalId);
      };
    });

    setTimeout(() => iterator.return(), 550);

    const results: number[] = [];

    for await (const i of iterator) {
      results.push(i);
    }

    assert.deepStrictEqual(results, [1, 2, 3, 4, 5]);
    assert.ok(cleared, "not cleared");
  });

  it("should allow pushing multiple values", async () => {
    let cleared = false;

    const iterator = new AsyncPushIterator<number>((it) => {
      let i = 0;
      const intervalId = setInterval(() => {
        it.push(++i);
        it.push(++i);
        it.push(++i);
      }, 100);
      const timeoutId = setTimeout(() => it.return(), 550);

      return () => {
        cleared = true;
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      };
    });

    const results: number[] = [];

    for await (const i of iterator) {
      results.push(i);
    }

    assert.strictEqual(results.length, 15);
    assert.ok(cleared, "not cleared");
  });

  it("should be cancelable with an error", async () => {
    let cleared = false;

    const iterator = new AsyncPushIterator<number>((it) => {
      let i = 0;
      const intervalId = setInterval(() => it.push(++i), 100);
      const timeoutId = setTimeout(() => it.throw(new Error("test")), 550);

      return () => {
        cleared = true;
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      };
    });

    const results: number[] = [];

    try {
      for await (const i of iterator) {
        results.push(i);
      }

      assert.ok(false, "should have thrown");
    } catch (err) {
      assert.strictEqual(toError(err).message, "test");
    }

    assert.deepStrictEqual(results, [1, 2, 3, 4, 5]);
    assert.ok(cleared);
  });

  it("should handle chaotic iteration", async () => {
    let cleared = false;

    const iterator = new AsyncPushIterator<number>((it) => {
      let i = 0;
      const intervalId = setInterval(() => {
        it.push(++i);
        it.push(++i);
        it.push(++i);
      }, 100);

      return () => {
        cleared = true;
        clearInterval(intervalId);
      };
    });

    const results: number[] = [];

    async function next() {
      const { value } = await iterator.next();
      if (typeof value === "number") results.push(value);
    }

    for (let i = 0; i < 30; ++i) {
      setTimeout(next, Math.random() * 100);
    }

    await new Promise((resolve) => setTimeout(resolve, 1100));

    iterator.return();

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.strictEqual(results.length, 30);
    assert.ok(cleared, "not cleared");
  });

  it("should handle chaotic iteration (2)", async () => {
    let cleared = false;

    const iterator = new AsyncPushIterator<number>((it) => {
      let i = 0;
      const intervalId = setInterval(() => {
        if (i >= 30) return it.return();
        it.push(++i);
        it.push(++i);
        it.push(++i);
      }, 100);

      return () => {
        cleared = true;
        clearInterval(intervalId);
      };
    });

    const results: number[] = [];
    let _done: boolean | undefined;

    async function next() {
      const { done, value } = await iterator.next();
      if (typeof value === "number") results.push(value);
      _done = done;
    }

    for (let i = 0; i < 50; ++i) {
      setTimeout(next, Math.random() * 100);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));

    assert.strictEqual(results.length, 30);
    assert.ok(_done, "not done");
    assert.ok(cleared, "not cleared");
  });

  it("should work with event emitters", async () => {
    const ee = new EventEmitter();

    const iterator = new AsyncPushIterator<string>((it) => {
      const listener = (e: string) => it.push(e);

      ee.on("test", listener);

      return () => {
        ee.removeListener("test", listener);
      };
    });

    setTimeout(() => ee.emit("test", "hello"), 100);
    setTimeout(() => ee.emit("test", "world"), 200);
    setTimeout(() => iterator.return(), 300);

    const results: string[] = [];

    for await (const item of iterator) {
      results.push(item);
    }

    assert.deepStrictEqual(results, ["hello", "world"]);
    assert.strictEqual(ee.listenerCount("test"), 0);
  });
});
