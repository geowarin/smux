# Strong events with payload types (event–payload map)

Introduce an `Events` map for payload typing:

```ts
interface Events {
    SUCCESS: string;   // resolved payload
    ERROR: Error;      // rejected payload (or unknown)
    RESTART: undefined;
}
```

Then make the machine generic over that map:

- `TEvents extends Record<string, unknown>`
- `TEvent = keyof TEvents & string`
- `send: <K extends TEvent>(event: K, payload: TEvents[K]) => void`
- `RunContext<TEvents>['payload']` becomes the payload of the event that led to this state. Precisely typing that
  per-state requires deriving “incoming events for state S.” If that’s too involved, you can keep `payload` as
  `TEvents[keyof TEvents]` and let users narrow by checking the previous event name (which is already available in RunMeta).
