// Synthesized sound only: every effect and the music loop are built from WebAudio oscillators
// and filtered noise, so the game ships no audio files and makes no network request. The engine
// is created lazily on the first user gesture (browsers block audio before one) and every call
// is a no-op until then, so the screenshot scenes stay silent and deterministic.

const MUSIC_STEPS = [
  // A slow, moody bass line in A minor, one note per step; 0 is a rest.
  55, 0, 55, 65.41, 0, 55, 0, 49, 55, 0, 55, 65.41, 0, 82.41, 0, 73.42,
  55, 0, 55, 65.41, 0, 55, 0, 49, 43.65, 0, 49, 55, 0, 65.41, 0, 0,
];

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      startEngine();
      startSiren();
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function startEngine() {
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  function startSiren() {
    sirenOsc = context.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 660;
    sirenGain = context.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
  }

  function startMusic() {
    musicTimer = window.setInterval(() => {
      if (!context || context.state !== 'running') return;
      const freq = MUSIC_STEPS[musicStep % MUSIC_STEPS.length];
      musicStep += 1;
      if (!freq) return;
      const osc = context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = context.createGain();
      const now = context.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.36);
    }, 170);
  }

  function tone(freq, duration, type, volume, slideTo) {
    if (!context) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume || 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function noise(duration, volume, filterFreq) {
    if (!context) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = context.createGain();
    gain.gain.value = volume || 0.3;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  return {
    /** Call from any user gesture; safe to call repeatedly. */
    unlock() {
      ensure();
    },
    get ready() {
      return context !== null;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** 0..1 driving speed: the engine hum follows it. */
    setEngine(amount) {
      if (!context) return;
      engineGain.gain.setTargetAtTime(amount * 0.05, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(48 + amount * 130, context.currentTime, 0.08);
    },
    /** 0 when no police are near, 1 when the heat is on: the siren wails. */
    setSiren(on, dt) {
      if (!context) return;
      sirenTimer += dt;
      const high = Math.floor(sirenTimer * 1.6) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, context.currentTime, 0.05);
      sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, context.currentTime, 0.2);
    },
    shoot() {
      noise(0.12, 0.35, 2600);
      tone(180, 0.08, 'square', 0.12, 60);
    },
    punch() {
      noise(0.08, 0.25, 500);
    },
    crash(strength) {
      noise(0.25, Math.min(0.5, 0.15 + strength * 0.4), 420);
      tone(70, 0.2, 'sine', 0.25, 38);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.2);
      window.setTimeout(() => tone(990, 0.12, 'sine', 0.2), 70);
    },
    mission() {
      tone(523, 0.12, 'triangle', 0.22);
      window.setTimeout(() => tone(659, 0.12, 'triangle', 0.22), 120);
      window.setTimeout(() => tone(784, 0.22, 'triangle', 0.22), 240);
    },
    busted() {
      tone(392, 0.3, 'sawtooth', 0.18, 196);
      window.setTimeout(() => tone(196, 0.5, 'sawtooth', 0.18, 98), 300);
    },
    click() {
      tone(880, 0.05, 'sine', 0.12);
    },
  };
}
