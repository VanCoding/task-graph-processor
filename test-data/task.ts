import { startClient } from "../src/task-graph-protocol/client.js";

console.log("starting up...");
startClient(({ triggerChange }) => {
  setInterval(triggerChange, 30000);
  let call = 0;
  return {
    execute: async () => {
      console.log("building...");
      await new Promise((r) => setTimeout(r, parseFloat(process.argv[2])));
      if (call++ == 1) triggerChange();
      return true;
    },
  };
});
