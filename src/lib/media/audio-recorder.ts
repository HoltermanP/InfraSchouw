import { pickRecorderMime } from "./client";

export type AudioClip = { blob: Blob; mime: string; startedAt: Date; durationMs: number; seriesId: string };

/**
 * Microphone recorder. Continuous recordings are rotated every
 * `rotateSeconds` into separate, independently decodable files (each stays
 * well below the 25 MB transcription limit).
 */
export class AudioRecorderSession {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = new Date();
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  private seriesId = crypto.randomUUID();
  private stopping = false;

  constructor(
    private onClip: (clip: AudioClip) => void,
    private rotateSeconds = 600,
  ) {}

  get recording() {
    return this.recorder?.state === "recording";
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.seriesId = crypto.randomUUID();
    this.stopping = false;
    this.begin();
  }

  private begin() {
    if (!this.stream) return;
    const mime = pickRecorderMime("audio");
    this.chunks = [];
    this.startedAt = new Date();
    const rec = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : undefined);
    rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || "audio/webm";
      if (this.chunks.length) {
        this.onClip({ blob: new Blob(this.chunks, { type }), mime: type, startedAt: this.startedAt, durationMs: Date.now() - this.startedAt.getTime(), seriesId: this.seriesId });
      }
      if (!this.stopping) this.begin();
    };
    rec.start(1000);
    this.recorder = rec;
    this.rotateTimer = setTimeout(() => this.recorder?.stop(), this.rotateSeconds * 1000);
  }

  stop() {
    this.stopping = true;
    if (this.rotateTimer) clearTimeout(this.rotateTimer);
    if (this.recorder?.state === "recording") this.recorder.stop();
    setTimeout(() => {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }, 300);
  }
}
