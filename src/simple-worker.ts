import cp, { ChildProcess } from "child_process";
import { WorkerFactory } from "./taskfile.js";
import split from "split2";

export const makeSimpleWorkerFactory = ({
  directory,
  command,
}: {
  directory: string;
  command: string;
}): WorkerFactory => {
  return ({ onOutput: onOutput, onComplete }) => {
    let process: ChildProcess | undefined;
    return {
      execute: () => {
        if (process) {
          process.kill();
        }
        process = cp.spawn("sh", ["-c", command], { cwd: directory });
        process.stdout?.pipe(split()).on("data", onOutput);
        process.stderr?.pipe(split()).on("data", onOutput);
        process.on("exit", (exitCode) => {
          onComplete(exitCode === 0);
        });
        process.on("error", (err) => {
          onOutput(err.message + err.stack);
          onComplete(false);
        });
      },
    };
  };
};
