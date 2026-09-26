import { canvasToBlob, extractVideoKeyframes, makeThumbnail, pickRecorderMime } from "../media/client";
import type { CaptureSourceKind } from "../domain";
import type { CaptureSource } from "./types";

export type PhotoResult = { blob: Blob; thumb: Blob; width: number; height: number; mime: string };
export type VideoResult = {
  blob: Blob;
  mime: string;
  durationMs: number;
  keyframes: { blob: Blob; offsetMs: number }[];
  thumb: Blob | null;
  audio: { blob: Blob; mime: string } | null;
};

/**
 * Rear camera via getUserMedia at the highest available resolution. Photos
 * come from ImageCapture.takePhoto() where supported (full sensor
 * resolution), otherwise from a canvas grab of the video stream. Video is
 * recorded with MediaRecorder; a separate audio-only recording runs in
 * parallel so speech can be transcribed without shipping the video file.
 */
export class PhoneCameraSource implements CaptureSource {
  readonly kind: CaptureSourceKind = "phone-camera";
  readonly label: string = "Telefooncamera";
  protected stream: MediaStream | null = null;
  protected video: HTMLVideoElement | null = null;
  private recorder: MediaRecorder | null = null;
  private audioRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private audioChunks: Blob[] = [];
  private recordStart = 0;

  protected constraints(): MediaStreamConstraints {
    return {
      video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } },
      audio: false,
    };
  }

  async isAvailable() {
    return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  }

  async start(videoEl: HTMLVideoElement, withAudio = false): Promise<MediaStream> {
    this.stop();
    const c = this.constraints();
    this.stream = await navigator.mediaDevices.getUserMedia({ ...c, audio: withAudio });
    this.video = videoEl;
    videoEl.srcObject = this.stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    await videoEl.play().catch(() => undefined);
    return this.stream;
  }

  get active() {
    return Boolean(this.stream?.active);
  }

  async takePhoto(): Promise<PhotoResult> {
    if (!this.stream || !this.video) throw new Error("Camera is niet gestart");
    let blob: Blob | null = null;
    const track = this.stream.getVideoTracks()[0];
    const ImageCaptureCtor = (globalThis as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto(): Promise<Blob> } }).ImageCapture;
    if (track && ImageCaptureCtor) {
      try {
        blob = await new ImageCaptureCtor(track).takePhoto();
      } catch {
        blob = null;
      }
    }
    if (!blob) {
      const v = this.video;
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth || 1280;
      canvas.height = v.videoHeight || 720;
      canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
      blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    }
    const thumb = await makeThumbnail(blob);
    return { blob, thumb: thumb.blob, width: thumb.width, height: thumb.height, mime: blob.type || "image/jpeg" };
  }

  async startVideo(): Promise<void> {
    if (!this.stream) throw new Error("Camera is niet gestart");
    const mime = pickRecorderMime("video");
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    const audioTracks = this.stream.getAudioTracks();
    if (audioTracks.length) {
      const amime = pickRecorderMime("audio");
      this.audioChunks = [];
      this.audioRecorder = new MediaRecorder(new MediaStream(audioTracks), amime ? { mimeType: amime } : undefined);
      this.audioRecorder.ondataavailable = (e) => e.data.size && this.audioChunks.push(e.data);
      this.audioRecorder.start(1000);
    }
    this.recorder.start(1000);
    this.recordStart = Date.now();
  }

  get recording() {
    return this.recorder?.state === "recording";
  }

  async stopVideo(keyframeEverySeconds = 5): Promise<VideoResult> {
    const rec = this.recorder;
    if (!rec) throw new Error("Er loopt geen video-opname");
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.stop();
    const arec = this.audioRecorder;
    const audioStopped = arec ? new Promise<void>((r) => (arec.onstop = () => r())) : Promise.resolve();
    arec?.stop();
    await Promise.all([stopped, audioStopped]);
    const durationMs = Date.now() - this.recordStart;
    const mime = rec.mimeType || "video/webm";
    const blob = new Blob(this.chunks, { type: mime });
    const audio = arec && this.audioChunks.length ? { blob: new Blob(this.audioChunks, { type: arec.mimeType || "audio/webm" }), mime: arec.mimeType || "audio/webm" } : null;
    this.recorder = null;
    this.audioRecorder = null;
    let keyframes: { blob: Blob; offsetMs: number }[] = [];
    try {
      keyframes = await extractVideoKeyframes(blob, keyframeEverySeconds);
    } catch {
      keyframes = [];
    }
    return { blob, mime, durationMs, keyframes, thumb: keyframes[0]?.blob ?? null, audio };
  }

  stop() {
    if (this.recorder?.state === "recording") this.recorder.stop();
    if (this.audioRecorder?.state === "recording") this.audioRecorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }
}

/** Fallback when getUserMedia is not available: the native camera app via <input capture>. */
export async function photoFromFile(file: File): Promise<PhotoResult> {
  const thumb = await makeThumbnail(file);
  return { blob: file, thumb: thumb.blob, width: thumb.width, height: thumb.height, mime: file.type || "image/jpeg" };
}
