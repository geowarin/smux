export interface ErrorMeta {
  phase: "init" | "enter" | "cleanup";
  from?: string;
  to?: string;
  event?: string;
}

export class SmuxError extends Error {
  meta: ErrorMeta;
  constructor(message: string, meta: ErrorMeta, options?: ErrorOptions) {
    super(`${message} | ${JSON.stringify(meta)}`, options);
    this.meta = meta;
  }
}
