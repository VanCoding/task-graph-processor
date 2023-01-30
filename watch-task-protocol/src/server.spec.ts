import { callsOf, spy, callsOfAll } from "testtriple";
import { makeGenericWorkerFactory } from "./server.js";

describe("makeGenericWorkerFactory", () => {
  it("correctly handles processes implementing the the generic", async () => {
    const onChange: () => void = spy();
    const onOutput: (line: string) => void = spy();
    const onComplete: (success: boolean) => void = spy();

    const worker = makeGenericWorkerFactory({
      directory: "./",
      command:
        "NODE_OPTIONS='--loader ts-node/esm --no-warnings' node src/task.ts",
    })({
      onChange,
      onOutput,
      onComplete,
    });
    worker.execute();
    await waitFor(() => callsOf(onComplete).length === 1);
    expect(callsOfAll(onOutput, onComplete)).toStrictEqual([
      [onOutput, "starting up..."],
      [onOutput, "building..."],
      [onComplete, true],
    ]);
    worker.execute();
    await waitFor(() => callsOf(onComplete).length === 2);
    expect(callsOfAll(onOutput, onComplete, onChange)).toStrictEqual([
      [onOutput, "starting up..."],
      [onOutput, "building..."],
      [onComplete, true],
      [onOutput, "building..."],
      [onChange],
      [onComplete, true],
    ]);
  });

  it("it correctly handles processes not implementing the generic protocol", async () => {
    const onChange: () => void = spy();
    const onOutput: (line: string) => void = spy();
    const onComplete: (success: boolean) => void = spy();

    const worker = makeGenericWorkerFactory({
      directory: "./",
      command: "echo $HELLO_WORLD",
    })({
      onChange,
      onOutput,
      onComplete,
    });
    process.env.HELLO_WORLD = "building...";
    worker.execute();
    await waitFor(() => callsOf(onComplete).length === 1);
    expect(callsOfAll(onOutput, onComplete)).toStrictEqual([
      [onOutput, "building..."],
      [onComplete, true],
    ]);
    process.env.HELLO_WORLD = "building again...";
    worker.execute();
    await waitFor(() => callsOf(onComplete).length === 2);
    expect(callsOfAll(onOutput, onComplete)).toStrictEqual([
      [onOutput, "building..."],
      [onComplete, true],
      [onOutput, "building again..."],
      [onComplete, true],
    ]);
  });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (f: (...args: any[]) => any, timeout = 5000) => {
  const start = new Date().getTime();
  while (!f() && new Date().getTime() - start < timeout) await sleep(100);
  if (!f()) throw new Error("condition not met within timeout");
};
