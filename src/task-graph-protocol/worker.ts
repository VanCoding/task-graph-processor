import cp from "child_process";
import { WorkerFactory } from "../taskfile.js";
import { Event } from "./index.js";
import split from "split2";

export const makeTGPWorkerFactory = ({
  directory,
  command,
}: {
  directory: string;
  command: string;
}): WorkerFactory => {
  return ({ onChange: requestExecution, onOutput: sendOutput, onComplete }) => {
    let process: Process | null = null;
    return {
      execute: () => {
        if (!process) {
          process = makeProcess({
            onExit: (code: number) => {
              process = null;
              onComplete(code === 0);
            },
            onEvent: (e) => {
              if (e.type == "CHANGE") {
                requestExecution();
              } else if (e.type === "END") {
                onComplete(e.success);
              }
            },
            onOutput: sendOutput,
            command,
            directory,
          });
        } else {
          process.send({ type: "START" });
        }
      },
    };
  };
};

const makeProcess = ({
  command,
  directory,
  onExit,
  onEvent,
  onOutput,
}: {
  command: string;
  directory: string;
  onExit: (code: number) => void;
  onEvent: (event: Event) => void;
  onOutput: (line: string) => void;
}) => {
  const process = cp.spawn("sh", ["-c", command], {
    cwd: directory,
  });
  process.on("exit", onExit);
  const lineStream = process.stdout.pipe(split());
  lineStream.on("data", (line) => {
    const event = tryParseEvent(line);
    if (event) {
      onEvent(event);
    } else {
      onOutput(line);
    }
  });

  return {
    send: (event: Event) => {
      process.stdin.write(JSON.stringify(event) + "\r\n");
    },
  };
};

type Process = ReturnType<typeof makeProcess>;

const tryParseEvent = (line: string): Event | null => {
  try {
    return JSON.parse(line);
  } catch {}
  return null;
};
