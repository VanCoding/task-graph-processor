import { Event } from "./index.js";
import split from "split2";

export const startClient = (
  handler: (input: { triggerChange: () => void }) => {
    execute: () => Promise<boolean>;
  }
) => {
  const worker = handler({
    triggerChange: () => {
      send({ type: "CHANGE" });
    },
  });

  const send = (event: Event) => {
    process.stdout.write(JSON.stringify(event) + "\r\n");
  };

  process.stdin.pipe(split()).on("data", () => {
    worker.execute().then((success) => {
      send({ type: "END", success });
    });
  });
};
