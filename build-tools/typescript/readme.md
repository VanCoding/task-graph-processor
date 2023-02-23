# tsc-watch

This an very limited implementation of a `tsc` command that supports the `watch-task-protocol`.

## installation

Add it to each of your packages in your monorepo that you want to compile using `npm install watch-task-protocol-typescript`. Please note that `typescript` is a peer dependency, so install it as well.

## usage

If you're using `task-graph-processor`, add a `build`-task to your Taskfile like this:

```
{
  "build": {
    "command": "tsc-watch"
  }
}
```

Then run it with `tgp build` or `tgp build --watch`
