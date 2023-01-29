import split from "split2";

export const startClient = (
  handler: (input: {
    onChange: () => void;
    onFinish: (success: boolean) => void;
  }) => {
    execute: () => void;
  },
  {
    startMessage = process.env.WATCH_TASK_PROTOCOL_START_MESSAGE ??
      "WATCH_TASK_PROTOCOL:START",
    successMessage = process.env.WATCH_TASK_PROTOCOL_SUCCESS_MESSAGE ??
      "WATCH_TASK_PROTOCOL:SUCCEEDED",
    failureMessage = process.env.WATCH_TASK_PROTOCOL_FAILURE_MESSAGE ??
      "WATCH_TASK_PROTOCOL:FAILED",
    changeMessage = process.env.WATCH_TASK_PROTOCOL_CHANGE_MESSAGE ??
      "WATCH_TASK_PROTOCOL:DETECTED_CHANGES",
  }: {
    startMessage?: string;
    successMessage?: string;
    failureMessage?: string;
    changeMessage?: string;
  } = {}
) => {
  const worker = handler({
    onChange: () => {
      send(changeMessage);
    },
    onFinish: (success: boolean) => {
      send(success ? successMessage : failureMessage);
    },
  });

  const send = (message: string) => {
    process.stdout.write(message + "\r\n");
  };

  process.stdin.pipe(split()).on("data", (line) => {
    if (line === startMessage) {
      worker.execute();
    }
  });
  worker.execute();
};
