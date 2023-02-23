import { Signal } from "typed-signals";
import { spy, callOrderOf, callsOf } from "testtriple";
import { createPipeline } from "./pipeline.js";
import { Service, Task, TaskDeclaration, Virtual } from "./taskfile.js";

describe("pipeline", () => {
  it("runs tasks in order", async () => {
    const a = makeTask("a");
    const b = makeTask("b", { dependencies: [a] });
    const c = makeTask("c", { dependencies: [b] });

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
    const a = makeTask("a");
    const b = makeTask("b", { dependencies: [a], success: false });
    const c = makeTask("c", { dependencies: [b] });
    const result = await new Promise((resolve) => {
      const pipeline = createPipeline([c], {});
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
    const a = makeTask("a");
    const b = makeTask("b", { dependencies: [a] });
    const c = makeTask("c", { dependencies: [b] });

    b.execute = spy(() => {
      if (!changeEmitted) {
        setTimeout(() => a.onChange.emit(), 5);
        changeEmitted = true;
      }
      setTimeout(() => b.onFinish.emit(true), 10);
    });

    const result = await new Promise((resolve) => {
      const pipeline = createPipeline([c], {});
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
    const a = makeTask("a");
    const b = makeTask("b", { dependencies: [a] });
    const b2 = makeTask("b2", { dependencies: [a] });
    const c = makeTask("c", { dependencies: [b, b2] });
    const result = await new Promise((resolve) => {
      const pipeline = createPipeline([c], {});
      pipeline.onFinish.connect(resolve);
      pipeline.start();
    });

    expect(result).toBe(true);
    expect(
      callOrderOf(a.execute, b.execute, b2.execute, c.execute)
    ).toStrictEqual([a.execute, b.execute, b2.execute, c.execute]);
  });

  it("doesn't call watch without watch flag", () => {
    const a = makeTask("a");
    const b = makeTask("b", { dependencies: [a] });
    const pipeline = createPipeline([b], {});
    pipeline.start();

    expect(callsOf(a.watch)).toStrictEqual([]);
    expect(callsOf(b.watch)).toStrictEqual([]);
  });

  it("calls watch with watch flag", () => {
    const a = makeTask("a");
    const b = makeTask("b", { dependencies: [a] });
    const pipeline = createPipeline([b], { watch: true });
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
    const a = makeTask("a", { dependencies: [s] });
    await new Promise((resolve) => {
      const pipeline = createPipeline([a], { watch: true });
      pipeline.onFinish.connect(resolve);
      pipeline.start();
    });

    expect(callsOf(s.start)).toStrictEqual([[]]);
    expect(callsOf(a.execute)).toStrictEqual([[]]);
  });

  it("respects after in execution order", async () => {
    const a = makeTask("a");
    const b = makeTask("b", { after: [a] });
    const c = makeTask("c", { after: [b] });
    const d = makeTask("d", { after: [c] });

    const result = await new Promise((resolve) => {
      const pipeline = createPipeline([c, a, d], {});
      pipeline.onFinish.connect(resolve);
      pipeline.start();
    });
    expect(result).toBe(true);
    expect(
      callOrderOf(a.execute, b.execute, c.execute, d.execute)
    ).toStrictEqual([a.execute, c.execute, d.execute]);
  });

  it("treats after as dependencies if they're referenced", () => {
    const main = makeTask("main");
    const virtual = makeVirtual("virtual", { after: [main] });

    const pipeline = createPipeline([main, virtual], {});

    const mainItem = pipeline.items.find((i) => i.task == main)!;
    const virtualItem = pipeline.items.find((i) => i.task === virtual)!;
    expect(virtualItem.dependencies[0]).toBe(mainItem);
  });
  it("directly adds after dependencies to the actual referenced tasks and ignores the non-referenced in between", () => {
    const main = makeTask("main");
    const virtual = makeVirtual("virtual", { after: [main] });
    const virtual2 = makeVirtual("virtual2", { after: [virtual] });

    const pipeline = createPipeline([main, virtual2], {});

    const mainItem = pipeline.items.find((i) => i.task == main)!;
    const virtual2Item = pipeline.items.find((i) => i.task === virtual2)!;
    expect(virtual2Item.dependencies[0]).toBe(mainItem);
  });

  it("ignores after if they're not a dependency", () => {
    const main = makeTask("main");
    const virtual = makeVirtual("virtual", { after: [main] });

    const pipeline = createPipeline([virtual], {});

    const virtualItem = pipeline.items.find((i) => i.task === virtual)!;
    expect(virtualItem.dependencies).toHaveLength(0);
  });
});

const makeDeclaration = (name: string): TaskDeclaration => ({
  after: [],
  dependencies: [],
  file: "/file",
  name,
  kind: "virtual",
  watch: [],
});

const makeService = (name: string) => {
  const task: Service = {
    pathId: "/file/" + name,
    declaration: makeDeclaration(name),
    kind: "service",
    onOutput: new Signal(),
    start: spy(),
    dependencies: [],
    after: [],
    state: { type: "PENDING" },
  };
  return task;
};

const makeTask = (
  name: string,
  { success = true, ...data }: Partial<Task & { success: boolean }> = {}
): Task => {
  const task: Task = {
    pathId: "/file/" + name,
    declaration: makeDeclaration(name),
    kind: "task",
    onFinish: new Signal(),
    onChange: new Signal(),
    onOutput: new Signal(),
    execute: spy(() => setTimeout(() => task.onFinish.emit(success), 10)),
    dependencies: [],
    after: [],
    watch: spy(),
    state: { type: "PENDING" },
    ...data,
  };

  return task;
};

const makeVirtual = (name: string, data: Partial<Virtual> = {}): Virtual => ({
  kind: "virtual",
  pathId: "/file/" + name,
  declaration: makeDeclaration(name),
  dependencies: [],
  after: [],
  ...data,
});
