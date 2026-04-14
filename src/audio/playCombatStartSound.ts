/**
 * Short percussive sting when combat UI opens (no external asset required).
 * Two-beat "tu-dum": light tap then the main drum drop.
 */
export function playCombatStartSound(): void {
  try {
    const ctx = new AudioContext();
    const t0 = ctx.currentTime;
    const mainPeak = 0.2 * 1.15;
    const mainTail = 0.01 * 1.15;
    /** Gap between first and second hit (seconds). */
    const beatGap = 0.13;

    // "Tu" — shorter, brighter first strike
    const oscTu = ctx.createOscillator();
    const gainTu = ctx.createGain();
    oscTu.type = 'triangle';
    oscTu.frequency.setValueAtTime(190, t0);
    oscTu.frequency.exponentialRampToValueAtTime(95, t0 + 0.07);
    gainTu.gain.setValueAtTime(mainPeak * 0.42, t0);
    gainTu.gain.exponentialRampToValueAtTime(0.01, t0 + 0.09);
    oscTu.connect(gainTu);
    gainTu.connect(ctx.destination);
    oscTu.start(t0);
    oscTu.stop(t0 + 0.1);

    // "Dum" — original heavier hit, slightly after the first
    const tDum = t0 + beatGap;
    const oscDum = ctx.createOscillator();
    const gainDum = ctx.createGain();
    oscDum.type = 'triangle';
    oscDum.frequency.setValueAtTime(120, tDum);
    oscDum.frequency.exponentialRampToValueAtTime(55, tDum + 0.12);
    gainDum.gain.setValueAtTime(mainPeak, tDum);
    gainDum.gain.exponentialRampToValueAtTime(mainTail, tDum + 0.25);
    oscDum.connect(gainDum);
    gainDum.connect(ctx.destination);
    oscDum.start(tDum);
    oscDum.stop(tDum + 0.26);
    oscDum.onended = () => void ctx.close();
  } catch {
    /* ignore if AudioContext unavailable */
  }
}
