import { watch } from "chokidar";
import { Signal } from "typed-signals";
import { makeGenericWorkerFactory } from "watch-task-protocol/server.js";
import { startProcess } from "./start-process.js";
import { BaseTask, TaskItem, TaskDeclaration } from "./taskfile.js";

export const makeTask = ({
  directory,
  declaration,
  base,
}: {
  declaration: TaskDeclaration;
  directory: string;
  base: BaseTask;
}): TaskItem => {
  const workerFactory = makeGenericWorkerFactory({
    startProcess: (env) =>
      startProcess({ env, command: declaration.command!, directory }),
    detectChanges: declaration.detectChanges,
    detectEnd: declaration.detectEnd,
    triggerStart: declaration.triggerStart,
  });

  const onChange = new Signal<() => void>();
  const onFinish = new Signal<(success: boolean) => void>();
  const onOutput = new Signal<(line: string) => void>();

  const { execute } = workerFactory({
    onOutput: (line) => onOutput.emit(line),
    onChange: () => onChange.emit(),
    onComplete: (success) => onFinish.emit(success),
  });
  return {
    ...base,
    kind: "task",
    execute,
    watch: () => {
      if (declaration.watch) {
        watch(declaration.watch, { cwd: directory }).on("all", () =>
          onChange.emit()
        );
      }
    },
    onChange,
    onFinish,
    onOutput,
    state: { type: "PENDING" },
  };
};
