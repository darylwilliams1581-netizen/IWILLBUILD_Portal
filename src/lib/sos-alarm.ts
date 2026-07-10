/**
 * SOS Alarm — Web Audio API
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a loud pulsing alarm tone using the Web Audio API.
 * No audio file needed — works offline.
 *
 * Usage:
 *   const alarm = createSOSAlarm();
 *   alarm.start();   // begin looping alarm
 *   alarm.stop();    // stop immediately
 */

export interface SOSAlarm {
  start(): void;
  stop(): void;
}

export function createSOSAlarm(): SOSAlarm {
  let ctx: AudioContext | null = null;
  let stopFlag = false;
  let gainNode: GainNode | null = null;

  function playPulse(audioCtx: AudioContext, startTime: number, freq: number, duration: number) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, startTime);

    // Sharp attack, quick decay for alarm feel
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.8, startTime + 0.01);
    gain.gain.setValueAtTime(0.8, startTime + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  function scheduleLoop(audioCtx: AudioContext) {
    if (stopFlag) return;

    const now = audioCtx.currentTime;
    // Three-tone alarm: high-low-high pattern
    playPulse(audioCtx, now + 0.00, 1200, 0.15);
    playPulse(audioCtx, now + 0.18, 880,  0.15);
    playPulse(audioCtx, now + 0.36, 1200, 0.15);

    // Schedule next cycle
    setTimeout(() => scheduleLoop(audioCtx), 700);
  }

  return {
    start() {
      stopFlag = false;
      try {
        ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        scheduleLoop(ctx);
      } catch (e) {
        console.warn('[sos-alarm] Web Audio not available:', e);
      }
    },
    stop() {
      stopFlag = true;
      try {
        if (gainNode) {
          gainNode.gain.setValueAtTime(0, ctx?.currentTime ?? 0);
        }
        ctx?.close();
      } catch {
        // ignore
      }
      ctx = null;
      gainNode = null;
    },
  };
}
