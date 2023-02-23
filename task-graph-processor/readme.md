# task-graph-processor

A reference task-runner for the [watch-task-protocol](../watch-task-protocol/readme.md) including reference implementations for popular build tools like `TypeScript`.

## taskfiles

Your tasks are declared in so-called "taskfiles". A taskfile can contain multiple tasks and you can also have as many taskfiles as you wish.
Tasks can depend on tasks from other taskfiles.

Example:

```js
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

## watch mode

The whole point of this project is correctly supporting & orchestrating the watch mode of build tools. If all your build tools support the [watch-task-protocol](../watch-task-protocol/readme.md) you can just run `tgp taskname --watch` and it will automatically re-run your task-graph correctly.

If you have tools that don't support the [watch-task-protocol](../watch-task-protocol/readme.md) you have the following options:

### let the task runner watch files

Instead of starting your build tool in watch-mode, you can tell the task-runner which files to watch, and to restart the task when changes are detected. For this, just specify your glob patterns in an array to the `watch` property of the task.

An example taskfile could then look like this:

```js
{
  "build": {
    "command": "tsc",
    "watch": ["src/**/*.ts"]
  }
}
```

### create a wrapper

If the tool also has a library-interface, we may be able to build a wrapper around it that does support the protocol. Until we get a broad adoption of the protocol, we welcome such wrappers in this repository. You can find them in the [build-tools](../build-tools/) directory. Currently the following build tools are supported:

- TypeScript

### request support for a restart-trigger

You might be able to convince the authors of the build-tool to give us some way to tell it to only re-run a task if it gets a message from the outside of the process (for example a STDIN-input or a http-request). Detecting a finished or failed task can usually be achieved by parsing the STDOUT of the process and usually does not require a change.

If the tool finally supports the features we need, although not in a protocol-conformant way, we can tell the `task-graph-processor` how to handle it. This can be done through the following task properties:

#### **triggerStart**:

An object of the following stucture:

```js
{ "stdin": "START_MESSAGE"}
```

where `START_MESSAGE` is the text that should be written to STDIN of the process to trigger the restart. In the future, we might support different channels than STDIN, like for example HTTP.

When not specified, it defaults to the [watch-task-protocol](../watch-task-protocol/readme.md):

```js
{ "stdin": "WATCH_TASK_PROTOCOL:START" }
```

#### **detectEnd**:

An object of the following structure:

```js
{ "stdout": {
  "success": "SUCCESS_MESSAGE",
  "failure": "FAILURE_MESSAGE"
}}
```

In this configuration, the task is considered successful as soon as `SUCCESS_MESSAGE` is received via STDOUT and it is considered as failed when `FAILURE_MESSAGE` is received. In the future, we might support different channels than STDOUT.

When not specified, it defaults to the [watch-task-protocol](../watch-task-protocol/readme.md):

```js
{ "stdout": {
  "success": "WATCH_TASK_PROTOCOL:SUCCEEDED",
  "failure": "WATCH_TASK_PROTOCOL:FAILED"
}}
```

#### **detectChanges**:

An object of the following structure:

```js
{ "stdout": "CHANGE_MESSAGE" }
```

In this configuration, the the task runner will schedula a re-run as soon as `CHANGE_MESSAGE` is received via STDOUT. In the future, we might support different channels than STDOUT.

When not specified, it defaults to the [watch-task-protocol](../watch-task-protocol/readme.md):

```js
{ "stdout": "WATCH_TASK_PROTOCOL:DETECTED_CHANGES" }
```
