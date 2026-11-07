// "Notifications were just allowed": the popup tells PushRegistration, which
// then registers this phone for push straight away.
const listeners = new Set<() => void>();

export function onPushAllowed(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function pushAllowed() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}
