export const PIN_OPTIONS = [
  { label: '24 hours', value: '24h' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
];

// Render these three choices in a modal/bottom sheet and call api.pin(...).
// An open chat must hide its banner when expiresAt is reached, and refresh
// conversation detail on focus/polling to pick up pins from other members.
export function pinIsActive(pin, now = Date.now()) {
  return Boolean(pin && new Date(pin.expiresAt).getTime() > now);
}
