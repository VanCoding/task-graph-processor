import split from "split2";
import { startProcess } from "./start-process.js";
import { BaseTask, TaskItem, TaskDeclaration } from "./taskfile.js";

export const makeService = ({
  base,
  declaration,
  directory,
}: {
  base: BaseTask;
  declaration: TaskDeclaration;
  directory: string;
}): TaskItem => ({
  ...base,
  kind: "service",
  start: () => {
    const process = startProcess({
      env: {},
      command: declaration.command!,
      directory,
    });
    const lines = split();
    lines.on("data", base.onOutput.emit);
    process.stdout.pipe(lines);
    process.stderr.pipe(lines);
    process.on("exit", (code) => {
      base.onOutput.emit(`exited with code ${code}`);
    });
  },
});
