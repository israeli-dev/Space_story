import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { splitSentences } from '../lib/geo';

export type NarrationStatus = 'idle' | 'playing' | 'paused' | 'ended';

interface UseNarrationResult {
  supported: boolean;
  sentences: string[];
  status: NarrationStatus;
  activeIndex: number;
  progress: number;
  rate: number;
  voices: SpeechSynthesisVoice[];
  voiceName: string;
  setRate: (rate: number) => void;
  setVoiceName: (name: string) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggle: () => void;
}

/**
 * Reads a story aloud with the browser's speech engine.
 *
 * Text is spoken sentence by sentence so that (a) the story can be highlighted
 * as it is read, (b) progress can be reported accurately, and (c) long
 * narrations do not hit the utterance-length limits of some browsers.
 * No audio is generated or stored: the narration is the verified text itself.
 */
export function useNarration(paragraphs: string[], resetKey: string): UseNarrationResult {
  const sentences = useMemo(
    () => paragraphs.flatMap((paragraph) => splitSentences(paragraph)).filter(Boolean),
    [paragraphs],
  );
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

  const [status, setStatus] = useState<NarrationStatus>('idle');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [rate, setRateState] = useState(0.98);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceNameState] = useState('');

  const tokenRef = useRef(0);
  const indexRef = useRef(0);
  const rateRef = useRef(rate);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const sentencesRef = useRef(sentences);
  const statusRef = useRef<NarrationStatus>('idle');

  sentencesRef.current = sentences;
  rateRef.current = rate;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // collect voices (they arrive asynchronously in Chrome)
  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
      if (!all.length) return;
      setVoices(all);
      setVoiceNameState((current) => {
        if (current && all.some((v) => v.name === current)) return current;
        const preferred =
          all.find((v) => /google uk english male/i.test(v.name)) ??
          all.find((v) => /google us english/i.test(v.name)) ??
          all.find((v) => /microsoft (guy|davis|ryan)/i.test(v.name)) ??
          all.find((v) => /daniel|alex|fred|arthur/i.test(v.name)) ??
          all.find((v) => v.localService) ??
          all[0];
        return preferred?.name ?? '';
      });
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported]);

  useEffect(() => {
    const chosen = voices.find((v) => v.name === voiceName) ?? null;
    voiceRef.current = chosen;
  }, [voiceName, voices]);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    if (supported) window.speechSynthesis.cancel();
    setStatus('idle');
    setActiveIndex(-1);
    setProgress(0);
    indexRef.current = 0;
  }, [supported]);

  // stop when the story changes or the panel closes
  useEffect(() => {
    stop();
    return () => {
      tokenRef.current += 1;
      if (supported) window.speechSynthesis.cancel();
    };
  }, [resetKey, supported, stop]);

  const speakFrom = useCallback(
    (index: number) => {
      if (!supported) return;
      const list = sentencesRef.current;
      const token = tokenRef.current;
      if (index >= list.length) {
        setStatus('ended');
        setProgress(1);
        indexRef.current = 0;
        return;
      }
      indexRef.current = index;
      setActiveIndex(index);
      setStatus('playing');

      const utterance = new SpeechSynthesisUtterance(list[index]);
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.rate = rateRef.current;
      utterance.pitch = 1;
      utterance.lang = voiceRef.current?.lang ?? 'en-US';

      utterance.onboundary = (event) => {
        if (token !== tokenRef.current) return;
        const within = Math.min(1, (event.charIndex + 1) / Math.max(1, list[index].length));
        setProgress((index + within) / list.length);
      };
      utterance.onend = () => {
        if (token !== tokenRef.current) return;
        const next = index + 1;
        if (next >= list.length) {
          setStatus('ended');
          setProgress(1);
          setActiveIndex(-1);
          indexRef.current = 0;
          return;
        }
        speakFrom(next);
      };
      utterance.onerror = () => {
        if (token !== tokenRef.current) return;
        setStatus('idle');
      };
      window.speechSynthesis.speak(utterance);
      setProgress(index / list.length);
    },
    [supported],
  );

  const play = useCallback(() => {
    if (!supported) return;
    if (statusRef.current === 'paused') {
      window.speechSynthesis.resume();
      setStatus('playing');
      return;
    }
    tokenRef.current += 1;
    window.speechSynthesis.cancel();
    speakFrom(indexRef.current || 0);
  }, [speakFrom, supported]);

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setStatus('paused');
  }, [supported]);

  const toggle = useCallback(() => {
    if (statusRef.current === 'playing') pause();
    else play();
  }, [pause, play]);

  const setRate = useCallback(
    (next: number) => {
      setRateState(next);
      rateRef.current = next;
      if (statusRef.current === 'playing' || statusRef.current === 'paused') {
        // restart the current sentence at the new speed
        tokenRef.current += 1;
        window.speechSynthesis.cancel();
        speakFrom(indexRef.current);
      }
    },
    [speakFrom],
  );

  return {
    supported,
    sentences,
    status,
    activeIndex,
    progress,
    rate,
    voices,
    voiceName,
    setRate,
    setVoiceName: setVoiceNameState,
    play,
    pause,
    stop,
    toggle,
  };
}
