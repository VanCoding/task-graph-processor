import { Event } from "./index.js";
import split from "split2";

export const startClient = (
  handler: (input: {
    onChange: () => void;
    onFinish: (success: boolean) => void;
  }) => {
    execute: () => void;
  }
) => {
  const worker = handler({
    onChange: () => {
      send({ type: "CHANGE" });
    },
    onFinish: (success: boolean) => {
      send({ type: "END", success });
    },
  });

  const send = (event: Event) => {
    process.stdout.write(JSON.stringify(event) + "\r\n");
  };

  process.stdin.pipe(split()).on("data", () => {
    worker.execute();
  });
  worker.execute();
};
