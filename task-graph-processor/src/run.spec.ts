import { Signal } from "typed-signals";
import { spy, callOrderOf, callsOf } from "testtriple";
import { createPipeline } from "./run.js";
import { Service, Task, TaskItem } from "./taskfile.js";

describe("runTasks", () => {
  it("runs tasks in order", async () => {
    const a = makeTask("a", [], true);
    const b = makeTask("b", [a], true);
    const c = makeTask("c", [b], true);

    const result = await new Promise((resolve) => {
      const pipeline = createPipeline([a, b, c], {});
      pipeline.onFinish.connect(resolve);
      pipeline.start();
    });
    expect(result).toBe(true);
    expect(callOrderOf(a.execute, b.execute, c.execute)).toStrictEqual([
      a.execute,
      b.execute,
      c.execute,
    ]);
  });

  it("stops after first failure", async () => {
    const a = makeTask("a", [], true);
    const b = makeTask("b", [a], false);
    const c = makeTask("c", [b], true);
    const result = await new Promise((resolve) => {
      const pipeline = createPipeline([a, b, c], {});
      pipeline.onFinish.connect(resolve);
      pipeline.start();
    });

    expect(result).toBe(false);
    expect(callOrderOf(a.execute, b.execute, c.execute)).toStrictEqual([
      a.execute,
      b.execute,
    ]);
  });

  it("handles changes correctly", async () => {
    let changeEmitted = false;
    const a = makeTask("a", [], true);
    const b = makeTask("b", [a], true);
    const c = makeTask("c", [b], true);

    b.execute = spy(() => {
      if (!changeEmitted) {
        setTimeout(() => a.onChange.emit(), 5);
        changeEmitted = true;
      }
      setTimeout(() => b.onFinish.emit(true), 10);
    });

    const result = await new Promise((resolve) => {
      const pipeline = createPipeline([a, b, c], {});
      pipeline.onFinish.connect(resolve);
      pipeline.start();
    });

    expect(result).toBe(true);
    expect(callOrderOf(a.execute, b.execute, c.execute)).toStrictEqual([
      a.execute,
      b.execute,
      a.execute,
      c.execute,
    ]);
  });
  it("runs tasks concurrently", async () => {
    const a = makeTask("a", [], true);
    const b = makeTask("b", [a], true);
    const b2 = makeTask("b2", [a], true);
    const c = makeTask("c", [b, b2], true);
    const result = await new Promise((resolve) => {
      const pipeline = createPipeline([a, b, b2, c], {});
      pipeline.onFinish.connect(resolve);
      pipeline.start();
    });

    expect(result).toBe(true);
    expect(
      callOrderOf(a.execute, b.execute, b2.execute, c.execute)
    ).toStrictEqual([a.execute, b.execute, b2.execute, c.execute]);
  });

  it("doesn't call watch without watch flag", () => {
    const a = makeTask("a", [], true);
    const b = makeTask("b", [a], true);
    const tasks = [a, b];
    const pipeline = createPipeline(tasks, {});
    pipeline.start();

    expect(callsOf(a.watch)).toStrictEqual([]);
    expect(callsOf(b.watch)).toStrictEqual([]);
  });

  it("calls watch with watch flag", () => {
    const a = makeTask("a", [], true);
    const b = makeTask("b", [a], true);
    const tasks = [a, b];
    const pipeline = createPipeline(tasks, { watch: true });
    pipeline.start();

    expect(callsOf(a.watch)).toStrictEqual([[]]);
    expect(callsOf(b.watch)).toStrictEqual([[]]);
  });

  it("doesn't run services if not in watch mode", () => {
    const s = makeService("s");
    const pipeline = createPipeline([s], {});
    pipeline.start();
    expect(callsOf(s.start)).toStrictEqual([]);
  });

  it("runs services if in watch mode and immediately continues to next task", async () => {
    const s = makeService("s");
    const a = makeTask("a", [s], true);
    await new Promise((resolve) => {
      const pipeline = createPipeline([a, s], { watch: true });
      pipeline.onFinish.connect(resolve);
      pipeline.start();
    });

    expect(callsOf(s.start)).toStrictEqual([[]]);
    expect(callsOf(a.execute)).toStrictEqual([[]]);
  });
});

const makeService = (name: string) => {
  const task: Service = {
    id: name,
    kind: "service",
    name,
    onOutput: new Signal(),
    start: spy(),
    dependencies: [],
    dependents: [],
    state: { type: "PENDING" },
  };
  return task;
};

const makeTask = (
  name: string,
  dependencies: TaskItem[],
  success: boolean
): Task => {
  const task: Task = {
    id: name,
    kind: "task",
    name,
    onFinish: new Signal(),
    onChange: new Signal(),
    onOutput: new Signal(),
    execute: spy(() => setTimeout(() => task.onFinish.emit(success), 10)),
    dependencies,
    dependents: [],
    watch: spy(),
    state: { type: "PENDING" },
  };
  for (const dependency of dependencies) {
    dependency.dependents.push(task);
  }

  return task;
};
