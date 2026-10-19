export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const frames = channels[0].length;
  const buffer = new ArrayBuffer(44 + frames * channels.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, buffer.byteLength - 44, true);
  for (let f = 0; f < frames; f++) for (let c = 0; c < channels.length; c++) {
    const value = Math.max(-1, Math.min(1, channels[c][f]));
    view.setInt16(44 + (f * channels.length + c) * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return buffer;
}
