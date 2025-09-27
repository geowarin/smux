export interface ErrorMeta {
  phase: "init" | "enter" | "cleanup";
  from?: string;
  to?: string;
  event?: string;
}

export class SmuxError extends Error {
  meta: ErrorMeta;
  constructor(meta: ErrorMeta, options?: ErrorOptions) {
    super(getErrorMessage(meta), options);
    this.meta = meta;
  }
}

function getErrorMessage(meta: ErrorMeta): string {
  switch (meta.phase) {
    case "enter": {
      const to = meta.to ?? "<unknown>";
      return (
        `State enter effect threw. The run() of state "${to}" raised an error. ` +
        `Tip: to handle this inside the machine, define an "ERROR" transition for state "${to}" (e.g. states["${to}"].on.ERROR = "<recover>") so the machine can move to a safe state and receive the original error as payload. ` +
        `Original error is available as err.cause. | ${JSON.stringify(meta)}`
      );
    }
    case "cleanup": {
      const from = meta.from ?? "<unknown>";
      const to = meta.to ?? "<unknown>";
      return (
        `State cleanup function threw. The transition from "${from}" to "${to}" was aborted and the previous state is kept. ` +
        `Make cleanup functions safe: ensure idempotency, check for null/undefined, and wrap teardown in try/catch to avoid throwing. ` +
        `Original error is available as err.cause. | ${JSON.stringify(meta)}`
      );
    }
    case "init": {
      const st = meta.from ?? meta.to ?? "<initial>";
      return (
        `Initial state's run() threw during machine setup (state "${st}"). ` +
        `You can remediate by defining an "ERROR" transition on the initial state to route to a safe state, or by catching inside run() and calling send("ERROR", err). ` +
        `Original error is available as err.cause. | ${JSON.stringify(meta)}`
      );
    }
  }
}
