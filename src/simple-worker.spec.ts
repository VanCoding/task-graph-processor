import { makeSimpleWorkerFactory } from "./simple-worker.js";

describe("makeSimpleWorkerFactory", () => {
  it("starts the process and calls the hooks correctly", async () => {
    const onChange = spy();
    const onOutput = spy();
    const onComplete = spy();

    const worker = makeSimpleWorkerFactory({
      directory: "./test-data/",
      command: "echo $HELLO_WORLD",
    })({
      onChange: onChange.fn,
      onOutput: onOutput.fn,
      onComplete: onComplete.fn,
    });
    process.env.HELLO_WORLD = "building...";
    worker.execute();
    expect(await onOutput.waitForCall()).toStrictEqual(["building..."]);
    expect(await onComplete.waitForCall()).toStrictEqual([true]);
    process.env.HELLO_WORLD = "building again...";
    worker.execute();
    expect(await onOutput.waitForCall()).toStrictEqual(["building again..."]);
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
