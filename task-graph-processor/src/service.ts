import split from "split2";
import { Signal } from "typed-signals";
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
}): TaskItem => {
  const onOutput = new Signal<(line: string) => void>();
  return {
    ...base,
    kind: "service",
    start: () => {
      const process = startProcess({
        env: {},
        command: declaration.command!,
        directory,
      });
      const lines = split();
      lines.on("data", onOutput.emit);
      process.stdout.pipe(lines);
      process.stderr.pipe(lines);
      process.on("exit", (code) => {
        onOutput.emit(`exited with code ${code}`);
      });
    },
    onOutput,
    state: { type: "PENDING" },
  };
};
