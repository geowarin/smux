export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

export function isPromiseLike(value: unknown): value is Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const then = (value as any)?.then;
  return typeof then === "function";
}
