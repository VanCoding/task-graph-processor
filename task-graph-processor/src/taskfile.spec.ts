import { callsOf, spy } from "testtriple";
import { mkdirSync, writeFileSync } from "fs";
import { readTasks, Task } from "./taskfile.js";

describe("readTasks", () => {
  it("reads tasks correctly", () => {
    const tasks = readTasks(["test-data/a:buildA"]);
    const [a] = tasks;
    expect(tasks).toHaveLength(1);
    expect(a.declaration.name).toBe("buildA");
    expect(a.dependencies).toHaveLength(2);
    const [b, x] = a.dependencies;
    expect(b.declaration.name).toBe("buildB");
    expect(x.declaration.name).toBe("buildX");
    expect(b.dependencies).toHaveLength(1);
    const [c] = b.dependencies;
    expect(c.declaration.name).toBe("buildC");
  });
  it("reads lint task correctly", () => {
    const [lintB] = readTasks(["test-data/b:lint"]);
    expect(lintB.declaration.name).toBe("lint");
    const [lintC] = lintB.dependencies;
    expect(lintC.declaration.name).toBe("lint");
    const [buildC] = lintC.dependencies;
    expect(buildC.declaration.name).toBe("buildC");
  });

  it("wires up workers correctly", async () => {
    const [lint] = readTasks(["test-data/b:lint"]);
    expect(lint.declaration.name).toBe("lint");
    const output: string[] = [];
    (lint as Task).onOutput.connect((line) => output.push(line));
    if (lint.kind !== "task") throw new Error("must be a task");
    lint.execute();
    await waitFor(() => output.length > 0);
    expect(output).toStrictEqual(["hello"]);
  });

  it("watching files works", async () => {
    const [buildC] = readTasks(["test-data/c:buildC"]);
    if (buildC.kind !== "task") throw new Error("must be a task");
    const onChange = spy();
    buildC.onChange.connect(onChange);
    mkdirSync("./test-data/c/tmp/", { recursive: true });
    buildC.watch();
    writeFileSync("./test-data/c/tmp/file.txt", new Date().getTime() + "");

    await waitFor(() => callsOf(onChange).length > 0);
  });
  it("sets kind to virtual if no command is set", () => {
    const [virtual] = readTasks(["test-data/a:virtual"]);

    expect(virtual.kind).toBe("virtual");
  });
  it("throws if neither a command nor dependencies are set", () => {
    expect(() => {
      readTasks(["test-data/invalid:invalid"]);
    }).toThrow("a task must either have a command or dependencies");
  });
});

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const waitFor = async (f: (...args: any[]) => any, timeout = 5000) => {
  const start = new Date().getTime();
  while (!f() && new Date().getTime() - start < timeout) await sleep(100);
  if (!f()) throw new Error("condition not met within timeout");
};
