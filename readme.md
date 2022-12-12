# task-graph-protocol

A task graph runner and a protocol for task <-> runner communication that enables very efficient watch pipelines.

## taskfiles

Your tasks are declared in so-called "taskfiles". A taskfile can contain multiple tasks and you can also have as many taskfiles as you wish.
Tasks can depend on tasks from other taskfiles.

Example:

```json
// frontend/taskfile.json
{
  "build": {
    "command": "tsc",
    "dependencies": [{ "path": "../lib", "name": "build" }]
  }
}

// backend/taskfile.json
{
  "build": {
    "command": "tsc",
    "dependencies": [{ "path": "../lib", "name": "build" }]
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

## protocol

The main goal of this project is coordinating multiple watch processes. These are processes that don't exit after a build, but instead continue to rebuild as soon as file-changes are detected. The problem with such processes is that they cannot coordinate themselves with each other. So if both `lib` and `app` detect filechanges at the same time, both processes will immediately start re-building. This is a problem, because re-building `app` only makes sense _after_ `lib` is built successfully.

So what I came up with to solve this problem is a protocol for such processes to communicate with the task coordinator or task runner.
With this protocol, a watch process can notify the runner abount changes, and the runner can notify the process when it's time to re-start the task. Additionally, the task can tell the runner if it was successful or not.

For this all to work, watch-processes of course have to implement this protocol. But don't worry, this library provides some helpers to make this very easy.

## license

MIT
