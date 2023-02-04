import { callsOf, spy } from "testtriple";
import { mkdirSync, writeFileSync } from "fs";
import { readTasks } from "./taskfile.js";

describe("readTasks", () => {
  it("reads tasks correctly", () => {
    const tasks = readTasks(["test-data/a:buildA"]);
    const [a, b, c, x] = tasks;
    expect(tasks).toHaveLength(4);
    expect(a.name).toBe("buildA");
    expect(a.id).toBe("a:buildA");
    expect(b.name).toBe("buildB");
    expect(b.id).toBe("b:buildB");
    expect(c.name).toBe("buildC");
    expect(c.id).toBe("c:buildC");
    expect(x.name).toBe("buildX");
    expect(x.id).toBe("a/node_modules/x:buildX");
  });
  it("reads lint task correctly", () => {
    const [lint] = readTasks(["test-data/b:lint"]);
    expect(lint.name).toBe("lint");
  });

  it("wires up workers correctly", async () => {
    const [lint] = readTasks(["test-data/b:lint"]);
    expect(lint.name).toBe("lint");
    const output: string[] = [];
    lint.onOutput.connect((line) => output.push(line));
    lint.execute();
    await waitFor(() => output.length > 0);
    expect(output).toStrictEqual(["hello"]);
  });

  it("watching files works", async () => {
    const [buildC] = readTasks(["test-data/c:buildC"]);
    const onChange = spy();
    buildC.onChange.connect(onChange);
    mkdirSync("./test-data/c/tmp/", { recursive: true });
    buildC.watch();
    writeFileSync("./test-data/c/tmp/file.txt", new Date().getTime() + "");

    await waitFor(() => callsOf(onChange).length > 0);
  });
});

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const waitFor = async (f: (...args: any[]) => any, timeout = 5000) => {
  const start = new Date().getTime();
  while (!f() && new Date().getTime() - start < timeout) await sleep(100);
  if (!f()) throw new Error("condition not met within timeout");
};
