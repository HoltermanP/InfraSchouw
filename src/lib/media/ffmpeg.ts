import "server-only";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

async function ffmpegPath(): Promise<string | null> {
  try {
    const mod = (await import("ffmpeg-static")) as unknown as { default?: string } | string;
    const p = typeof mod === "string" ? mod : mod.default;
    if (!p) return null;
    await fs.access(p);
    return p;
  } catch {
    return null;
  }
}

export async function ffmpegAvailable() {
  return (await ffmpegPath()) !== null;
}

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "infraschouw-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Extract the audio track as mono 16 kHz MP3 chunks (default 10 min each),
 * well below the 25 MB transcription API limit.
 */
export async function extractAudioChunks(input: Buffer, ext: string, chunkSeconds = 600): Promise<{ chunks: Buffer[]; chunkSeconds: number } | null> {
  const bin = await ffmpegPath();
  if (!bin) return null;
  return withTmp(async (dir) => {
    const inFile = path.join(dir, `in.${ext || "bin"}`);
    await fs.writeFile(inFile, input);
    await run(bin, [
      "-hide_banner", "-loglevel", "error", "-i", inFile, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k",
      "-f", "segment", "-segment_time", String(chunkSeconds), "-reset_timestamps", "1", path.join(dir, "chunk%03d.mp3"),
    ], { timeout: 240_000 });
    const files = (await fs.readdir(dir)).filter((f) => f.startsWith("chunk")).sort();
    const chunks = await Promise.all(files.map((f) => fs.readFile(path.join(dir, f))));
    return { chunks, chunkSeconds };
  });
}

/** Extract JPEG keyframes every N seconds (max `limit`) from a video. */
export async function extractKeyframes(input: Buffer, ext: string, everySeconds = 5, limit = 12): Promise<{ frames: Buffer[]; offsetsMs: number[] } | null> {
  const bin = await ffmpegPath();
  if (!bin) return null;
  return withTmp(async (dir) => {
    const inFile = path.join(dir, `in.${ext || "mp4"}`);
    await fs.writeFile(inFile, input);
    await run(bin, [
      "-hide_banner", "-loglevel", "error", "-i", inFile, "-vf", `fps=1/${everySeconds},scale='min(1600,iw)':-2`,
      "-frames:v", String(limit), "-q:v", "4", path.join(dir, "kf%03d.jpg"),
    ], { timeout: 240_000 });
    const files = (await fs.readdir(dir)).filter((f) => f.startsWith("kf")).sort();
    const frames = await Promise.all(files.map((f) => fs.readFile(path.join(dir, f))));
    return { frames, offsetsMs: frames.map((_, i) => i * everySeconds * 1000) };
  });
}
