export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const waitFor = async (f: (...args: any[]) => any, timeout = 5000) => {
  const start = new Date().getTime();
  while (!f() && new Date().getTime() - start < timeout) await sleep(100);
  if (!f()) throw new Error("condition not met within timeout");
};
