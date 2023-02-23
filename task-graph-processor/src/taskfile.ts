import z from "zod";
import { resolve, dirname } from "path";
import { readFileSync, existsSync, realpathSync } from "fs";
import { indexBy } from "remeda";
import { Signal } from "typed-signals";
import { makeService } from "./service.js";
import { makeTask } from "./task.js";

const kinds = ["task", "service", "virtual"] as const;

const TaskReference = z
  .object({
    path: z.string().optional(),
    name: z.string(),
  })
  .or(z.string());
const TaskReferences = TaskReference.array();

export const TaskfileSchema = z.record(
  z.string(),
  z
    .object({
      command: z.string().optional(),
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
      dependencies: TaskReferences.optional().default([]),
      after: TaskReferences.optional().default([]),
      watch: z.array(z.string()).optional().default([]),
    })
    .or(z.string())
);

type Taskfiles = Record<string, Taskfile>;

type Taskfile = {
  tasks: Record<string, TaskDeclaration>;
};

export type TaskDeclaration = {
  file: string;
  name: string;
  kind: TaskKind;
  triggerStart?: { stdin: string };
  detectEnd?: { stdout: { success: string; failure: string } };
  detectChanges?: { stdout: string };
  dependencies: TaskReference[];
  watch: string[];
  command?: string;
  after: TaskReference[];
};

type TaskReference = { file: string; name: string };

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
  const { taskfiles, entrypoinReferences } = resolveTaskfiles(
    links,
    process.cwd()
  );
  const taskDeclarations = Object.values(taskfiles)
    .map((taskfile) => Object.values(taskfile.tasks))
    .flat();
  const tasks: Record<string, TaskItem> = {};

  for (const declaration of taskDeclarations) {
    tasks[buildPathId(declaration)] = makeTaskItem(declaration);
  }
  for (const task of Object.values(tasks)) {
    task.dependencies = task.declaration.dependencies.map(
      (d) => tasks[buildPathId(d)]
    );
    task.after = task.declaration.after.map((d) => tasks[buildPathId(d)]);
  }

  return entrypoinReferences.map((e) => tasks[buildPathId(e)]);
};

export const resolveTaskfiles = (
  entrypoints: string[],
  baseDirectory: string
) => {
  const taskfiles: Taskfiles = {};
  const entrypoinReferences = resolveTaskLinks(entrypoints);

  for (const reference of entrypoinReferences) {
    resolveTaskReference(reference, taskfiles, baseDirectory);
  }

  return { taskfiles, entrypoinReferences };
};

export const resolveTaskReference = (
  reference: TaskReference,
  taskfiles: Taskfiles,
  baseDirectory: string
) => {
  const file = resolveTaskfile(reference.file, baseDirectory);
  if (taskfiles[file]) return;
  const taskfile = readTaskfile(file);
  taskfiles[file] = taskfile;
  for (const task of Object.values(taskfile.tasks)) {
    [...task.dependencies, ...task.after].forEach((ref) =>
      resolveTaskReference(ref, taskfiles, file)
    );
  }
};

const makeTaskItem = (declaration: TaskDeclaration): TaskItem => {
  const directory = getTaskDirectory(declaration.file);

  const base: BaseTask = {
    declaration,
    pathId: buildPathId(declaration),
    dependencies: [],
    after: [],
  };

  return declaration.kind === "task"
    ? makeTask({ declaration, directory, base })
    : declaration.kind === "service"
    ? makeService({ declaration, directory, base })
    : { ...base, kind: declaration.kind };
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

export const readTaskfile = (file: string): Taskfile => {
  const content = readFileSync(file).toString("utf-8");
  const parsed = TaskfileSchema.parse(JSON.parse(content));
  const directory = getTaskDirectory(file);
  const tasks = Object.entries(parsed).map(([name, task]) => {
    const declaration: TaskDeclaration = {
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
      after:
        typeof task === "string"
          ? []
          : task.after.map((t) => getTaskNameAndFile(t, directory, name)),
    };
    return declaration;
  });

  return { tasks: indexBy(tasks, (task) => buildPathId(task)) };
};

export const getTaskNameAndFile = (
  task: string | { name?: string; path?: string },
  directory: string,
  parentTaskName: string | null
): TaskReference => {
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
const buildPathId = ({ file, name }: Pick<TaskDeclaration, "name" | "file">) =>
  `${file}/${name}`;

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
  declaration: TaskDeclaration;
  pathId: string;
  dependencies: TaskItem[];
  after: TaskItem[];
};

export type Task = BaseTask & {
  kind: "task";
  onOutput: Signal<(line: string) => void>;
  onFinish: Signal<(success: boolean) => void>;
  onChange: Signal<() => void>;
  execute: () => void;
  watch: () => void;
  state: TaskState;
};

export type Service = BaseTask & {
  kind: "service";
  onOutput: Signal<(line: string) => void>;
  start: () => void;
  state: TaskState;
};

export type Virtual = BaseTask & {
  kind: "virtual";
};

export type TaskItem = Task | Service | Virtual;
