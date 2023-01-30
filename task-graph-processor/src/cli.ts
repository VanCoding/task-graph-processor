#!/usr/bin/env node
import { run, command, flag, restPositionals } from "cmd-ts";
import { createPipeline } from "./run.js";
import { readTasks } from "./taskfile.js";

const cmd = command({
  name: "run",
  args: {
    tasks: restPositionals({
      displayName: "tasks",
      description:
        "[task1Name]:[taskfile1Path] [task2Name]:[taskfile2Path] ... [taskNName]:[taskfileNPath]",
    }),
    watch: flag({ long: "watch", short: "w" }),
  },
  handler: ({ watch, tasks: taskPaths }) => {
    const tasks = readTasks(taskPaths);
    const pipeline = createPipeline(tasks);
    if (!watch) {
      pipeline.onFinish.connect((success) => {
        process.exit(success ? 0 : 1);
      });
    }
    pipeline.start({ watch });
  },
});

run(cmd, process.argv.slice(2));
