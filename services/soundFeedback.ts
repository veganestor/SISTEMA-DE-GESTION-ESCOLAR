let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playToneSequence(notes: { freq: number; durationMs: number; delayMs: number; type?: OscillatorType }[]): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  for (const n of notes) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type || 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.delayMs / 1000);
      gain.gain.setValueAtTime(0.0001, now + n.delayMs / 1000);
      gain.gain.exponentialRampToValueAtTime(0.16, now + n.delayMs / 1000 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (n.delayMs + n.durationMs) / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.delayMs / 1000);
      osc.stop(now + (n.delayMs + n.durationMs) / 1000 + 0.02);
    } catch {
      // Audio playback blocked by browser autoplay policy or unavailable
    }
  }
}

export function playAttendanceSound(kind: 'presente' | 'tarde' | 'salida' | 'error'): void {
  if (kind === 'presente') {
    playToneSequence([
      { freq: 880, durationMs: 90, delayMs: 0, type: 'triangle' },
      { freq: 1174.66, durationMs: 140, delayMs: 95, type: 'triangle' },
    ]);
  } else if (kind === 'salida') {
    playToneSequence([
      { freq: 659.25, durationMs: 90, delayMs: 0, type: 'triangle' },
      { freq: 987.77, durationMs: 140, delayMs: 95, type: 'triangle' },
    ]);
  } else if (kind === 'tarde') {
    playToneSequence([
      { freq: 587.33, durationMs: 120, delayMs: 0, type: 'sine' },
      { freq: 523.25, durationMs: 170, delayMs: 130, type: 'sine' },
    ]);
  } else {
    playToneSequence([
      { freq: 240, durationMs: 150, delayMs: 0, type: 'sawtooth' },
      { freq: 185, durationMs: 210, delayMs: 160, type: 'sawtooth' },
    ]);
  }
}
