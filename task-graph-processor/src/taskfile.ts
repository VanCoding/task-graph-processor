import z from "zod";
import { resolve, dirname } from "path";
import { readFileSync, existsSync, realpathSync } from "fs";
import { indexBy } from "remeda";
import { Signal } from "typed-signals";
import commondir from "commondir";
import { makeService } from "./service.js";
import { makeTask } from "./task.js";

const getCommonDirectory = (tasks: TaskDeclaration[]) =>
  commondir(tasks.map((task) => dirname(task.file)));

const kinds = ["task", "service"] as const;

export const TaskfileSchema = z.record(
  z.string(),
  z
    .object({
      command: z.string().nullable().optional().default(null),
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
    .or(z.string())
);

export type TaskDeclaration = {
  file: string;
  name: string;
  kind: TaskKind;
  triggerStart?: { stdin: string };
  detectEnd?: { stdout: { success: string; failure: string } };
  detectChanges?: { stdout: string };
  dependencies: TaskReference[];
  watch: string[];
  command: string | null;
};

export type TaskReference = { file: string; name: string };

export type TaskKind = typeof kinds[number];

export type Worker = {
  execute: () => void;
  onChange: Signal<() => void>;
  onFinish: Signal<(success: boolean) => void>;
  onOutput: Signal<(line: string) => void>;
};

const resolveTaskLinks = (links: string[], baseDirectory = process.cwd()) =>
  links.map((link) => getTaskNameAndFile(link, baseDirectory, null));

export const readTasks = (links: string[]): TaskItem[] => {
  const entrypoints = resolveTaskLinks(links);
  const entrypointFiles = Array.from(new Set(entrypoints.map((e) => e.file)));
  const declarations = readTaskDeclarations(entrypointFiles, new Map());
  const resolvedDeclarations = declarations.flatMap((declaration) => {
    if (!declaration.command) return [];
    return {
      ...declaration,
      dependencies: resolveReferences(declaration.dependencies, declarations),
    };
  });
  const resolvedEntrypoints = resolveReferences(entrypoints, declarations);
  const commonDirectory = getCommonDirectory(resolvedDeclarations);
  const byId = indexBy(resolvedDeclarations, (d) =>
    buildTaskId(d, commonDirectory)
  );
  const tasks = new Map<string, TaskItem>();
  prepareInvolvedTasks(
    resolvedEntrypoints.map((e) => buildTaskId(e, commonDirectory)),
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

const resolveReferences = (
  references: TaskReference[],
  allDeclarations: TaskDeclaration[]
): TaskReference[] => {
  return references.flatMap((ref) => {
    const task = allDeclarations.find(
      (d) => d.file === ref.file && d.name === ref.name
    );
    if (!task) throw new Error(`Task ${ref.file}:${ref.name} not found`);
    if (!task.command) {
      return resolveReferences(task.dependencies, allDeclarations);
    } else {
      return [ref];
    }
  });
};

const prepareInvolvedTasks = (
  taskIds: string[],
  taskDeclarationsById: Record<string, TaskDeclaration>,
  tasks: Map<string, TaskItem>,
  commonDirectory: string
) => {
  for (const taskId of taskIds) {
    if (!tasks.has(taskId)) {
      const declaration = taskDeclarationsById[taskId];
      if (!declaration) throw new Error(`could not find task ${taskId}`);

      tasks.set(taskId, makeTaskItem(declaration, commonDirectory));
      prepareInvolvedTasks(
        declaration.dependencies.map((d) => buildTaskId(d, commonDirectory)),
        taskDeclarationsById,
        tasks,
        commonDirectory
      );
    }
  }
};

const makeTaskItem = (
  declaration: TaskDeclaration,
  commonDirectory: string
): TaskItem => {
  const directory = getTaskDirectory(declaration.file);
  const onOutput = new Signal<(line: string) => void>();

  const base: BaseTask = {
    id: buildTaskId(declaration, commonDirectory),
    name: declaration.name,
    dependencies: [],
    dependents: [],
    onOutput,
    state: { type: "PENDING" },
  };

  return declaration.kind === "task"
    ? makeTask({ declaration, directory, base })
    : makeService({ declaration, directory, base });
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
  const nodeModulePath = resolve(
    baseDirectory,
    "node_modules",
    path,
    "taskfile.json"
  );
  if (existsSync(nodeModulePath)) {
    return realpathSync(nodeModulePath);
  }
  throw new Error(`No Taskfile at ${path}`);
};

export const resolveTaskFiles = (baseDirectory: string, paths: string[]) =>
  paths.map((path) => resolveTaskfile(path, baseDirectory));

export const readTaskfileTasks = (file: string): TaskDeclaration[] => {
  const content = readFileSync(file).toString("utf-8");
  const parsed = TaskfileSchema.parse(JSON.parse(content));
  const directory = getTaskDirectory(file);
  return Object.entries(parsed).map(([name, task]) => {
    return {
      ...(typeof task === "string"
        ? { command: task, kind: "task", watch: [] }
        : task),
      name,
      file,
      dependencies:
        typeof task === "string"
          ? []
          : task.dependencies.map((d) =>
              getTaskNameAndFile(d, directory, name)
            ),
    };
  });
};

export const getTaskNameAndFile = (
  task: string | { name?: string; path?: string },
  directory: string,
  parentTaskName: string | null
) => {
  const taskObj = typeof task === "object" ? task : parseTaskReference(task);
  if (!parentTaskName && !taskObj.name)
    throw new Error("must specify task name");
  if (!taskObj.name && !taskObj.path)
    throw new Error("must specify either name or path");
  const file = resolveTaskfile(taskObj.path || "./", directory);
  return {
    name: taskObj.name || parentTaskName!,
    file,
  };
};

export const parseTaskReference = (
  name: string
): { name: string; path: string } => {
  const parts = name.split(":");
  if (parts.length > 2) throw new Error(`invalid task ${name}`);
  return parts.length === 1
    ? { name, path: "" }
    : { path: parts[0], name: parts[1] };
};

export const getTaskDirectory = (taskfilePath: string) => dirname(taskfilePath);
export const buildTaskId = (
  declaration: Pick<TaskDeclaration, "name" | "file">,
  commonDirectory: string
) => {
  const dir = dirname(declaration.file).substring(commonDirectory.length + 1);
  return `${dir}:${declaration.name}`;
};

type TaskState =
  | {
      type: "PENDING";
    }
  | {
      type: "RUNNING";
      start: Date;
      dirty: boolean;
    }
  | {
      type: "COMPLETE";
      time: number;
      success: boolean;
    };

export type BaseTask = {
  id: string;
  name: string;
  dependencies: TaskItem[];
  dependents: TaskItem[];
  onOutput: Signal<(line: string) => void>;
  state: TaskState;
};

export type Task = BaseTask & {
  kind: "task";
  onFinish: Signal<(success: boolean) => void>;
  onChange: Signal<() => void>;
  execute: () => void;
  watch: () => void;
};

export type Service = BaseTask & {
  kind: "service";
  start: () => void;
};

export type TaskItem = Task | Service;
