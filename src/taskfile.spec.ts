import { readTasks } from "./taskfile.js";
describe("readTasks", () => {
  it("reads tasks correctly", () => {
    const tasks = readTasks(["test-data/a:buildA"]);
    const [a, b, c] = tasks;
    expect(tasks).toHaveLength(3);
    expect(a.name).toBe("buildA");
    expect(a.id).toBe("a:buildA");
    expect(b.name).toBe("buildB");
    expect(b.id).toBe("b:buildB");
    expect(c.name).toBe("buildC");
    expect(c.id).toBe("c:buildC");
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
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (f: (...args: any[]) => any) => {
  while (!f()) await sleep(1000);
  return f();
};
