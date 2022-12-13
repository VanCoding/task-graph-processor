const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const waitFor = async (f: (...args: any[]) => any) => {
  while (!f()) await sleep(1000);
  return f();
};
