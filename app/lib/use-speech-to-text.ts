import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  const recognitionRef = useRef<any>(null);

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
    instance.continuous = false;
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
      if (finalText && onFinal) onFinal(finalText.trim());
    };

    recognition.onerror = (event: any) => {
      setError(event.error || 'Speech recognition error');
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      if (onInterim) onInterim('');
    };
  }, [onFinal, onInterim]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    recognitionRef.current.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
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

