"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseVoiceCommand, type VoiceCommand } from "@/lib/voice/commands";
import { vibrate } from "@/lib/media/client";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

export function speechRecognitionSupported() {
  const w = globalThis as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Hands-free mode (Web Speech API, nl-NL). Recognition restarts
 * automatically while active; every recognised command is confirmed
 * visually and with vibration.
 */
export function useHandsfree(onCommand: (cmd: VoiceCommand) => void) {
  const [active, setActive] = useState(false);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const handler = useRef(onCommand);
  useEffect(() => {
    handler.current = onCommand;
  });

  const confirm = useCallback((text: string) => {
    setConfirmation(text);
    vibrate([50, 30, 50]);
    setTimeout(() => setConfirmation(null), 1800);
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const w = globalThis as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Spraakherkenning wordt niet ondersteund in deze browser (gebruik Chrome of Edge).");
      return;
    }
    const rec = new Ctor();
    rec.lang = "nl-NL";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (!res.isFinal) continue;
        const text = res[0]!.transcript.trim();
        setLastHeard(text);
        const cmd = parseVoiceCommand(text);
        if (cmd.type === "stop-handsfree") {
          confirm("Handsfree uit");
          stop();
          return;
        }
        handler.current(cmd);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        setError("Geen toestemming voor de microfoon.");
        stop();
      }
    };
    rec.onend = () => {
      if (activeRef.current) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    recRef.current = rec;
    activeRef.current = true;
    setActive(true);
    setError(null);
    rec.start();
    confirm("Handsfree aan — zeg “help” voor commando's");
  }, [confirm, stop]);

  useEffect(() => () => recRef.current?.stop(), []);

  return { active, start, stop, lastHeard, confirmation, confirm, error };
}
