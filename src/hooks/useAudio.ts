import { useCallback, useEffect, useRef, useState } from 'react';
import type { Preferences } from '../types';

function speechEngine(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

function localChineseVoices(): SpeechSynthesisVoice[] {
  return (speechEngine()?.getVoices() ?? [])
    .filter((voice) => voice.localService && /^zh(?:-|$)/i.test(voice.lang))
    .sort((a, b) => Number(/^zh-(?:TW|Hant(?:-TW)?)$/i.test(b.lang)) - Number(/^zh-(?:TW|Hant(?:-TW)?)$/i.test(a.lang)));
}

function speechSegments(text: string): string[] {
  const sentences = text.trim().match(/[^。！？!?；;\n]+[。！？!?；;\n]*|[。！？!?；;\n]+/g) ?? [];
  const segments: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length <= 300) {
      current += sentence;
      continue;
    }
    if (current) segments.push(current);
    current = '';
    for (const character of sentence) {
      if (current.length + character.length > 300) {
        segments.push(current);
        current = '';
      }
      current += character;
    }
  }
  if (current) segments.push(current);
  return segments;
}

/** Uses device voices and generated tones; it never calls a speech or audio service. */
export function useAudio(preferences: Preferences, onNotice: (message: string) => void) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(localChineseVoices);
  const preferencesRef = useRef(preferences);
  const noticeRef = useRef(onNotice);
  const contextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef(new Set<OscillatorNode>());
  const utterancesRef = useRef(new Set<SpeechSynthesisUtterance>());
  const speechGenerationRef = useRef(0);
  const lastTickRef = useRef(0);

  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { noticeRef.current = onNotice; }, [onNotice]);

  const stopTones = useCallback(() => {
    for (const oscillator of oscillatorsRef.current) {
      try { oscillator.stop(); } catch { /* The scheduled tone may already have ended. */ }
    }
    oscillatorsRef.current.clear();
  }, []);

  const stop = useCallback(() => {
    speechGenerationRef.current += 1;
    utterancesRef.current.clear();
    speechEngine()?.cancel();
    stopTones();
  }, [stopTones]);

  useEffect(() => {
    const engine = speechEngine();
    const refresh = () => setVoices(localChineseVoices());
    queueMicrotask(refresh);
    engine?.addEventListener('voiceschanged', refresh);
    return () => { engine?.removeEventListener('voiceschanged', refresh); };
  }, []);

  useEffect(() => {
    if (!preferences.sound) stopTones();
    if (!preferences.speech) {
      speechGenerationRef.current += 1;
      utterancesRef.current.clear();
      speechEngine()?.cancel();
    }
  }, [preferences.sound, preferences.speech, stopTones]);

  useEffect(() => () => {
    stop();
    if (contextRef.current && contextRef.current.state !== 'closed') {
      void contextRef.current.close().catch(() => {});
    }
  }, [stop]);

  // Call directly from a click handler, before awaiting anything else.
  const enable = useCallback(async () => {
    try {
      const Audio = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) {
        noticeRef.current('此瀏覽器無法播放抽獎音效，仍可正常抽獎。');
        return;
      }
      if (!contextRef.current || contextRef.current.state === 'closed') contextRef.current = new Audio();
      await contextRef.current.resume();
    } catch {
      noticeRef.current('音效尚未啟用，請點選「試聽」再試一次。');
    }
  }, []);

  const tone = useCallback((frequency: number, duration: number, delay = 0, volume = 0.06) => {
    const context = contextRef.current;
    if (!preferencesRef.current.sound || !context || context.state !== 'running' || speechEngine()?.speaking) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillatorsRef.current.add(oscillator);
    oscillator.onended = () => {
      oscillatorsRef.current.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    if (now - lastTickRef.current < 65) return;
    lastTickRef.current = now;
    tone(760, 0.03, 0, 0.035);
  }, [tone]);

  const celebrate = useCallback(() => {
    stopTones();
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => tone(frequency, 0.22, index * 0.12));
  }, [stopTones, tone]);

  // The caller guards winner narration with preferences.speech. A test button
  // may explicitly speak while automatic narration is switched off.
  const speak = useCallback((text: string) => {
    const engine = speechEngine();
    if (!engine || !('SpeechSynthesisUtterance' in window)) {
      noticeRef.current('此瀏覽器不支援朗讀，請改用 Safari 或 Chrome 開啟。');
      return;
    }
    const available = localChineseVoices();
    const voice = available.find((item) => item.voiceURI === preferencesRef.current.voiceURI) ?? available[0];
    if (!voice) {
      noticeRef.current('這台裝置沒有可用的內建中文語音。可在裝置設定中加入中文語音，或關閉朗讀繼續抽獎。');
      return;
    }
    if (!text.trim()) return;
    stop();
    const generation = speechGenerationRef.current;
    const rate = Math.max(0.5, Math.min(2, preferencesRef.current.speechRate));
    let noticed = false;
    const reportError = (message: string) => {
      if (noticed || generation !== speechGenerationRef.current) return;
      noticed = true;
      noticeRef.current(message);
    };
    for (const segment of speechSegments(text)) {
      const utterance = new SpeechSynthesisUtterance(segment);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = rate;
      utterance.volume = 1;
      utterancesRef.current.add(utterance);
      utterance.onend = () => { utterancesRef.current.delete(utterance); };
      utterance.onerror = (event) => {
        utterancesRef.current.delete(utterance);
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          reportError('朗讀未成功，請確認音量，再點「再唸一次」。抽獎結果已保留。');
        }
      };
      try { engine.speak(utterance); }
      catch {
        utterancesRef.current.delete(utterance);
        reportError('朗讀尚未啟用，請點「試聽」再試一次。');
      }
    }
  }, [stop]);

  return { voices, enable, tick, celebrate, speak, stop };
}
