import {
  HEARTBEAT_MS,
  STREAM_PROTOCOL_VERSION,
  type StreamEventBody,
} from "./stream-protocol";
/**
 * Server-sent events for one generation. Every event gets a sequence number so a client
 * can drop duplicates and order recovery snapshots. A heartbeat keeps proxies from
 * buffering and lets the browser detect a dead connection. Cancelling the stream (the
 * viewer left, refreshed or lost the network) only detaches it: emitting continues as a
 * no-op and never stops the generation, which is ended only by an explicit stop or timeout.
 */
export function createEventRelay(heartbeatMs = HEARTBEAT_MS) {
  const encoder = new TextEncoder();
  let sequence = 0,
    controller: ReadableStreamDefaultController<Uint8Array> | null = null,
    closed = false,
    timer: ReturnType<typeof setInterval> | undefined;
  const write = (event: Record<string, unknown>) => {
    if (!controller || closed) return;
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      controller = null;
    }
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      timer = setInterval(
        () => write({ type: "heartbeat", seq: ++sequence, v: STREAM_PROTOCOL_VERSION }),
        heartbeatMs,
      );
    },
    cancel() {
      controller = null;
      stop();
    },
  });
  return {
    stream,
    /** Returns the event's sequence number, also when nobody is listening any more. */
    emit(event: StreamEventBody) {
      const seq = ++sequence;
      write({ ...event, seq, v: STREAM_PROTOCOL_VERSION });
      return seq;
    },
    close() {
      if (closed) return;
      closed = true;
      stop();
      try {
        controller?.close();
      } catch {}
      controller = null;
    },
    get sequence() {
      return sequence;
    },
    get attached() {
      return Boolean(controller) && !closed;
    },
  };
}
export type EventRelay = ReturnType<typeof createEventRelay>;
