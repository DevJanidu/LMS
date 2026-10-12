"use client";
import { featureRequest } from "@/lib/goals/client";
/**
 * Ask this browser for notification permission and register its push subscription.
 * Throws `pushUnavailable` or `pushPermissionDenied`; returns the final permission.
 */
export async function subscribeToPush(publicKey: string) {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !publicKey
  )
    throw new Error("pushUnavailable");
  const granted = await Notification.requestPermission();
  if (granted !== "granted") throw new Error("pushPermissionDenied");
  const registration = await navigator.serviceWorker.register("/aven-sw.js");
  const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
    key = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  await featureRequest("/api/aven/push", {
    kind: "subscribe",
    subscription: subscription.toJSON(),
  });
  return granted;
}
