import { after } from "next/server";
import {
  learnerAccount,
  validatedBody,
  featureFailure,
} from "@/lib/goals/http";
import { chatSchema } from "@/lib/aven/validation";
import { prepareChat, streamChat } from "@/lib/aven/chat";
import { createEventRelay } from "@/lib/aven/stream-relay";
import { createLatencyTimer } from "@/lib/aven/latency";
export const runtime = "nodejs",
  maxDuration = 120;
/** Hard ceiling for one generation, below maxDuration so the turn can still be saved. */
const GENERATION_TIMEOUT_MS = 110000;
/**
 * The generation runs independently of this HTTP response. If the viewer leaves (tab
 * switch on mobile, navigation, refresh, network loss) the stream only detaches; the
 * turn keeps running, saves recovery snapshots and its final reply, and `after()` keeps
 * the invocation alive until it settles. Only an explicit stop or the timeout ends it.
 */
export async function POST(request: Request) {
  const timer = createLatencyTimer();
  try {
    const user = await timer.time("auth", () => learnerAccount()),
      input = await timer.time("validate", () => validatedBody(request, chatSchema)),
      prepared = await prepareChat(user.id, input, timer);
    const relay = createEventRelay();
    timer.mark("responseReturned");
    const generation = streamChat(
      user.id,
      input,
      prepared,
      relay.emit,
      AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    )
      .catch(() => relay.emit({ type: "error", code: "conversationUnavailable" }))
      .finally(relay.close);
    after(() => generation);
    return new Response(relay.stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return featureFailure(error);
  }
}
