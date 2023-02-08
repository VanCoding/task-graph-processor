import { callsOf, spy, callsOfAll, callOrderOf } from "testtriple";
import { spawn } from "child_process";
import { makeGenericWorkerFactory } from "./server.js";

describe("makeGenericWorkerFactory", () => {
  it("correctly handles processes implementing the the generic", async () => {
    const onChange: () => void = spy();
    const onOutput: (line: string) => void = spy();
    const onComplete: (success: boolean) => void = spy();

    const worker = makeGenericWorkerFactory({
      startProcess: (env) =>
        spawn("node", ["src/task.ts"], {
          cwd: "./",
          env: {
            ...process.env,
            NODE_OPTIONS: "--loader ts-node/esm --no-warnings",
            ...env,
          },
        }),
    })({
      onChange,
      onOutput,
      onComplete,
    });
    worker.execute();
    await waitFor(
      () => callsOf(onOutput).length === 3 && callsOf(onComplete).length === 1
    );

    const output = callsOf(onOutput).map(([line]) => line);

    expect(output).toContain("starting up...");
    expect(output).toContain("building...");
    expect(output).toContain("test error");
    expect(callOrderOf(onOutput, onComplete)).toStrictEqual([
      onOutput,
      onOutput,
      onOutput,
      onComplete,
    ]);
    worker.execute();
    await waitFor(() => callsOf(onComplete).length === 2);
    expect(callOrderOf(onOutput, onComplete, onChange)).toStrictEqual([
      onOutput,
      onOutput,
      onOutput,
      onComplete,
      onOutput,
      onChange,
      onComplete,
    ]);
  });

  it("it correctly handles processes not implementing the generic protocol", async () => {
    const onChange: () => void = spy();
    const onOutput: (line: string) => void = spy();
    const onComplete: (success: boolean) => void = spy();

    const worker = makeGenericWorkerFactory({
      startProcess: (env) =>
        spawn("sh", ["-c", "echo $HELLO_WORLD"], {
          cwd: "./",
          env: { ...process.env, ...env },
        }),
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
