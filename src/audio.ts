import { duration, stepSeconds, type Drum, type Instrument, type Project, type Track } from './model';
import { encodeWav } from './wav';

type Context = AudioContext | OfflineAudioContext;
function tone(ctx: Context, output: AudioNode, pitch: number, at: number, seconds: number, velocity: number, instrument: Instrument): AudioScheduledSourceNode[] {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  oscillator.type = instrument === 'synth' ? 'sawtooth' : 'triangle';
  oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
  filter.type = 'lowpass'; filter.frequency.value = instrument === 'soft' ? 1800 : 3500;
  const release = instrument === 'pluck' ? .15 : .25;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(velocity * .23, at + .008);
  gain.gain.exponentialRampToValueAtTime(Math.max(.001, velocity * (instrument === 'pluck' ? .018 : .12)), at + Math.max(.02, seconds));
  gain.gain.exponentialRampToValueAtTime(.0001, at + seconds + release);
  oscillator.connect(filter).connect(gain).connect(output);
  oscillator.start(at); oscillator.stop(at + seconds + release + .02);
  return [oscillator];
}
function percussion(ctx: Context, output: AudioNode, kind: Drum, at: number): AudioScheduledSourceNode[] {
  const gain = ctx.createGain(); gain.connect(output);
  if (kind === 'kick') {
    const oscillator = ctx.createOscillator(); oscillator.connect(gain);
    oscillator.frequency.setValueAtTime(145, at); oscillator.frequency.exponentialRampToValueAtTime(42, at + .14);
    gain.gain.setValueAtTime(.7, at); gain.gain.exponentialRampToValueAtTime(.0001, at + .3);
    oscillator.start(at); oscillator.stop(at + .32); return [oscillator];
  }
  const seconds = kind === 'hat' ? .075 : .18;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  // Deterministic noise keeps offline exports consistent with live playback.
  let seed = kind === 'hat' ? 17 : 53;
  for (let i = 0; i < samples.length; i++) { seed = (seed * 16807) % 2147483647; samples[i] = seed / 1073741823.5 - 1; }
  const source = ctx.createBufferSource(); source.buffer = buffer;
  const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = kind === 'hat' ? 6500 : 1400;
  gain.gain.setValueAtTime(kind === 'hat' ? .22 : .42, at); gain.gain.exponentialRampToValueAtTime(.0001, at + seconds);
  source.connect(filter).connect(gain); source.start(at); return [source];
}
function buses(ctx: Context, p: Project, output: AudioNode): Record<Track, GainNode> {
  return Object.fromEntries((['keys', 'drums', 'voice'] as const).map(key => {
    const gain = ctx.createGain(); gain.gain.value = p.mixer[key].mute ? 0 : p.mixer[key].volume; gain.connect(output); return [key, gain];
  })) as Record<Track, GainNode>;
}
function master(ctx: Context) {
  const compressor = ctx.createDynamicsCompressor(); compressor.threshold.value = -8; compressor.ratio.value = 8;
  const gain = ctx.createGain(); gain.gain.value = .8; compressor.connect(gain).connect(ctx.destination); return compressor;
}
function voice(ctx: Context, output: AudioNode, p: Project, buffer: AudioBuffer, at: number): AudioBufferSourceNode | null {
  const offset = p.recording!.offset;
  const skip = Math.max(0, -offset);
  const length = Math.min(buffer.duration - skip, duration(p) - Math.max(0, offset));
  if (length <= 0) return null;
  const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(output);
  source.start(at + Math.max(0, offset), skip, length); return source;
}
export class AudioEngine {
  context?: AudioContext;
  private output?: DynamicsCompressorNode;
  private tracks?: Record<Track, GainNode>;
  private project?: Project;
  private sources = new Set<AudioScheduledSourceNode>();
  private timer?: ReturnType<typeof setInterval>;
  private next = 0;
  private startAt = 0;
  private loop = true;
  private metronome = false;
  private recordingBuffer?: AudioBuffer;
  private recordingUrl?: string;
  onStep: (step: number) => void = () => {};
  onEnd: () => void = () => {};
  async ready() {
    this.context ??= new AudioContext({ latencyHint: 'interactive' });
    this.output ??= master(this.context);
    await this.context.resume();
    return this.context;
  }
  update(p: Project) {
    this.project = p;
    if (this.tracks && this.context) for (const key of ['keys', 'drums', 'voice'] as const) this.tracks[key].gain.setTargetAtTime(p.mixer[key].mute ? 0 : p.mixer[key].volume, this.context.currentTime, .015);
  }
  async preview(pitch: number, instrument: Instrument) {
    const ctx = await this.ready(); this.remember(tone(ctx, this.output!, pitch, ctx.currentTime, .25, .7, instrument));
  }
  private remember(sources: (AudioScheduledSourceNode | null)[]) {
    for (const source of sources) if (source) {
      this.sources.add(source);
      source.onended = () => { source.disconnect(); this.sources.delete(source); };
    }
  }
  async play(p: Project, loop: boolean, metronome: boolean): Promise<number> {
    this.stop();
    const ctx = await this.ready();
    if (p.recording && p.recording.dataUrl !== this.recordingUrl) {
      const data = await (await fetch(p.recording.dataUrl)).arrayBuffer();
      this.recordingBuffer = await ctx.decodeAudioData(data); this.recordingUrl = p.recording.dataUrl;
    }
    this.project = p; this.loop = loop; this.metronome = metronome;
    this.tracks = buses(ctx, p, this.output!); this.next = 0; this.startAt = ctx.currentTime + .1;
    this.timer = setInterval(() => this.tick(), 25); this.tick();
    return this.startAt;
  }
  private tick() {
    const ctx = this.context!; const p = this.project!; const unit = stepSeconds(p.bpm);
    const position = (ctx.currentTime - this.startAt) / unit;
    if (!this.loop && position >= 128) { this.stop(); this.onEnd(); return; }
    while (this.startAt + this.next * unit < ctx.currentTime + .12 && (this.loop || this.next < 128)) {
      const step = this.next % 128; const at = this.startAt + this.next * unit;
      // If a background tab missed its scheduling window, resume without a burst of old notes.
      if (at >= ctx.currentTime - .01) {
        for (const note of p.notes) if (note.step === step) this.remember(tone(ctx, this.tracks!.keys, note.pitch, at, note.length * unit, note.velocity, p.instrument));
        for (const kind of ['kick', 'snare', 'hat'] as const) if (p.drums[kind].includes(step)) this.remember(percussion(ctx, this.tracks!.drums, kind, at));
        if (step === 0 && p.recording && this.recordingBuffer) this.remember([voice(ctx, this.tracks!.voice, p, this.recordingBuffer, at)]);
        if (this.metronome && step % 4 === 0) this.remember(tone(ctx, this.output!, step % 16 === 0 ? 96 : 89, at, .025, .25, 'pluck'));
      }
      this.next++;
    }
    this.onStep(position < 0 ? 0 : Math.floor(position) % 128);
  }
  stop() {
    clearInterval(this.timer); this.timer = undefined;
    for (const source of this.sources) { try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
    this.sources.clear();
    if (this.tracks) Object.values(this.tracks).forEach(track => track.disconnect());
    this.tracks = undefined; this.onStep(-1);
  }
  async exportWav(p: Project, only?: Track): Promise<Blob> {
    const sampleRate = 44100;
    // Fixed 8-bar timeline plus a one-second tail, identical for every stem.
    const ctx = new OfflineAudioContext(2, Math.ceil((duration(p) + 1) * sampleRate), sampleRate);
    const tracks = buses(ctx, p, master(ctx));
    if (only) for (const key of ['keys', 'drums', 'voice'] as const) if (key !== only) tracks[key].gain.value = 0;
    const unit = stepSeconds(p.bpm);
    for (const note of p.notes) tone(ctx, tracks.keys, note.pitch, note.step * unit, note.length * unit, note.velocity, p.instrument);
    for (const kind of ['kick', 'snare', 'hat'] as const) for (const step of p.drums[kind]) percussion(ctx, tracks.drums, kind, step * unit);
    if (p.recording) {
      const buffer = await ctx.decodeAudioData(await (await fetch(p.recording.dataUrl)).arrayBuffer());
      voice(ctx, tracks.voice, p, buffer, 0);
    }
    const result = await ctx.startRendering();
    return new Blob([encodeWav([result.getChannelData(0), result.getChannelData(1)], sampleRate)], { type: 'audio/wav' });
  }
  dispose() { this.stop(); void this.context?.close(); }
}

export async function beginRecording(ctx: AudioContext, finished: (recording: { dataUrl: string; duration: number; startedAt: number }) => void, failed: (error: Error) => void) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('이 브라우저는 녹음을 지원하지 않습니다. HTTPS 또는 localhost에서 열어 주세요.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  let recorder: MediaRecorder;
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) { stream.getTracks().forEach(t => t.stop()); throw error; }
  const chunks: Blob[] = [];
  let failedRecording = false;
  const startedAt = ctx.currentTime;
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onerror = () => { failedRecording = true; stream.getTracks().forEach(t => t.stop()); failed(new Error('녹음 중 오류가 발생했습니다.')); };
  recorder.onstop = async () => {
    stream.getTracks().forEach(track => track.stop());
    if (failedRecording) return;
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('녹음이 비어 있거나 20 MB를 초과했습니다.');
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
      finished({ dataUrl, duration: decoded.duration, startedAt });
    } catch (error) { failed(error instanceof Error ? error : new Error('녹음을 읽을 수 없습니다.')); }
  };
  recorder.start();
  return () => { if (recorder.state !== 'inactive') recorder.stop(); stream.getTracks().forEach(track => track.stop()); };
}
