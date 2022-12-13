#!/usr/bin/env node
import { startClient } from "../task-graph-protocol/client.js";
import ts from "typescript";
import { resolve } from "path";

startClient(({ onChange, onFinish }) => {
  console.log("starting up...");
  const tsconfigPath = ts.findConfigFile(
    "./",
    ts.sys.fileExists,
    "tsconfig.json"
  );

  const host = ts.createWatchCompilerHost(tsconfigPath!, undefined, ts.sys);
  let timeout: NodeJS.Timeout | undefined = undefined;
  host.setTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      onChange();
    }, 10);
  };
  host.afterProgramCreate = () => {};
  host.onWatchStatusChange = undefined;

  const program = ts.createWatchProgram(host);

  return {
    execute: () => {
      const p = program.getProgram();
      let diagnostics = p.getSyntacticDiagnostics();
      if (!diagnostics.length) {
        diagnostics = p.getSemanticDiagnostics();
      }
      if (diagnostics.length > 0) {
        console.log(
          ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCurrentDirectory: () => resolve("./"),
            getNewLine: () => "\r\n",
            getCanonicalFileName: (fileName) => fileName.toLocaleLowerCase(),
          })
        );
        onFinish(false);
      } else {
        p.emit();
        onFinish(true);
      }
    },
  };
});
