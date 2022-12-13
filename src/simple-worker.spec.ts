import { callsOf, callsOfAll, spy } from "testtriple";
import { makeSimpleWorkerFactory } from "./simple-worker.js";
import { waitFor } from "./testutils.js";

describe("makeSimpleWorkerFactory", () => {
  it("starts the process and calls the hooks correctly", async () => {
    const onChange: () => void = spy();
    const onOutput: (line: string) => void = spy();
    const onComplete: (success: boolean) => void = spy();

    const worker = makeSimpleWorkerFactory({
      directory: "./test-data/",
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
