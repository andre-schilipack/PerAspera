/**
 * Short percussive sting when combat UI opens (no external asset required).
 */
export function playCombatStartSound(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.12);
    const peak = 0.2 * 1.15;
    const tail = 0.01 * 1.15;
    gain.gain.setValueAtTime(peak, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(tail, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => void ctx.close();
  } catch {
    /* ignore if AudioContext unavailable */
  }
}
