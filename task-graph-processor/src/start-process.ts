import { spawn } from "child_process";
import { npmRunPathEnv } from "npm-run-path";

export const startProcess = ({
  env,
  command,
  directory,
}: {
  env: Record<string, string>;
  command: string;
  directory: string;
}) => {
  return spawn(command, {
    env: {
      FORCE_COLOR: "true",
      ...npmRunPathEnv({ cwd: directory }),
      ...env,
    },
    cwd: directory,
    shell: true,
  });
};
