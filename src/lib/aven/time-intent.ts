/** A narrow guard for explicitly ambiguous clock requests; the model supplies the clarification. */
export function ambiguousScheduleClock(
  message: string,
  sessionReply = false,
): string | null {
  const text = message.replace(/[٠-٩۰-۹]/g, (digit) =>
    String(
      "٠١٢٣٤٥٦٧٨٩".includes(digit)
        ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit)
        : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit),
    ),
  );
  if (
    !sessionReply &&
    !/(move|reschedul|shift|schedule|verleg|verschieb|reprogram|mover|نقل|تغيير|جدول)/iu.test(
      text,
    )
  )
    return null;
  if (
    /\b\d{1,2}(?::[0-5]\d)?\s*[ap]\.?m\.?\b|\b(morning|evening|afternoon|tonight|morgens|abends|por la mañana|por la tarde|por la noche)\b|صباح|مساء/iu.test(
      text,
    )
  )
    return null;
  const match =
    /\b(\d{1,2}:[0-5]\d)\b/u.exec(text) ??
    /\b(?:at|to|um|a las)\s+(\d{1,2})\b|الساعة\s+(\d{1,2})/iu.exec(text);
  const clock = match?.[1] ?? match?.[2];
  return clock &&
    Number(clock.split(":")[0]) >= 1 &&
    Number(clock.split(":")[0]) <= 12
    ? clock
    : null;
}
