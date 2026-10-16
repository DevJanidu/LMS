"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionConstructor = new () => Recognition;
const recognitionClass = () =>
  typeof window === "undefined"
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition);
const subscribe = () => () => {};
/**
 * Dictation through the browser's own speech recognition (no Acadence server or model
 * involved). Unsupported browsers report `supported: false`, so the command is disabled.
 */
export function useDictation(onText: (text: string) => void) {
  const supported = useSyncExternalStore(subscribe, () => Boolean(recognitionClass()), () => false);
  const [listening, setListening] = useState(false),
    [failed, setFailed] = useState(false),
    recognition = useRef<Recognition | null>(null),
    deliver = useRef(onText);
  useEffect(() => {
    deliver.current = onText;
  }, [onText]);
  const stop = useCallback(() => recognition.current?.stop(), []);
  const start = useCallback(() => {
    const Speech = recognitionClass();
    if (!Speech || recognition.current) return;
    const instance = new Speech();
    instance.lang = "en-US";
    instance.continuous = true;
    instance.interimResults = false;
    instance.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        if (result.isFinal) deliver.current(result[0].transcript.trim());
      }
    };
    instance.onerror = () => setFailed(true);
    instance.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = instance;
    setFailed(false);
    setListening(true);
    try {
      instance.start();
    } catch {
      recognition.current = null;
      setListening(false);
      setFailed(true);
    }
  }, []);
  useEffect(() => () => recognition.current?.stop(), []);
  return { supported, listening, failed, start, stop };
}
