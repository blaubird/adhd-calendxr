import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SpeechRecognitionConstructor = new () => any;

type Options = {
  language: string;
  onFinal?: (text: string) => void;
  onInterim?: (text: string) => void;
};

const SILENCE_TIMEOUT_MS = 12000;

export function useSpeechToText(options: Options) {
  const { language, onFinal, onInterim } = options;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const lastFinalRef = useRef<string>('');

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = null;
  }, []);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = window.setTimeout(() => {
      listeningRef.current = false;
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
      resetSilenceTimer();
      if (interim && onInterim) onInterim(interim.trim());
      if (finalText) {
        const normalized = finalText.trim();
        if (normalized && normalized !== lastFinalRef.current) {
          lastFinalRef.current = normalized;
          onFinal?.(normalized);
        }
      }
    };

    recognition.onerror = (event: any) => {
      setError(event.error || 'Speech recognition error');
      setListening(false);
      listeningRef.current = false;
      clearSilenceTimer();
    };

    recognition.onend = () => {
      clearSilenceTimer();
      if (listeningRef.current) {
        window.setTimeout(() => {
          try {
            recognition.start();
          } catch (err) {
            setError((err as any)?.message || 'Speech recognition error');
            listeningRef.current = false;
            setListening(false);
          }
        }, 300);
      } else {
        setListening(false);
      }
      if (onInterim) onInterim('');
    };
  }, [onFinal, onInterim, resetSilenceTimer, clearSilenceTimer]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    lastFinalRef.current = '';
    listeningRef.current = true;
    recognitionRef.current.start();
    setListening(true);
    resetSilenceTimer();
  }, [resetSilenceTimer]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    clearSilenceTimer();
    recognitionRef.current?.stop();
    setListening(false);
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

