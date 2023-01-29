import cp from "child_process";
import { WorkerFactory } from "./taskfile.js";
import split from "split2";
import { npmRunPathEnv } from "npm-run-path";

export const makeGenericWorkerFactory = ({
  directory,
  command,
  triggerStart = { stdin: "WATCH_TASK_PROTOCOL:START" },
  detectEnd = {
    stdout: {
      success: "WATCH_TASK_PROTOCOL:SUCCEEDED",
      failure: "WATCH_TASK_PROTOCOL:FAILED",
    },
  },
  detectChanges = {
    stdout: "WATCH_TASK_PROTOCOL:DETECTED_CHANGES",
  },
}: {
  directory: string;
  command: string;
  triggerStart?: { stdin: string };
  detectEnd?: { stdout: { success: string; failure: string } };
  detectChanges?: { stdout: string };
}): WorkerFactory => {
  return ({ onChange: requestExecution, onOutput: sendOutput, onComplete }) => {
    let process: Process | null = null;
    return {
      execute: () => {
        if (!process) {
          process = makeProcess({
            onLine: (line) => {
              if (line === detectEnd.stdout.failure) {
                onComplete(false);
              } else if (line === detectEnd.stdout.success) {
                onComplete(true);
              } else if (line === detectChanges.stdout) {
                requestExecution();
              } else {
                sendOutput(line);
              }
            },
            onExit: (code: number) => {
              process = null;
              onComplete(code === 0);
            },
            command,
            directory,
            env: {
              ...npmRunPathEnv({ cwd: directory }),
              WATCH_TASK_PROTOCOL_START_MESSAGE: triggerStart.stdin,
              WATCH_TASK_PROTOCOL_SUCCESS_MESSAGE: detectEnd.stdout.success,
              WATCH_TASK_PROTOCOL_FAILURE_MESSAGE: detectEnd.stdout.failure,
              WATCH_TASK_PROTOCOL_CHANGE_MESSAGE: detectChanges.stdout,
            },
          });
        } else {
          process.send(triggerStart.stdin);
        }
      },
    };
  };
};

const makeProcess = ({
  command,
  directory,
  onExit,
  onLine,
  env,
}: {
  command: string;
  directory: string;
  onExit: (code: number) => void;
  onLine: (line: string) => void;
  env: Record<string, string | undefined>;
}) => {
  const process = cp.spawn("sh", ["-c", command], {
    cwd: directory,
    env,
  });
  process.on("exit", onExit);
  const lineStream = process.stdout.pipe(split());
  lineStream.on("data", onLine);

  return {
    send: (line: string) => {
      process.stdin.write(line + "\r\n");
    },
  };
};

type Process = ReturnType<typeof makeProcess>;
