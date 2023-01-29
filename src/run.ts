import { Signal } from "typed-signals";
import { Task } from "./taskfile.js";

export const createPipeline = (tasks: Task[]): Pipeline => {
  const pipeline: Pipeline = {
    tasks,
    taskStates: new Map(),
    onFinish: new Signal(),
    start: () => decideAction(pipeline),
  };
  tasks.forEach((task) => {
    pipeline.taskStates.set(task, { type: "PENDING" });
    task.onChange.connect(() => {
      markDirty(task, pipeline);
      decideAction(pipeline);
    });
    task.onOutput.connect((line) => printTaskLine(task, line));
    task.onFinish.connect((success) => {
      markCompleted(task, success, pipeline);
    });
  });

  return pipeline;
};

type Pipeline = {
  tasks: Task[];
  taskStates: Map<Task, TaskState>;
  onFinish: Signal<(success: boolean) => void>;
  start: () => void;
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

const printTaskLine = (task: Task, text: string) => {
  console.log(`${task.id}> ${text}`);
};

const getBuildableProjects = (pipeline: Pipeline): Task[] => {
  return pipeline.tasks.filter(
    (task) =>
      pipeline.taskStates.get(task)?.type === "PENDING" &&
      !task.dependencies.find(
        (dependency) => pipeline.taskStates.get(dependency)?.type !== "COMPLETE"
      )
  );
};

const markDirty = (task: Task, pipeline: Pipeline) => {
  const currentState = pipeline.taskStates.get(task)!;
  pipeline.taskStates.set(
    task,
    currentState.type === "RUNNING"
      ? { ...currentState, dirty: true }
      : { type: "PENDING" }
  );
  for (const dependent of task.dependents) {
    markDirty(dependent, pipeline);
  }
};

const markCompleted = (task: Task, success: boolean, pipeline: Pipeline) => {
  const current = pipeline.taskStates.get(task)!;
  if (current.type === "RUNNING") {
    const time = new Date().getTime() - current.start.getTime();
    pipeline.taskStates.set(task, {
      type: "COMPLETE",
      success,
      time,
    });
    if (success) {
      printTaskLine(
        task,
        `${success ? "succeeded" : "failed"} after ${time}ms`
      );
    }
    decideAction(pipeline);
  }
};

const execute = (task: Task, pipeline: Pipeline) => {
  printTaskLine(task, "starting...");
  pipeline.taskStates.set(task, {
    type: "RUNNING",
    dirty: false,
    start: new Date(),
  });
  task.execute();
};

const decideAction = (pipeline: Pipeline) => {
  const taskStates = Array.from(pipeline.taskStates.values());
  const failed = !!taskStates.find((t) => t.type === "COMPLETE" && !t.success);
  if (failed) {
    console.log("at least one task failed, waiting for changes...");
    pipeline.onFinish.emit(false);
    return;
  }
  const allComplete = !taskStates.find((t) => t.type !== "COMPLETE");
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
