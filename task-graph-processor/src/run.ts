import chalk from "chalk";
import { Signal } from "typed-signals";
import distinctColors from "distinct-colors";
import { TaskItem } from "./taskfile.js";

type PipelineItem = {
  task: TaskItem;
  color: string;
  dependencies: PipelineItem[];
  dependents: PipelineItem[];
};

export const createPipeline = (
  tasks: TaskItem[],
  options: PipelineOptions
): Pipeline => {
  const colors = distinctColors
    .default({ count: tasks.length })
    .map((c) => c.hex());
  const items: PipelineItem[] = tasks.map((task, index) => ({
    task,
    color: colors[index],
    dependencies: [],
    dependents: [],
    state: { type: "PENDING" },
  }));
  for (const item of items) {
    item.dependencies = item.task.dependencies.map(
      (dependency) => items.find((item) => item.task === dependency)!
    );
    item.dependents = item.task.dependents.map(
      (dependent) => items.find((item) => item.task === dependent)!
    );
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
    item.task.onOutput.connect((line) => printTaskLine(item, line));
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
  console.log(`${chalk.hex(item.color).bold(item.task.id)}> ${text}`);
};

const getBuildableItems = (pipeline: Pipeline): PipelineItem[] => {
  return pipeline.items.filter(
    (item) =>
      item.task.state.type === "PENDING" &&
      !item.dependencies.find(
        (dependency) =>
          (dependency.task.kind === "task" &&
            dependency.task.state.type !== "COMPLETE") ||
          (dependency.task.kind === "service" &&
            dependency.task.state.type === "PENDING")
      )
  );
};

const markDirty = (item: PipelineItem, pipeline: Pipeline) => {
  item.task.state =
    item.task.state.type === "RUNNING"
      ? { ...item.task.state, dirty: true }
      : { type: "PENDING" };
  for (const dependent of item.dependents) {
    markDirty(dependent, pipeline);
  }
};

const markCompleted = (
  item: PipelineItem,
  success: boolean,
  pipeline: Pipeline
) => {
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
  item.task.state.type === "COMPLETE" && !item.task.state.success;

const isDone = (item: PipelineItem, pipeline: Pipeline) =>
  item.task.kind === "task"
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
