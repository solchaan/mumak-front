import { detectPitch, segmentFrames, type PitchFrame } from './transcription';

self.onmessage = (event: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  try {
    const { samples, sampleRate } = event.data;
    const hop = Math.round(sampleRate * .02), frames: PitchFrame[] = [];
    for (let offset = 0; offset + sampleRate * .048 < samples.length; offset += hop) {
      const detected = detectPitch(samples, offset, sampleRate);
      frames.push({ pitch: detected?.pitch ?? null, confidence: detected?.confidence ?? 0, time: (offset + sampleRate * .016) / sampleRate });
      if (frames.length % 100 === 0) self.postMessage({ progress: offset / samples.length });
    }
    self.postMessage({ notes: segmentFrames(frames, samples.length / sampleRate), progress: 1 });
  } catch { self.postMessage({ error: '음높이를 분석하지 못했습니다.' }); }
};
