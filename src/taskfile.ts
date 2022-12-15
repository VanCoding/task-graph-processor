import z from "zod";
import { resolve, dirname } from "path";
import { readFileSync, existsSync, realpathSync } from "fs";
import { indexBy } from "remeda";
import { Signal } from "typed-signals";
import { makeTGPWorkerFactory } from "./task-graph-protocol/worker.js";

const kinds = ["task", "service"] as const;

export const TaskfileSchema = z.record(
  z.string(),
  z.object({
    command: z.string(),
    kind: z.enum(kinds).optional().default("task"),
    dependencies: z
      .array(
        z.object({
          path: z.string().optional(),
          name: z.string(),
        })
      )
      .optional()
      .default([]),
    watch: z.array(z.string()).optional().default([]),
  })
);

export type TaskDeclaration = {
  file: string;
  name: string;
  id: string;
  kind: TaskKind;
  dependencies: Array<{ file: string; name: string; id: string }>;
  watch: string[];
  command: string;
};
export type TaskKind = typeof kinds[number];

export type WorkerFactory = (init: {
  onOutput: (line: string) => void;
  onComplete: (success: boolean) => void;
  onChange: () => void;
}) => WorkerFactoryResult;
export type WorkerFactoryResult = { execute: () => void };
export type Worker = {
  execute: () => void;
  onChange: Signal<() => void>;
  onFinish: Signal<(success: boolean) => void>;
  onOutput: Signal<(line: string) => void>;
};

const resolveTaskLinks = (links: string[], baseDirectory = process.cwd()) =>
  links.map((link) => {
    const [name, path = "./"] = link.split(":");
    const file = resolveTaskfile(path, baseDirectory);
    return {
      file,
      name,
      id: buildTaskId({ name, file }),
    };
  });

export const readTasks = (links: string[]): Task[] => {
  const entrypoints = resolveTaskLinks(links);
  const entrypointFiles = Array.from(new Set(entrypoints.map((e) => e.file)));
  const declarations = readTaskDeclarations(entrypointFiles, new Map());
  const byId = indexBy(declarations, (d) => d.id);
  const tasks = new Map<string, Task>();
  prepareInvolvedTasks(
    entrypoints.map((e) => e.id),
    byId,
    tasks
  );
  for (const task of tasks.values()) {
    for (const dependency of byId[task.id].dependencies) {
      const dependencyTask = tasks.get(dependency.id)!;
      if (!dependencyTask) {
        throw new Error(`Task ${dependency.id} not found`);
      }
      task.dependencies.push(dependencyTask);
      dependencyTask.dependents.push(task);
    }
  }

  return Array.from(tasks.values());
};

const prepareInvolvedTasks = (
  taskIds: string[],
  taskDeclarationsById: Record<string, TaskDeclaration>,
  tasks: Map<string, Task>
) => {
  for (const taskId of taskIds) {
    if (!tasks.has(taskId)) {
      const declaration = taskDeclarationsById[taskId];
      if (!declaration) throw new Error(`could not find task ${taskId}`);
      const directory = getTaskDirectory(declaration.file);

      const workerFactory = makeTGPWorkerFactory({
        directory,
        command: declaration.command,
      });

      const onOutput = new Signal<(line: string) => void>();
      const onChange = new Signal<() => void>();
      const onFinish = new Signal<(success: boolean) => void>();

      const { execute } = workerFactory({
        onOutput: (line) => onOutput.emit(line),
        onChange: () => onChange.emit(),
        onComplete: (success) => onFinish.emit(success),
      });
      const task: Task = {
        id: declaration.id,
        name: declaration.name,
        dependencies: [],
        dependents: [],
        execute,
        onChange,
        onFinish,
        onOutput,
      };

      tasks.set(taskId, task);
      prepareInvolvedTasks(
        declaration.dependencies.map((d) => d.id),
        taskDeclarationsById,
        tasks
      );
    }
  }
};

export const readTaskDeclarations = (
  files: string[],
  taskfiles: Map<string, TaskDeclaration[]>
) => {
  for (const taskfilePath of files) {
    if (!taskfiles.has(taskfilePath)) {
      const tasks = readTaskfileTasks(taskfilePath);
      taskfiles.set(taskfilePath, tasks);
      for (const task of tasks) {
        readTaskDeclarations(
          Array.from(new Set(task.dependencies.map((d) => d.file))),
          taskfiles
        );
      }
    }
  }
  return Array.from(taskfiles.values()).flatMap((tasks) => tasks);
};

export const resolveTaskfile = (path: string, baseDirectory: string) => {
  if (path.endsWith(".json")) {
    const resolvedPath = resolve(baseDirectory, path);
    if (!existsSync(resolvedPath))
      throw new Error(`No Taskfile at ${resolvedPath}`);
    return realpathSync(resolvedPath);
  }
  const dirPath = resolve(baseDirectory, path, "taskfile.json");
  if (existsSync(dirPath)) {
    return realpathSync(dirPath);
  }
  throw new Error(`No Taskfile at ${path}`);
};

export const resolveTaskFiles = (baseDirectory: string, paths: string[]) =>
  paths.map((path) => resolveTaskfile(path, baseDirectory));

export const readTaskfileTasks = (file: string): TaskDeclaration[] => {
  const content = readFileSync(file).toString("utf-8");
  const parsed = TaskfileSchema.parse(JSON.parse(content));
  const directory = getTaskDirectory(file);
  return Object.entries(parsed).map(([name, task]) => ({
    ...task,
    id: file + ":" + name,
    name,
    file,
    dependencies: task.dependencies.map((d) => {
      const file = resolveTaskfile(d.path ?? "./", directory);
      return {
        name: d.name,
        id: buildTaskId({ name: d.name, file }),
        file,
      };
    }),
  }));
};

export const getTaskDirectory = (taskfilePath: string) => dirname(taskfilePath);
export const buildTaskId = ({ name, file }: { name: string; file: string }) =>
  `${file}:${name}`;

export type Task = {
  id: string;
  name: string;
  dependencies: Task[];
  dependents: Task[];
  onOutput: Signal<(line: string) => void>;
  onFinish: Signal<(success: boolean) => void>;
  onChange: Signal<() => void>;
  execute: () => void;
};
