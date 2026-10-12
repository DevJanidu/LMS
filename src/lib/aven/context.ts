/** Keep recent messages within a byte budget without splitting UTF-8 characters. */
export function boundedHistory<
  T extends { role: string; content: string; status?: string },
>(messages: T[], maxBytes: number) {
  const kept: { role: string; content: string }[] = [];
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (
      message.status === "error" ||
      message.status === "cancelled" ||
      message.status === "superseded"
    )
      continue;
    const item = {
      role: message.role,
      content: Array.from(message.content).slice(0, 6000).join(""),
    };
    if (Buffer.byteLength(JSON.stringify([item, ...kept])) > maxBytes) {
      if (kept.length) break;
      let content = item.content;
      while (
        content &&
        Buffer.byteLength(JSON.stringify([{ ...item, content }])) > maxBytes
      )
        content = Array.from(content).slice(0, -128).join("");
      if (content) kept.unshift({ ...item, content });
      break;
    }
    kept.unshift(item);
  }
  return kept;
}
/** Context size without replayed encrypted reasoning, which is bounded by the output-token budget instead. */
export const contextBytes = (value: unknown) =>
  Buffer.byteLength(
    JSON.stringify(value, (key, item) =>
      key === "encrypted_content" ? undefined : item,
    ) ?? "",
  );
