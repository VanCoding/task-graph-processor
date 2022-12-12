import { makeTGPWorkerFactory } from "./worker.js";

describe("makeTGPWorkerFactory", () => {
  it("starts the process and calls our hooks correctly", async () => {
    const onChange = spy();
    const onOutput = spy();
    const onComplete = spy();

    const worker = makeTGPWorkerFactory({
      directory: "./test-data/",
      command: "NODE_OPTIONS='--loader ts-node/esm --no-warnings' node task.ts",
    })({
      onChange: onChange.fn,
      onOutput: onOutput.fn,
      onComplete: onComplete.fn,
    });
    worker.execute();
    expect(await onOutput.waitForCall()).toStrictEqual(["starting up..."]);
    expect(await onOutput.waitForCall()).toStrictEqual(["building..."]);
    expect(await onComplete.waitForCall()).toStrictEqual([true]);
    worker.execute();
    expect(await onOutput.waitForCall()).toStrictEqual(["building..."]);
    expect(await onChange.waitForCall()).toStrictEqual([]);
    expect(await onComplete.waitForCall()).toStrictEqual([true]);
  });
});

const spy = () => {
  let resolve: (args: any[]) => void | undefined;
  return {
    fn: (...args: any[]) => {
      if (resolve) {
        resolve(args);
      }
    },
    waitForCall: () =>
      new Promise<any[]>((r) => {
        resolve = r;
      }),
  };
};
