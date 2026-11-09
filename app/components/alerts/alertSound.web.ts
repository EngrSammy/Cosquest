// WEBSITE: no notification channels; a short beep when an alert arrives.
export async function ensureAlertChannel() {}

export function playAlert(_title: string, _body: string, _alertId: string) {
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    [0, 0.35, 0.7].forEach((start) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + start);
      oscillator.stop(context.currentTime + start + 0.2);
    });
  } catch {}
}
