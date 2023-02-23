# task-graph-processor

This is a monorepo consisting of

- The [watch-task-protocol](./watch-task-protocol/readme.md)
- The [task-graph-processor](./watch-task-protocol/readme.md) built around the watch-task-protocol
- [Build-Tool Wrappers](./build-tools/) that bring watch-task-protocol support to the respective build tools

## demo time

Run `tgp test clean build` to clean, build and test the whole repo in one go. The correct order for running the tasks will be figured out, and tasks will be run in parallel if possible. Add `--watch` if you want to do so continuously.

## license

MIT
