import { dirname } from "path";
import chalk from "chalk";
import { Signal } from "typed-signals";
import distinctColors from "distinct-colors";
import { TaskDeclaration, TaskItem } from "./taskfile.js";
import commondir from "commondir";

type PipelineItem = {
  id: string;
  task: TaskItem;
  color: string;
  dependencies: PipelineItem[];
  dependents: PipelineItem[];
};

export const createPipeline = (
  entrypoints: TaskItem[],
  options: PipelineOptions
): Pipeline => {
  const tasks = addTasksToExecute(entrypoints);

  const colors = distinctColors
    .default({ count: tasks.size })
    .map((c) => c.hex());

  const commonDirectory = getCommonDirectory(Array.from(tasks));

  const items: PipelineItem[] = Array.from(tasks).map((task, index) => ({
    id: buildTaskId(task.declaration, commonDirectory),
    task,
    color: colors[index],
    dependencies: [],
    dependents: [],
    state: { type: "PENDING" },
  }));

  const itemByTask = (task: TaskItem) =>
    items.find((item) => item.task === task)!;

  for (const item of items) {
    item.dependencies = Array.from(addToDependencies(item.task, tasks)).map(
      itemByTask
    );
    for (const dependency of item.dependencies) {
      dependency.dependents.push(item);
    }
  }

  const pipeline: Pipeline = {
    items,
    options,
    onFinish: new Signal(),
    start: () => {
      decideAction(pipeline);
      if (options.watch) {
        for (const task of tasks) {
          if (task.kind === "task") task.watch();
        }
      }
    },
  };

  items.forEach((item) => {
    if ("onOutput" in item.task) {
      item.task.onOutput.connect((line) => printTaskLine(item, line));
    }
    if (item.task.kind === "task") {
      item.task.onChange.connect(() => {
        markDirty(item, pipeline);
        decideAction(pipeline);
      });
      item.task.onFinish.connect((success) => {
        markCompleted(item, success, pipeline);
      });
    }
  });

  return pipeline;
};

const addTasksToExecute = (
  tasks: TaskItem[],
  tasksToExecute: Set<TaskItem> = new Set()
) => {
  for (const task of tasks) {
    tasksToExecute.add(task);
    addTasksToExecute(task.dependencies, tasksToExecute);
  }
  return tasksToExecute;
};

const addToDependencies = (
  task: TaskItem,
  tasksToExecute: Set<TaskItem>,
  dependencies: Set<TaskItem> = new Set()
) => {
  for (const subtask of task.after.concat(task.dependencies)) {
    if (tasksToExecute.has(subtask)) {
      dependencies.add(subtask);
    } else {
      addToDependencies(subtask, tasksToExecute, dependencies);
    }
  }
  return dependencies;
};

type PipelineOptions = {
  watch?: boolean;
};

type Pipeline = {
  items: PipelineItem[];
  options: PipelineOptions;
  onFinish: Signal<(success: boolean) => void>;
  start: () => void;
};

const printTaskLine = (item: PipelineItem, text: string) => {
  console.log(`${chalk.hex(item.color).bold(item.id)}> ${text}`);
};

const isBuildable = (item: PipelineItem, pipeline: Pipeline): boolean => {
  const allDependenciesDone = !item.dependencies.find(
    (i) => !isDone(i, pipeline)
  );
  return (
    allDependenciesDone &&
    item.task.kind !== "virtual" &&
    item.task.state.type === "PENDING"
  );
};

const getBuildableItems = (pipeline: Pipeline): PipelineItem[] => {
  return pipeline.items.filter((item) => isBuildable(item, pipeline));
};

const markDirty = (item: PipelineItem, pipeline: Pipeline) => {
  if (item.task.kind !== "virtual") {
    item.task.state =
      item.task.state.type === "RUNNING"
        ? { ...item.task.state, dirty: true }
        : { type: "PENDING" };
  }
  for (const dependent of item.dependents) {
    markDirty(dependent, pipeline);
  }
};

const markCompleted = (
  item: PipelineItem,
  success: boolean,
  pipeline: Pipeline
) => {
  if (item.task.kind === "virtual") return;
  if (item.task.state.type === "RUNNING") {
    const time = new Date().getTime() - item.task.state.start.getTime();
    item.task.state = {
      type: "COMPLETE",
      success,
      time,
    };
    if (success) {
      printTaskLine(
        item,
        `${success ? "succeeded" : "failed"} after ${time}ms`
      );
    }
    decideAction(pipeline);
  }
};

const execute = (item: PipelineItem, pipeline: Pipeline) => {
  printTaskLine(item, "starting...");
  if (item.task.kind === "task") {
    item.task.state = {
      type: "RUNNING",
      dirty: false,
      start: new Date(),
    };
    item.task.execute();
  } else if (item.task.kind === "service") {
    item.task.start();
    item.task.state = {
      type: "RUNNING",
      dirty: false,
      start: new Date(),
    };
    decideAction(pipeline);
  }
};

const isFailed = (item: PipelineItem) =>
  item.task.kind !== "virtual" &&
  item.task.state.type === "COMPLETE" &&
  !item.task.state.success;

const isDone = (item: PipelineItem, pipeline: Pipeline): boolean =>
  item.task.kind === "virtual"
    ? !item.dependencies.find((i) => !isDone(i, pipeline))
    : item.task.kind === "task"
    ? item.task.state.type === "COMPLETE" && item.task.state.success
    : item.task.state.type === "RUNNING" || !pipeline.options.watch;

const decideAction = (pipeline: Pipeline) => {
  const failed = !!pipeline.items.find(isFailed);
  if (failed) {
    console.log("at least one task failed, waiting for changes...");
    pipeline.onFinish.emit(false);
    return;
  }
  const allComplete = !pipeline.items.find((item) => !isDone(item, pipeline));
  if (allComplete) {
    console.log("all tasks completed, waiting for changes...");
    pipeline.onFinish.emit(true);
    return;
  }
  const buildableProjects = getBuildableItems(pipeline);
  for (const project of buildableProjects) {
    execute(project, pipeline);
  }
};

const getCommonDirectory = (tasks: TaskItem[]) =>
  commondir(tasks.map((task) => dirname(task.declaration.file)));

export const buildTaskId = (
  declaration: Pick<TaskDeclaration, "name" | "file">,
  commonDirectory: string
) => {
  const dir = dirname(declaration.file).substring(commonDirectory.length + 1);
  return `${dir}:${declaration.name}`;
};
