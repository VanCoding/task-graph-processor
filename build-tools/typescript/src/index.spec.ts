import { makeGenericWorkerFactory } from "watch-task-protocol/server.js";
import { readFileSync, write, writeFileSync, mkdirSync, existsSync } from "fs";

describe("typescript", () => {
  it("can build typescript projects", async () => {
    if (!existsSync("./test-data/src")) mkdirSync("./test-data/src");
    writeFileSync("./test-data/src/index.ts", 'export default "hello"');

    let resolve: (success: boolean) => void = () => {};

    const { execute } = makeGenericWorkerFactory({
      directory: "./test-data",
      command:
        "NODE_OPTIONS='--loader ts-node/esm --no-warnings' node ../src/index.ts",
    })({
      onOutput: (line) => console.log(line),
      onComplete: (success) => resolve(success),
      onChange: () => {},
    });

    const success = await new Promise((r) => {
      resolve = r;
      execute();
    });

    execute();
    expect(success).toBe(true);
    expect(readFileSync("./test-data/dist/index.js") + "").toContain(
      'export default "hello";'
    );

    writeFileSync("./test-data/src/index.ts", 'export default "world"');
    await new Promise((s) => setTimeout(s, 1000));
    expect(readFileSync("./test-data/dist/index.js") + "").toContain(
      'export default "hello";'
    );

    const success2 = await new Promise((r) => {
      resolve = r;
      execute();
    });

    expect(success2).toBe(true);
    expect(readFileSync("./test-data/dist/index.js") + "").toContain(
      'export default "world";'
    );
  });
});
