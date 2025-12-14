import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const RESTART_DELAY_MS = 300;
const SILENCE_STOP_MS = 12000;
const DEDUPE_WINDOW = 2;

type SpeechRecognitionConstructor = new () => any;

type Options = {
  language: string;
  onFinal?: (text: string) => void;
  onInterim?: (text: string) => void;
};

export function useSpeechToText(options: Options) {
  const { language, onFinal, onInterim } = options;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');

  const recognitionRef = useRef<any>(null);
  const finalRef = useRef<string>('');
  const lastFinalChunksRef = useRef<string[]>([]);
  const silenceTimerRef = useRef<number | null>(null);
  const listeningRef = useRef<boolean>(false);

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

    return () => {
      instance.onend = null;
      instance.onresult = null;
      instance.onerror = null;
      instance.stop();
    };
  }, [language]);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language;
    }
  }, [language]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const scheduleSilenceStop = useCallback(() => {
    clearSilenceTimer();
    if (!listeningRef.current) return;
    silenceTimerRef.current = window.setTimeout(() => {
      listeningRef.current = false;
      setListening(false);
      recognitionRef.current?.stop();
    }, SILENCE_STOP_MS);
  }, [clearSilenceTimer]);

  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    recognition.onresult = (event: any) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalChunk += res[0].transcript;
        } else {
          interim += res[0].transcript;
        }
      }

      const trimmedInterim = interim.trim();
      if (onInterim) onInterim(trimmedInterim);
      setInterimText(trimmedInterim);

      const trimmedFinal = finalChunk.trim();
      if (trimmedFinal) {
        if (!lastFinalChunksRef.current.includes(trimmedFinal)) {
          lastFinalChunksRef.current = [
            ...lastFinalChunksRef.current.slice(-(DEDUPE_WINDOW - 1)),
            trimmedFinal,
          ];
          const nextFinal = finalRef.current
            ? `${finalRef.current} ${trimmedFinal}`
            : trimmedFinal;
          finalRef.current = nextFinal;
          setFinalText(nextFinal);
          if (onFinal) onFinal(trimmedFinal);
        }
      }
      scheduleSilenceStop();
    };

    recognition.onerror = (event: any) => {
      setError(event.error || 'Speech recognition error');
      listeningRef.current = false;
      setListening(false);
    };

    recognition.onend = () => {
      clearSilenceTimer();
      setInterimText('');
      if (listeningRef.current) {
        window.setTimeout(() => {
          try {
            recognition.start();
            setListening(true);
          } catch (err: any) {
            setError(err?.message || 'Unable to restart speech recognition');
            listeningRef.current = false;
            setListening(false);
          }
        }, RESTART_DELAY_MS);
      } else {
        setListening(false);
      }
    };
  }, [clearSilenceTimer, onFinal, onInterim, scheduleSilenceStop]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    listeningRef.current = true;
    try {
      recognitionRef.current.start();
      setListening(true);
      scheduleSilenceStop();
    } catch (err: any) {
      setError(err?.message || 'Unable to start speech recognition');
      listeningRef.current = false;
      setListening(false);
    }
  }, [scheduleSilenceStop]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    clearSilenceTimer();
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText('');
  }, [clearSilenceTimer]);

  const toggle = useCallback(() => {
    if (listeningRef.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  const reset = useCallback(() => {
    finalRef.current = '';
    lastFinalChunksRef.current = [];
    setFinalText('');
    setInterimText('');
  }, []);

  return useMemo(
    () => ({
      isSupported: supported,
      isListening: listening,
      error,
      start,
      stop,
      toggle,
      finalText,
      interimText,
      reset,
    }),
    [error, finalText, interimText, listening, start, stop, supported, toggle, reset],
  );
}

