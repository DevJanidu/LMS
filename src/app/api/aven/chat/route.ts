import {
  learnerAccount,
  validatedBody,
  featureFailure,
} from "@/lib/goals/http";
import { chatSchema } from "@/lib/aven/validation";
import { prepareChat, streamChat } from "@/lib/aven/chat";
export const runtime = "nodejs",
  maxDuration = 120;
export async function POST(request: Request) {
  try {
    const user = await learnerAccount(),
      input = await validatedBody(request, chatSchema),
      prepared = await prepareChat(user.id, input),
      abort = new AbortController();
    const signal = AbortSignal.any([
        request.signal,
        abort.signal,
        AbortSignal.timeout(110000),
      ]),
      encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: Record<string, unknown>) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          } catch {}
        };
        void streamChat(user.id, input, prepared, emit, signal)
          .catch(() => {
            emit({ type: "error", code: "conversationUnavailable" });
          })
          .finally(() => {
            try {
              controller.close();
            } catch {}
          });
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(body, {
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
