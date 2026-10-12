/** Screen common completed-action claims while every change is still an unapproved proposal. */
export function claimsUnapprovedChange(text: string) {
  const candidate = text.replace(
    /\b(?:I|we|I have|we have)\s+created\s+(?:a|the|your|these)\s+(?:pending\s+|reviewable\s+)?(?:proposal|draft)s?\b/giu,
    "proposal prepared",
  );
  return /\b(?:I|we|I've|we've|I have|we have)\s+(?:successfully\s+)?(?:created|saved|updated|moved|cancelled|canceled|completed|rescheduled|changed|added|scheduled)\b|\b(?:goal|session|schedule|task|reminder)s?\s+(?:has|have)\s+been\s+(?:created|saved|updated|moved|cancelled|completed|rescheduled)\b/iu.test(
    candidate,
  );
}
