import { Signal } from "typed-signals";
import { TaskItem } from "./taskfile.js";

export const createPipeline = (
  tasks: TaskItem[],
  options: PipelineOptions
): Pipeline => {
  const pipeline: Pipeline = {
    tasks,
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
  tasks.forEach((task) => {
    task.onOutput.connect((line) => printTaskLine(task, line));
    if (task.kind === "task") {
      task.onChange.connect(() => {
        markDirty(task, pipeline);
        decideAction(pipeline);
      });
      task.onFinish.connect((success) => {
        markCompleted(task, success, pipeline);
      });
    }
  });

  return pipeline;
};

type PipelineOptions = {
  watch?: boolean;
};

type Pipeline = {
  tasks: TaskItem[];
  options: PipelineOptions;
  onFinish: Signal<(success: boolean) => void>;
  start: () => void;
};

const printTaskLine = (task: TaskItem, text: string) => {
  console.log(`${task.id}> ${text}`);
};

const getBuildableProjects = (pipeline: Pipeline): TaskItem[] => {
  return pipeline.tasks.filter(
    (task) =>
      task.state.type === "PENDING" &&
      !task.dependencies.find(
        (dependency) => dependency.state.type !== "COMPLETE"
      )
  );
};

const markDirty = (task: TaskItem, pipeline: Pipeline) => {
  task.state =
    task.state.type === "RUNNING"
      ? { ...task.state, dirty: true }
      : { type: "PENDING" };
  for (const dependent of task.dependents) {
    markDirty(dependent, pipeline);
  }
};

const markCompleted = (
  task: TaskItem,
  success: boolean,
  pipeline: Pipeline
) => {
  if (task.state.type === "RUNNING") {
    const time = new Date().getTime() - task.state.start.getTime();
    task.state = {
      type: "COMPLETE",
      success,
      time,
    };
    if (success) {
      printTaskLine(
        task,
        `${success ? "succeeded" : "failed"} after ${time}ms`
      );
    }
    decideAction(pipeline);
  }
};

const execute = (task: TaskItem, pipeline: Pipeline) => {
  printTaskLine(task, "starting...");
  if (task.kind === "task") {
    task.state = {
      type: "RUNNING",
      dirty: false,
      start: new Date(),
    };
    task.execute();
  } else if (task.kind === "service") {
    task.start();
    task.state = {
      type: "RUNNING",
      dirty: false,
      start: new Date(),
    };
    decideAction(pipeline);
  }
};

const isFailed = (task: TaskItem) =>
  task.state.type === "COMPLETE" && !task.state.success;

const isDone = (task: TaskItem, pipeline: Pipeline) =>
  task.kind === "task"
    ? task.state.type === "COMPLETE" && task.state.success
    : task.state.type === "RUNNING" || !pipeline.options.watch;

const decideAction = (pipeline: Pipeline) => {
  const failed = !!pipeline.tasks.find(isFailed);
  if (failed) {
    console.log("at least one task failed, waiting for changes...");
    pipeline.onFinish.emit(false);
    return;
  }
  const allComplete = !pipeline.tasks.find((t) => !isDone(t, pipeline));
  if (allComplete) {
    console.log("all tasks completed, waiting for changes...");
    pipeline.onFinish.emit(true);
    return;
  }
  const buildableProjects = getBuildableProjects(pipeline);
  for (const project of buildableProjects) {
    execute(project, pipeline);
  }
};
