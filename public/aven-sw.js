self.addEventListener("push", (event) => {
  let value;
  try {
    value = event.data.json();
  } catch {
    return;
  }
  if (!value || typeof value.id !== "string" || typeof value.title !== "string")
    return;
  event.waitUntil(
    self.registration.showNotification(value.title, {
      body: value.body,
      tag: `aven-${value.id}`,
      renotify: false,
      data: { url: `/aven?notification=${encodeURIComponent(value.id)}` },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || "/aven",
    self.location.origin,
  );
  if (url.origin !== self.location.origin) return;
  event.waitUntil(clients.openWindow(url.href));
});
