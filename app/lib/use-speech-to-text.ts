import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SpeechRecognitionConstructor = new () => any;

type Options = {
  language: string;
  onFinal?: (text: string) => void;
  onInterim?: (text: string) => void;
};

export const SPEECH_SILENCE_TIMEOUT_MS = 12000;

export function useSpeechToText(options: Options) {
  const { language, onFinal, onInterim } = options;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const keepAliveRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFinalRef = useRef('');

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = setTimeout(() => {
      keepAliveRef.current = false;
      recognitionRef.current?.stop();
      setListening(false);
    }, SPEECH_SILENCE_TIMEOUT_MS);
  }, []);

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
      const trimmedFinal = finalText.trim();
      if (trimmedFinal && trimmedFinal !== lastFinalRef.current) {
        lastFinalRef.current = trimmedFinal;
        if (onInterim) onInterim('');
        if (onFinal) onFinal(trimmedFinal);
      }
    };

    recognition.onerror = (event: any) => {
      setError(event.error || 'Speech recognition error');
      keepAliveRef.current = false;
      setListening(false);
      if (onInterim) onInterim('');
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (keepAliveRef.current) {
        setTimeout(() => {
          try {
            recognition.start();
            setListening(true);
          } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
              console.debug('[speech] restart failed', err);
            }
          }
        }, 300);
      } else {
        setListening(false);
        if (onInterim) onInterim('');
      }
    };
  }, [onFinal, onInterim, resetSilenceTimer]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    keepAliveRef.current = true;
    recognitionRef.current.start();
    setListening(true);
    resetSilenceTimer();
  }, [resetSilenceTimer]);

  const stop = useCallback(() => {
    keepAliveRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    recognitionRef.current?.stop();
  }, []);

  return useMemo(
    () => ({
      supported,
      listening,
      error,
      start,
      stop,
    }),
    [error, listening, start, stop, supported],
  );
}

