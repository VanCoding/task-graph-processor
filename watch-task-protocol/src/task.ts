import { startClient } from "./client.js";

console.log("starting up...");
startClient(({ onChange, onFinish }) => {
  setInterval(onChange, 30000);
  let call = 0;
  return {
    execute: () => {
      console.log("building...");
      setTimeout(() => {
        if (call++ == 1) onChange();
        onFinish(true);
      }, parseFloat(process.argv[2]));
    },
  };
});
