import { readTasks } from "../taskfile.js";
import { readFileSync, write, writeFileSync, mkdirSync, existsSync } from "fs";

describe("typescript", () => {
  it("can build typescript projects", async () => {
    if (!existsSync("./test-data/typescript/src"))
      mkdirSync("./test-data/typescript/src");
    writeFileSync(
      "./test-data/typescript/src/index.ts",
      'export default "hello"'
    );

    const [ts] = readTasks(["build:test-data/typescript"]);
    ts.onOutput.connect((line) => console.log(line));
    const success = await new Promise((resolve) => {
      ts.onFinish.connect(resolve);
      ts.execute();
    });
    expect(success).toBe(true);
    expect(readFileSync("./test-data/typescript/dist/index.js") + "").toContain(
      'export default "hello";'
    );

    writeFileSync(
      "./test-data/typescript/src/index.ts",
      'export default "world"'
    );
    await new Promise((s) => setTimeout(s, 1000));
    expect(readFileSync("./test-data/typescript/dist/index.js") + "").toContain(
      'export default "hello";'
    );

    const success2 = await new Promise((resolve) => {
      ts.onFinish.connect(resolve);
      ts.execute();
    });

    expect(success2).toBe(true);
    expect(readFileSync("./test-data/typescript/dist/index.js") + "").toContain(
      'export default "world";'
    );
  });
});
