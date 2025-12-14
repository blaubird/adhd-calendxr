import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SpeechRecognitionConstructor = new () => any;

type Options = {
  language: string;
  onFinal?: (text: string) => void;
  onInterim?: (text: string) => void;
};

const SILENCE_TIMEOUT_MS = 12000;
const RESTART_DELAY_MS = 300;

export function useSpeechToText(options: Options) {
  const { language, onFinal, onInterim } = options;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFinalRef = useRef<string>('');

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);

  const scheduleSilenceStop = useCallback(() => {
    clearSilenceTimer();
    silenceTimer.current = setTimeout(() => {
      recognitionRef.current?.stop();
      setListening(false);
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const Speech: SpeechRecognitionConstructor | undefined =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const instance = new (Speech as any)();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = language;
    recognitionRef.current = instance;
  }, [language]);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language;
    }
  }, [language]);

  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    recognition.onresult = (event: any) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalText += res[0].transcript;
        } else {
          interim += res[0].transcript;
        }
      }
      if (interim && onInterim) onInterim(interim.trim());
      if (finalText && finalText.trim() !== lastFinalRef.current) {
        lastFinalRef.current = finalText.trim();
        if (onFinal) onFinal(finalText.trim());
      }
      scheduleSilenceStop();
    };

    recognition.onerror = (event: any) => {
      setError(event.error || 'Speech recognition error');
      setListening(false);
      clearSilenceTimer();
    };

    recognition.onend = () => {
      clearSilenceTimer();
      if (onInterim) onInterim('');
      if (listening) {
        setTimeout(() => recognition.start(), RESTART_DELAY_MS);
      } else {
        setListening(false);
      }
    };
  }, [clearSilenceTimer, listening, onFinal, onInterim, scheduleSilenceStop]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    lastFinalRef.current = '';
    recognitionRef.current.start();
    setListening(true);
    scheduleSilenceStop();
  }, [scheduleSilenceStop]);

  const stop = useCallback(() => {
    setListening(false);
    clearSilenceTimer();
    recognitionRef.current?.stop();
  }, [clearSilenceTimer]);

  return useMemo(
    () => ({
      supported,
      listening,
      error,
      start,
      stop,
      silenceTimeoutMs: SILENCE_TIMEOUT_MS,
    }),
    [error, listening, start, stop, supported],
  );
}
