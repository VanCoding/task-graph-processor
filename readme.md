# task-graph-protocol

A task graph runner and a protocol for task <-> runner communication that enables very efficient watch pipelines.

## protocol

The main goal of this project is coordinating multiple watch processes. These are processes that don't exit after a build, but instead continue to rebuild as soon as file-changes are detected. The problem with such processes is that they cannot coordinate themselves with each other. So if both `lib` and `app` detect filechanges at the same time, both processes will immediately start re-building. This is a problem, because re-building `app` only makes sense _after_ `lib` is built successfully.

So what I came up with to solve this problem is a protocol for such processes to communicate with the task coordinator or task runner.
With this protocol, a watch process can notify the runner about changes, and the runner can notify the process when it's time to re-start the task. Additionally, the task can tell the runner if it was successful or not.

The cool thing is that processes not implementing the protocol are still fully compatible with the protocol. Not implementing the protocol means that a process exits after the task is complete and that it's restarted to run the task again. If a process wants to stay alive and still tell the task runner that its job is completed, it can make use of the `task-graph-protocol`.

The protocol is very simple:

1. When the process starts, immediately runs the task
1. After the task is successful, write `WATCH_TASK_PROTOCOL:SUCCEEDED` to STDOUT, or if the task failed write `WATCH_TASK_PROTOCOL:FAILED`
1. Do not restart the task until you receive `WATCH_TASK_PROTOCOL:START` on STDIN, then immediately restart it and continue to 2.
1. A process can exit at any point, this also means the task is completed and the process shall be restarted the next time the task needs to run.
1. Sometimes a watch process knows best, when it's time to re-run the task because it knows its task the best after all. In this case, it can at any point write `WATCH_TASK_PROTOCOL:DETECTED_CHANGES` to STDOUT. This tells the task runner that it wants to re-run. But remember, it's the task runners job to actually trigger the re-run. So don't restart the task until you receive the `WATCH_TASK_PROTOCOL:START` message.

## taskfiles

Your tasks are declared in so-called "taskfiles". A taskfile can contain multiple tasks and you can also have as many taskfiles as you wish.
Tasks can depend on tasks from other taskfiles.

Example:

```json
// frontend/taskfile.json
{
  "build": {
    "command": "tsc",
    "dependencies": ["../lib:build"]
  }
}

// backend/taskfile.json
{
  "build": {
    "command": "tsc",
    "dependencies": ["../lib:build"]
  }
}

// lib/taskfile.json
{
  "build": {
    "command": "tsc"
  }
}
```

Running `tgp build:frontend build:backend` will then first build the project `lib` and then the projects `frontend` and `backend` in parallel.
If the task `build` of `lib` fails, then it won't attempt building `frontend` or `backend`.

## license

MIT
