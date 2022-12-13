import { callsOf, spy, callsOfAll } from "testtriple";
import { waitFor } from "../testutils.js";
import { makeTGPWorkerFactory } from "./worker.js";

describe("makeTGPWorkerFactory", () => {
  it("starts the process and calls our hooks correctly", async () => {
    const onChange: () => void = spy();
    const onOutput: (line: string) => void = spy();
    const onComplete: (success: boolean) => void = spy();

    const worker = makeTGPWorkerFactory({
      directory: "./test-data/",
      command: "NODE_OPTIONS='--loader ts-node/esm --no-warnings' node task.ts",
    })({
      onChange,
      onOutput,
      onComplete,
    });
    worker.execute();
    await waitFor((f) => callsOf(onComplete).length === 1);
    expect(callsOfAll(onOutput, onComplete)).toStrictEqual([
      [onOutput, "starting up..."],
      [onOutput, "building..."],
      [onComplete, true],
    ]);
    worker.execute();
    await waitFor((f) => callsOf(onComplete).length === 2);
    expect(callsOfAll(onOutput, onComplete, onChange)).toStrictEqual([
      [onOutput, "starting up..."],
      [onOutput, "building..."],
      [onComplete, true],
      [onOutput, "building..."],
      [onChange],
      [onComplete, true],
    ]);
  });
});
