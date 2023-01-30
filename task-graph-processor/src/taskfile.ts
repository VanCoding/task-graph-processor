import z from "zod";
import { resolve, dirname } from "path";
import { readFileSync, existsSync, realpathSync } from "fs";
import { indexBy } from "remeda";
import { Signal } from "typed-signals";
import commondir from "commondir";
import { watch } from "chokidar";
import { makeGenericWorkerFactory } from "watch-task-protocol/server.js";

const getCommonDirectory = (tasks: TaskDeclaration[]) =>
  commondir(tasks.map((task) => dirname(task.file)));

const kinds = ["task", "service"] as const;

export const TaskfileSchema = z.record(
  z.string(),
  z.object({
    command: z.string(),
    kind: z.enum(kinds).optional().default("task"),
    triggerStart: z
      .object({
        stdin: z.string(),
      })
      .optional(),
    detectEnd: z
      .object({
        stdout: z.object({
          success: z.string(),
          failure: z.string(),
        }),
      })
      .optional(),
    detectChanges: z
      .object({
        stdout: z.string(),
      })
      .optional(),
    dependencies: z
      .array(
        z
          .object({
            path: z.string().optional(),
            name: z.string(),
          })
          .or(z.string())
      )
      .optional()
      .default([]),
    watch: z.array(z.string()).optional().default([]),
  })
);

export type TaskDeclaration = {
  file: string;
  name: string;
  kind: TaskKind;
  triggerStart?: { stdin: string };
  detectEnd?: { stdout: { success: string; failure: string } };
  detectChanges?: { stdout: string };
  dependencies: Array<{ file: string; name: string }>;
  watch: string[];
  command: string;
};
export type TaskKind = typeof kinds[number];

export type Worker = {
  execute: () => void;
  onChange: Signal<() => void>;
  onFinish: Signal<(success: boolean) => void>;
  onOutput: Signal<(line: string) => void>;
};

const resolveTaskLinks = (links: string[], baseDirectory = process.cwd()) =>
  links.map((link) => getTaskNameAndFile(link, baseDirectory));

export const readTasks = (links: string[]): Task[] => {
  const entrypoints = resolveTaskLinks(links);
  const entrypointFiles = Array.from(new Set(entrypoints.map((e) => e.file)));
  const declarations = readTaskDeclarations(entrypointFiles, new Map());
  const commonDirectory = getCommonDirectory(declarations);
  const byId = indexBy(declarations, (d) => buildTaskId(d, commonDirectory));
  const tasks = new Map<string, Task>();
  prepareInvolvedTasks(
    entrypoints.map((e) => buildTaskId(e, commonDirectory)),
    byId,
    tasks,
    commonDirectory
  );
  for (const task of tasks.values()) {
    for (const dependency of byId[task.id].dependencies) {
      const dependencyTask = tasks.get(
        buildTaskId(dependency, commonDirectory)
      )!;
      if (!dependencyTask) {
        throw new Error(
          `Task ${buildTaskId(dependency, commonDirectory)} not found`
        );
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
  tasks: Map<string, Task>,
  commonDirectory: string
) => {
  for (const taskId of taskIds) {
    if (!tasks.has(taskId)) {
      const declaration = taskDeclarationsById[taskId];
      if (!declaration) throw new Error(`could not find task ${taskId}`);

      tasks.set(taskId, makeTask(declaration, commonDirectory));
      prepareInvolvedTasks(
        declaration.dependencies.map((d) => buildTaskId(d, commonDirectory)),
        taskDeclarationsById,
        tasks,
        commonDirectory
      );
    }
  }
};

const makeTask = (
  declaration: TaskDeclaration,
  commonDirectory: string
): Task => {
  const directory = getTaskDirectory(declaration.file);

  const workerFactory = makeGenericWorkerFactory({
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

  return {
    id: buildTaskId(declaration, commonDirectory),
    name: declaration.name,
    dependencies: [],
    dependents: [],
    execute,
    watch: () => {
      if (declaration.watch) {
        watch(declaration.watch, { cwd: directory }).on("all", () =>
          onChange.emit()
        );
      }
    },
    onChange,
    onFinish,
    onOutput,
  };
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
    name,
    file,
    dependencies: task.dependencies.map((d) =>
      getTaskNameAndFile(d, directory)
    ),
  }));
};

export const getTaskNameAndFile = (
  task: string | { name: string; path?: string },
  directory: string
) => {
  const taskObj = typeof task === "object" ? task : parseTaskReference(task);
  const file = resolveTaskfile(taskObj.path ?? "./", directory);
  return {
    name: taskObj.name,
    file,
  };
};

export const parseTaskReference = (
  name: string
): { name: string; path?: string } => {
  const parts = name.split(":");
  if (parts.length > 2) throw new Error(`invalid task ${name}`);
  return parts.length === 1 ? { name } : { path: parts[0], name: parts[1] };
};

export const getTaskDirectory = (taskfilePath: string) => dirname(taskfilePath);
export const buildTaskId = (
  declaration: Pick<TaskDeclaration, "name" | "file">,
  commonDirectory: string
) => {
  const dir = dirname(declaration.file).substring(commonDirectory.length + 1);
  return `${dir}:${declaration.name}`;
};

export type Task = {
  id: string;
  name: string;
  dependencies: Task[];
  dependents: Task[];
  onOutput: Signal<(line: string) => void>;
  onFinish: Signal<(success: boolean) => void>;
  onChange: Signal<() => void>;
  execute: () => void;
  watch: () => void;
};
