"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpenText,
  Bot,
  Command,
  Globe2,
  History,
  LayoutDashboard,
  Languages,
  Mic,
  Moon,
  Pause,
  Play,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Stars,
  Sun,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { TranslationResultCard } from "@/components/translation/TranslationResultCard";
import { ToastViewport } from "@/components/ui/ToastViewport";
import { Skeleton } from "@/components/ui/Skeleton";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import { fetchJson } from "@/lib/fetchJson";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

type Message = {
  role: "user" | "assistant";
  content: string;
};

const APP_FAVORITES_KEY = "thorai-favorites";

export default function HomePage() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);
  const [responseStyle, setResponseStyle] = useState<"formal" | "balanced" | "casual">("balanced");
  const [mode, setMode] = useState<"chat" | "translation" | "dictionary">("chat");
  const [sourceText, setSourceText] = useState("");
  const [dictionaryInput, setDictionaryInput] = useState("");
  const [dictionaryResult, setDictionaryResult] = useState<string | null>(null);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const [dictionaryError, setDictionaryError] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("en-US");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [requestInFlight, setRequestInFlight] = useState(false);
  const [lastIntent, setLastIntent] = useState("NONE");
  const [lastProvider, setLastProvider] = useState("LOCAL");
  const [favorites, setFavorites] = useState<string[]>([]);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const requestQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionIdRef = useRef<string>("default-session");
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const [lastTranslation, setLastTranslation] = useState<{
    originalText: string;
    sourceLanguage: string;
    targetLanguage: string;
    translatedText: string;
  } | null>(null);

  const { theme, mounted, toggleTheme, setTheme } = useTheme();
  const { toasts, removeToast, showToast } = useToast();

  function getApiHeaders() {
    return {
      "Content-Type": "application/json",
      "x-thor-session": sessionIdRef.current,
    };
  }

  const languages = useMemo(
    () => [
      { name: "Español", code: "es-ES" },
      { name: "English", code: "en-US" },
      { name: "Français", code: "fr-FR" },
      { name: "Deutsch", code: "de-DE" },
      { name: "Italiano", code: "it-IT" },
      { name: "Português", code: "pt-PT" },
      { name: "日本語", code: "ja-JP" },
      { name: "한국어", code: "ko-KR" },
      { name: "中文", code: "zh-CN" },
      { name: "Nederlands", code: "nl-NL" },
      { name: "Svenska", code: "sv-SE" },
      { name: "Dansk", code: "da-DK" },
      { name: "Norsk", code: "nb-NO" },
      { name: "Suomi", code: "fi-FI" },
      { name: "Íslenska", code: "is-IS" },
      { name: "Русский", code: "ru-RU" },
    ],
    []
  );

  const languageDisplayMap: Record<string, { short: string }> = {
    auto: { short: "AUTO" },
    "es-ES": { short: "ESP" },
    "en-US": { short: "ENG" },
    "fr-FR": { short: "FRA" },
    "de-DE": { short: "DEU" },
    "it-IT": { short: "ITA" },
    "pt-PT": { short: "POR" },
    "ja-JP": { short: "JPN" },
    "ko-KR": { short: "KOR" },
    "zh-CN": { short: "CHN" },
    "nl-NL": { short: "NLD" },
    "sv-SE": { short: "SWE" },
    "da-DK": { short: "DAN" },
    "nb-NO": { short: "NOR" },
    "fi-FI": { short: "FIN" },
    "is-IS": { short: "ISL" },
    "ru-RU": { short: "RUS" },
  };

  const isTranslationFavorite = translatedText.trim().length > 0 && favorites.includes(translatedText.trim());

  useEffect(() => {
    const existingSessionId = window.localStorage.getItem("thorai-session-id");
    if (existingSessionId?.trim()) {
      sessionIdRef.current = existingSessionId;
      return;
    }

    const generatedSessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `thor-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    sessionIdRef.current = generatedSessionId;
    window.localStorage.setItem("thorai-session-id", generatedSessionId);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(APP_FAVORITES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setFavorites(parsed.filter((item) => typeof item === "string"));
        }
      }
    } catch {
      setFavorites([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(APP_FAVORITES_KEY, JSON.stringify(favorites.slice(0, 25)));
  }, [favorites]);

  useEffect(() => {
    if (!chatLogRef.current) {
      return;
    }

    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      currentUtteranceRef.current = null;
      setIsSpeaking(false);
      setIsPaused(false);
    };
  }, []);

  function getLanguageDisplay(languageCode: string) {
    return languageDisplayMap[languageCode] || { short: "LANG" };
  }

  function getDirectionLabel() {
    const sourceDisplay = getLanguageDisplay(sourceLanguage);
    const targetDisplay = getLanguageDisplay(targetLanguage);

    return `${sourceDisplay.short} → ${targetDisplay.short}`;
  }

  function getSpeechRecognitionLanguage() {
    if (sourceLanguage === "auto") {
      return "";
    }

    return getSpeechLanguageCode(sourceLanguage);
  }

  function stopSpeechAndReset() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    currentUtteranceRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
  }

  function enqueueApiRequest<T>(task: () => Promise<T>): Promise<T> {
    const runTask = async () => {
      setRequestInFlight(true);
      try {
        return await task();
      } finally {
        setRequestInFlight(false);
      }
    };

    const chained = requestQueueRef.current.then(runTask, runTask);
    requestQueueRef.current = chained.then(
      () => undefined,
      () => undefined
    );
    return chained;
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast("error", "Voice input unavailable", "Your browser does not support speech recognition.");
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = getSpeechRecognitionLanguage();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
      showToast("error", "Voice input error", "Unable to capture voice input.");
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;

      if (mode === "translation") {
        void handleTranslationSubmit(transcript, true);
      } else {
        void askAI(transcript, true);
      }
    };

    recognition.start();
  }

  function getSpeechLanguageCode(language: string) {
    const normalized = (language || "").toLowerCase();

    switch (normalized) {
      case "en":
      case "en-us":
        return "en-US";
      case "es":
      case "es-es":
      case "es-mx":
        return "es-ES";
      case "fr":
      case "fr-fr":
      case "fr-ca":
        return "fr-FR";
      case "de":
      case "de-de":
        return "de-DE";
      case "it":
      case "it-it":
        return "it-IT";
      case "pt":
      case "pt-pt":
        return "pt-PT";
      case "pt-br":
        return "pt-BR";
      case "ja":
      case "ja-jp":
        return "ja-JP";
      case "ko":
      case "ko-kr":
        return "ko-KR";
      case "zh":
      case "zh-cn":
      case "zh-hk":
      case "zh-tw":
        return "zh-CN";
      case "nl":
      case "nl-nl":
        return "nl-NL";
      case "sv":
      case "sv-se":
        return "sv-SE";
      case "da":
      case "da-dk":
        return "da-DK";
      case "nb":
      case "nb-no":
        return "nb-NO";
      case "fi":
      case "fi-fi":
        return "fi-FI";
      case "is":
      case "is-is":
        return "is-IS";
      case "ru":
      case "ru-ru":
        return "ru-RU";
      default:
        return language || navigator.language || "es-ES";
    }
  }

  function getVoiceForLanguage(languageCode: string) {
    const voices = window.speechSynthesis.getVoices?.() || [];
    const normalized = (languageCode || "").toLowerCase();
    const baseLanguage = normalized.split("-")[0];

    const languageProfiles: Record<string, { preferredCodes: string[]; fallbackCodes: string[] }> = {
      en: { preferredCodes: ["en-us", "en-gb", "en-au", "en-ca"], fallbackCodes: ["en"] },
      es: { preferredCodes: ["es-es", "es-mx", "es-us", "es"], fallbackCodes: ["es"] },
      fr: { preferredCodes: ["fr-fr", "fr-ca", "fr"], fallbackCodes: ["fr"] },
      de: { preferredCodes: ["de-de", "de"], fallbackCodes: ["de"] },
      it: { preferredCodes: ["it-it", "it"], fallbackCodes: ["it"] },
      pt: { preferredCodes: ["pt-br", "pt-pt", "pt"], fallbackCodes: ["pt"] },
      ja: { preferredCodes: ["ja-jp", "ja"], fallbackCodes: ["ja"] },
      ko: { preferredCodes: ["ko-kr", "ko"], fallbackCodes: ["ko"] },
      zh: { preferredCodes: ["zh-cn", "zh-hk", "zh-tw", "zh"], fallbackCodes: ["zh"] },
      nl: { preferredCodes: ["nl-nl", "nl"], fallbackCodes: ["nl"] },
      sv: { preferredCodes: ["sv-se", "sv"], fallbackCodes: ["sv"] },
      da: { preferredCodes: ["da-dk", "da"], fallbackCodes: ["da"] },
      nb: { preferredCodes: ["nb-no", "nb"], fallbackCodes: ["nb"] },
      fi: { preferredCodes: ["fi-fi", "fi"], fallbackCodes: ["fi"] },
      is: { preferredCodes: ["is-is", "is"], fallbackCodes: ["is"] },
      ru: { preferredCodes: ["ru-ru", "ru"], fallbackCodes: ["ru"] },
    };

    const profile = languageProfiles[baseLanguage] || {
      preferredCodes: [normalized],
      fallbackCodes: [baseLanguage],
    };

    const rankedVoices = voices
      .map((voice: SpeechSynthesisVoice) => {
        const lang = voice.lang.toLowerCase();
        const name = voice.name.toLowerCase();
        const matchesExact = profile.preferredCodes.some((code) => lang === code);
        const matchesBase =
          profile.preferredCodes.some((code) => lang.startsWith(code)) ||
          profile.fallbackCodes.some((code) => lang.startsWith(code));
        const matchesLanguageFamily = lang.startsWith(baseLanguage + "-") || lang.startsWith(baseLanguage);
        const isNatural = /natural|premium|neural|wave|universal|enhanced|female|male/i.test(name);
        const isGoogle = /google|siri|azure|amazon|polly|neural/i.test(name);

        let score = 0;
        if (matchesExact) score += 120;
        if (matchesBase) score += 80;
        if (matchesLanguageFamily) score += 35;
        if (isGoogle) score += 20;
        if (isNatural) score += 15;

        return { voice, score };
      })
      .sort((a, b) => b.score - a.score);

    return rankedVoices[0]?.voice;
  }

  function speak(content: string, languageCode?: string) {
    if (!window.speechSynthesis || !content.trim()) return;

    stopSpeechAndReset();

    const utterance = new SpeechSynthesisUtterance(content);
    currentUtteranceRef.current = utterance;

    const resolvedLanguage = languageCode || navigator.language || "es-ES";
    utterance.lang = resolvedLanguage;

    const matchingVoice = getVoiceForLanguage(resolvedLanguage);
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
    };
    utterance.onend = () => {
      stopSpeechAndReset();
    };
    utterance.onerror = () => {
      stopSpeechAndReset();
    };
    utterance.onpause = () => setIsPaused(true);
    utterance.onresume = () => setIsPaused(false);

    window.speechSynthesis.speak(utterance);
  }

  function pausePlayback() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
  }

  function resumePlayback() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.resume();
    setIsPaused(false);
  }

  function stopPlayback() {
    stopSpeechAndReset();
  }

  function playTranslatedResult() {
    const trimmed = translatedText.trim();
    if (!trimmed || trimmed === "Translating..." || trimmed.startsWith("Error:")) {
      return;
    }

    const translationLanguage = getSpeechLanguageCode(targetLanguage);
    speak(trimmed, translationLanguage);
  }

  function parseApiErrorMessage(error: unknown) {
    const fallback = String(error);
    if (!(error instanceof Error)) {
      return fallback;
    }

    return error.message || fallback;
  }

  async function handleTranslationSubmit(textOverride?: string, fromVoice = false) {
    const trimmed = (textOverride ?? sourceText).trim();
    if (!trimmed) return;

    const resolvedSourceLanguage = sourceLanguage === "auto" ? "auto" : sourceLanguage;

    setSourceText(trimmed);
    setTranslatedText("Translating...");

    await enqueueApiRequest(async () => {
      try {
        const result = await fetchJson<{
          response?: string;
          cached?: boolean;
          intent?: string;
          provider?: string;
        }>("/api/translate", {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: trimmed,
              },
            ],
            text: trimmed,
            responseStyle,
            translationMode: true,
            sourceLanguage: resolvedSourceLanguage,
            targetLanguage,
          }),
        });

        if (!result.ok) {
          throw new Error(result.message || `Server error: ${result.status}`);
        }

        const data = result.data;

        setLastIntent(data?.intent || "TRANSLATE");
        setLastProvider(data?.provider || "LOCAL");

        const translation = data.response || "No translation returned.";
        setTranslatedText(translation);
        setLastTranslation({
          originalText: trimmed,
          sourceLanguage: resolvedSourceLanguage,
          targetLanguage,
          translatedText: translation,
        });

        if (fromVoice) {
          speak(translation, getSpeechLanguageCode(targetLanguage));
        }

        showToast("success", "Translation complete", data.cached ? "Loaded from cache" : "Fresh response");
      } catch (error) {
        const message = parseApiErrorMessage(error);
        setTranslatedText(`Error: ${message}`);
        showToast("error", "Translation failed", message);
      }
    });
  }

  async function retranslatePrevious() {
    if (!lastTranslation?.originalText.trim()) {
      return;
    }

    const nextTargetLanguage = targetLanguage;
    const nextSourceLanguage = lastTranslation.sourceLanguage || sourceLanguage;

    setSourceText(lastTranslation.originalText);
    setTranslatedText("Translating...");

    await enqueueApiRequest(async () => {
      try {
        const result = await fetchJson<{
          response?: string;
          intent?: string;
          provider?: string;
        }>("/api/translate", {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({
            messages: [{ role: "user", content: lastTranslation.originalText }],
            text: lastTranslation.originalText,
            responseStyle,
            translationMode: true,
            sourceLanguage: nextSourceLanguage,
            targetLanguage: nextTargetLanguage,
          }),
        });

        if (!result.ok) {
          throw new Error(result.message || `Server error: ${result.status}`);
        }

        const data = result.data;

        setLastIntent(data?.intent || "TRANSLATE");
        setLastProvider(data?.provider || "LOCAL");

        const translation = data.response || "No translation returned.";
        setTranslatedText(translation);
        setLastTranslation({
          originalText: lastTranslation.originalText,
          sourceLanguage: nextSourceLanguage,
          targetLanguage: nextTargetLanguage,
          translatedText: translation,
        });

        speak(translation, getSpeechLanguageCode(nextTargetLanguage));
        showToast("success", "Re-translation complete");
      } catch (error) {
        const message = parseApiErrorMessage(error);
        setTranslatedText(`Error: ${message}`);
        showToast("error", "Re-translation failed", message);
      }
    });
  }

  async function handleDictionaryLookup() {
    const trimmed = dictionaryInput.trim();
    if (!trimmed) return;

    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length !== 1) {
      setDictionaryError("Dictionary Mode is intended for individual words. Please use Translation Mode for complete sentences.");
      setDictionaryResult(null);
      showToast("info", "Single word only", "Dictionary mode accepts one word at a time.");
      return;
    }

    const normalizedWord = words[0].trim();
    setDictionaryLoading(true);
    setDictionaryError(null);
    setDictionaryResult(null);

    await enqueueApiRequest(async () => {
      try {
        const result = await fetchJson<{
          response?: string;
          cached?: boolean;
          intent?: string;
          provider?: string;
        }>("/api/translate", {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({
            text: normalizedWord,
            responseStyle,
            translationMode: false,
            dictionaryMode: true,
            sourceLanguage: "es-ES",
            targetLanguage: "en-US",
          }),
        });

        if (!result.ok) {
          throw new Error(result.message || `Server error: ${result.status}`);
        }

        const data = result.data;

        setLastIntent(data?.intent || "DICTIONARY");
        setLastProvider(data?.provider || "LOCAL");

        setDictionaryResult(data.response || "No dictionary entry returned.");
        showToast("success", "Dictionary entry ready", data.cached ? "Loaded from cache" : undefined);
      } catch (error) {
        const message = parseApiErrorMessage(error);
        setDictionaryError(`Error: ${message}`);
        showToast("error", "Dictionary lookup failed", message);
      } finally {
        setDictionaryLoading(false);
      }
    });
  }

  async function askAI(messageText?: string, fromVoice = false) {
    const finalText = messageText || text;
    if (!finalText.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: finalText,
    };

    const newMessages = [...messages, userMessage];
    setMessages([
      ...newMessages,
      {
        role: "assistant",
        content: "Thor is thinking...",
      },
    ]);

    setText("");

    await enqueueApiRequest(async () => {
      try {
        const result = await fetchJson<{
          response?: string;
          intent?: string;
          provider?: string;
          command?: { name?: string };
        }>("/api/translate", {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({
            messages: newMessages,
            responseStyle,
          }),
        });

        if (!result.ok) {
          throw new Error(result.message || `Server error: ${result.status}`);
        }

        const data = result.data;

        const detectedIntent = data?.intent || "UNKNOWN";
        const detectedProvider = data?.provider || "LOCAL";
        setLastIntent(detectedIntent);
        setLastProvider(detectedProvider);

        const aiResponse = data.response || "ThorAI returned no response.";

        if (data?.command?.name === "ENABLE_DARK_MODE") {
          setTheme("dark");
          showToast("success", "Command executed", "Dark mode enabled.");
        }

        if (data?.command?.name === "ENABLE_LIGHT_MODE") {
          setTheme("light");
          showToast("success", "Command executed", "Light mode enabled.");
        }

        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: aiResponse,
          },
        ]);

        if (fromVoice) {
          speak(aiResponse);
        }
      } catch (error) {
        const message = parseApiErrorMessage(error);
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: `Error: ${message}`,
          },
        ]);
        showToast("error", "Chat request failed", message);
      }
    });
  }

  async function copyTranslation() {
    if (!translatedText.trim()) return;

    await navigator.clipboard.writeText(translatedText);
    showToast("success", "Copied", "Translation copied to clipboard.");
  }

  async function shareTranslation() {
    if (!translatedText.trim()) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Translation from ThorAI",
          text: translatedText,
        });
        showToast("success", "Shared", "Translation shared successfully.");
      } else {
        await copyTranslation();
      }
    } catch {
      showToast("info", "Share cancelled");
    }
  }

  function toggleFavoriteTranslation() {
    const value = translatedText.trim();
    if (!value) return;

    setFavorites((prev) => {
      if (prev.includes(value)) {
        showToast("info", "Removed from favorites");
        return prev.filter((item) => item !== value);
      }

      showToast("success", "Saved as favorite");
      return [value, ...prev].slice(0, 25);
    });
  }

  function getViewTitle() {
    if (mode === "translation") return "Real-time Translation";
    if (mode === "dictionary") return "Dictionary Assistant";
    return "Conversation Assistant";
  }

  function getViewSubtitle() {
    if (mode === "translation") {
      return "Translate with precision, context memory and voice controls.";
    }
    if (mode === "dictionary") {
      return "Research a single word deeply with concise bilingual guidance.";
    }
    return "Think, draft and iterate with a focused AI conversation workspace.";
  }

  const favoritePreview = favorites.slice(0, 4);

  function clearCurrentMode() {
    if (mode === "chat") {
      setMessages([]);
      setText("");
      showToast("info", "Chat cleared", "Conversation history was removed from the view.");
      return;
    }

    if (mode === "translation") {
      setSourceText("");
      setTranslatedText("");
      setLastTranslation(null);
      stopSpeechAndReset();
      showToast("info", "Translation reset", "Input and output were cleared.");
      return;
    }

    setDictionaryInput("");
    setDictionaryResult(null);
    setDictionaryError(null);
    showToast("info", "Dictionary reset", "Search content was cleared.");
  }

  if (!mounted) {
    return (
      <main className="nova-shell nova-shell-loading" aria-busy="true">
        <aside className="nova-sidebar">
          <div className="nova-brand">
            <Skeleton height={48} width="48px" />
            <div style={{ display: "grid", gap: 8, width: "100%" }}>
              <Skeleton height={16} width="65%" />
              <Skeleton height={12} width="48%" />
            </div>
          </div>
          <Skeleton height={46} />
          <Skeleton height={46} />
          <Skeleton height={46} />
        </aside>

        <section className="nova-main">
          <header className="nova-topbar">
            <Skeleton height={20} width="240px" />
            <Skeleton height={42} width="320px" />
            <Skeleton height={42} width="180px" />
          </header>

          <section className="nova-workbench">
            <Skeleton height={360} />
            <Skeleton height={220} />
          </section>
        </section>
      </main>
    );
  }

  return (
    <>
      <ToastViewport toasts={toasts} onDismiss={removeToast} />

      <main className="nova-shell">
        <aside className="nova-sidebar" aria-label="Main navigation">
          <div className="nova-brand">
            <div className="nova-brand-mark">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="nova-brand-title">ThorAI Nexus</div>
              <div className="nova-brand-subtitle">Language workspace 2026</div>
            </div>
          </div>

          <div className="nova-nav-group">
            <span className="nova-label">Workspace</span>

            <button
              type="button"
              className={`nova-nav-item ${mode === "chat" ? "active" : ""}`}
              onClick={() => {
                stopSpeechAndReset();
                setMode("chat");
              }}
              aria-pressed={mode === "chat"}
            >
              <span className="nova-nav-icon">
                <Bot size={16} />
              </span>
              <span className="nova-nav-text">
                <strong>AI Chat</strong>
                <small>Brainstorm and iterate</small>
              </span>
            </button>

            <button
              type="button"
              className={`nova-nav-item ${mode === "translation" ? "active" : ""}`}
              onClick={() => {
                stopSpeechAndReset();
                setMode("translation");
              }}
              aria-pressed={mode === "translation"}
            >
              <span className="nova-nav-icon">
                <Languages size={16} />
              </span>
              <span className="nova-nav-text">
                <strong>Translation Studio</strong>
                <small>Live multilingual output</small>
              </span>
            </button>

            <button
              type="button"
              className={`nova-nav-item ${mode === "dictionary" ? "active" : ""}`}
              onClick={() => {
                stopSpeechAndReset();
                setMode("dictionary");
              }}
              aria-pressed={mode === "dictionary"}
            >
              <span className="nova-nav-icon">
                <BookOpenText size={16} />
              </span>
              <span className="nova-nav-text">
                <strong>Dictionary</strong>
                <small>Word-level depth</small>
              </span>
            </button>
          </div>

          <div className="nova-control-card">
            <span className="nova-label">Response style</span>
            <div className="nova-style-grid">
              <Button
                size="sm"
                variant={responseStyle === "formal" ? "primary" : "secondary"}
                onClick={() => setResponseStyle("formal")}
              >
                Formal
              </Button>
              <Button
                size="sm"
                variant={responseStyle === "balanced" ? "primary" : "secondary"}
                onClick={() => setResponseStyle("balanced")}
              >
                Balanced
              </Button>
              <Button
                size="sm"
                variant={responseStyle === "casual" ? "primary" : "secondary"}
                onClick={() => setResponseStyle("casual")}
              >
                Casual
              </Button>
            </div>
          </div>

          <div className="nova-control-card">
            <span className="nova-label">Quick controls</span>
            <Button
              type="button"
              size="md"
              variant="secondary"
              leftIcon={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              onClick={toggleTheme}
            >
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </Button>

            <Button
              type="button"
              size="md"
              variant={listening ? "danger" : "secondary"}
              leftIcon={listening ? <X size={16} /> : <Mic size={16} />}
              onClick={startListening}
              disabled={requestInFlight}
            >
              {listening ? "Listening" : "Voice input"}
            </Button>
          </div>

          <div className="nova-control-card">
            <span className="nova-label">Favorites</span>
            {favoritePreview.length === 0 ? (
              <p className="nova-muted">Saved translations will appear here.</p>
            ) : (
              <div className="nova-favorites">
                {favoritePreview.map((item, index) => (
                  <button
                    key={`${item}-${index}`}
                    className="nova-favorite-item"
                    type="button"
                    onClick={() => {
                      setTranslatedText(item);
                      setMode("translation");
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="nova-control-card">
            <span className="nova-label">Administration</span>
            <Link href="/admin" className="btn btn-secondary btn-md" style={{ textDecoration: "none" }}>
              Open Knowledge Panel
            </Link>
          </div>
        </aside>

        <section className="nova-main">
          <header className="nova-topbar">
            <div className="nova-topbar-title-wrap">
              <div className="thor-v2-badge">ThorAI Hybrid Router v2</div>
              <div className="nova-kicker">
                <LayoutDashboard size={14} />
                Active module
              </div>
              <div className="nova-topbar-title">{getViewTitle()}</div>
              <div className="nova-topbar-subtitle">{getViewSubtitle()}</div>
            </div>

            <div className="nova-command-box" aria-hidden="true">
              <Search size={15} />
              <span>Search actions</span>
              <kbd>
                <Command size={12} />K
              </kbd>
            </div>

            <div className="nova-topbar-actions">
              <div className="nova-chip">
                <Globe2 size={14} />
                {getDirectionLabel()}
              </div>
              <div className="nova-chip nova-chip-status">
                <ShieldCheck size={14} />
                {requestInFlight ? "Synchronizing" : "Ready"}
              </div>
              <div className="nova-chip">
                Intent: {lastIntent}
              </div>
              <div className="nova-chip">
                Provider: {lastProvider}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={clearCurrentMode}>
                Clear view
              </Button>
            </div>
          </header>

          {requestInFlight ? (
            <div className="nova-progress" aria-hidden="true">
              <div className="nova-progress-bar" />
            </div>
          ) : null}

          <div className="nova-workbench">
            {mode === "chat" ? (
              <section className="panel nova-chat-panel fade-in">
                <div className="panel-head">
                  <h3>Conversation stream</h3>
                  <div className="nova-meta-row">
                    <span className="nova-chip">{messages.length} messages</span>
                    <span className="nova-chip">Style: {responseStyle}</span>
                    <span className="nova-chip">
                      <History size={14} /> Live context
                    </span>
                  </div>
                </div>

                <div className="chat-log" ref={chatLogRef}>
                  {messages.length === 0 ? (
                    <div className="empty-state nova-empty-state">
                      <Stars size={22} />
                      <div>
                        <strong>Start a high-context conversation</strong>
                        <p>Ask for translations, summaries, language drills or nuanced explanations.</p>
                      </div>
                    </div>
                  ) : (
                    messages.map((msg, index) => (
                      <MessageBubble key={`${msg.role}-${index}`} role={msg.role} content={msg.content} />
                    ))
                  )}

                  {requestInFlight ? (
                    <div className="message-row message-row-assistant">
                      <div className="message-bubble message-bubble-assistant" aria-hidden="true">
                        <Skeleton height={14} width="180px" />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="nova-chat-composer">
                  <label className="field-label" htmlFor="chat-input">
                    Compose
                    <textarea
                      id="chat-input"
                      className="text-area"
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !requestInFlight) {
                          event.preventDefault();
                          void askAI(undefined, false);
                        }
                      }}
                      placeholder="Write a prompt. Shift+Enter for a new line."
                      aria-label="Chat message input"
                    />
                  </label>

                  <div className="nova-composer-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      leftIcon={<Mic size={16} />}
                      onClick={startListening}
                      disabled={requestInFlight}
                    >
                      Dictate
                    </Button>

                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      leftIcon={<Send size={16} />}
                      onClick={() => {
                        if (requestInFlight) return;
                        void askAI(undefined, false);
                      }}
                      disabled={requestInFlight}
                      loading={requestInFlight}
                    >
                      Send
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            {mode === "translation" ? (
              <section className="nova-grid fade-in">
                <section className="panel nova-editor-card">
                  <div className="panel-head">
                    <h3>Translation console</h3>
                    <div className="nova-meta-row">
                      <span className="nova-chip">{getDirectionLabel()}</span>
                      <span className="nova-chip">{favorites.length} favorites</span>
                    </div>
                  </div>

                  <div className="nova-card-body">
                    <div className="translation-grid">
                      <label className="field-label" htmlFor="source-language">
                        Source language
                        <select
                          id="source-language"
                          className="select"
                          value={sourceLanguage}
                          onChange={(event) => setSourceLanguage(event.target.value)}
                          aria-label="Source language"
                        >
                          <option value="auto">Auto detect</option>
                          {languages.map((language) => (
                            <option key={language.code} value={language.code}>
                              {language.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field-label" htmlFor="target-language">
                        Target language
                        <select
                          id="target-language"
                          className="select"
                          value={targetLanguage}
                          onChange={(event) => setTargetLanguage(event.target.value)}
                          aria-label="Target language"
                        >
                          {languages.map((language) => (
                            <option key={language.code} value={language.code}>
                              {language.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="field-label" htmlFor="source-language">
                      Input text
                      <textarea
                        id="translation-source"
                        className="text-area"
                        value={sourceText}
                        onChange={(event) => setSourceText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey && !requestInFlight) {
                            event.preventDefault();
                            void handleTranslationSubmit();
                          }
                        }}
                        placeholder="Paste or dictate a sentence, note or paragraph."
                        aria-label="Translation source input"
                      />
                    </label>

                    <div className="inline-actions">
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        leftIcon={<Languages size={16} />}
                        onClick={() => {
                          void handleTranslationSubmit();
                        }}
                        disabled={requestInFlight}
                        loading={requestInFlight}
                      >
                        Translate
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        leftIcon={<Globe2 size={16} />}
                        onClick={() => {
                          void retranslatePrevious();
                        }}
                        disabled={!lastTranslation || requestInFlight}
                      >
                        Re-translate
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        leftIcon={<Mic size={16} />}
                        onClick={startListening}
                        disabled={requestInFlight}
                      >
                        Voice translate
                      </Button>
                    </div>
                  </div>
                </section>

                <section className="nova-stack">
                  <TranslationResultCard
                    title="Result"
                    value={translatedText}
                    loading={requestInFlight && translatedText === "Translating..."}
                    isFavorite={isTranslationFavorite}
                    onCopy={() => {
                      void copyTranslation();
                    }}
                    onShare={() => {
                      void shareTranslation();
                    }}
                    onFavorite={toggleFavoriteTranslation}
                    onListen={playTranslatedResult}
                  />

                  <section className="panel nova-playback-card">
                    <div className="panel-head">
                      <h3>Playback controls</h3>
                      <span className="nova-chip">Output voice</span>
                    </div>
                    <div className="nova-card-body">
                      <div className="inline-actions">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          leftIcon={<Play size={14} />}
                          onClick={playTranslatedResult}
                          disabled={!translatedText.trim() || translatedText.startsWith("Error:")}
                        >
                          Play
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          leftIcon={<Pause size={14} />}
                          onClick={pausePlayback}
                          disabled={!isSpeaking || isPaused}
                        >
                          Pause
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          leftIcon={<Play size={14} />}
                          onClick={resumePlayback}
                          disabled={!isPaused}
                        >
                          Resume
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          leftIcon={<X size={14} />}
                          onClick={stopPlayback}
                        >
                          Stop
                        </Button>
                      </div>
                    </div>
                  </section>
                </section>
              </section>
            ) : null}

            {mode === "dictionary" ? (
              <section className="nova-grid fade-in">
                <section className="panel nova-editor-card">
                  <div className="panel-head">
                    <h3>Dictionary lookup</h3>
                    <span className="nova-chip">One word only</span>
                  </div>

                  <div className="nova-card-body">
                    <label className="field-label" htmlFor="dictionary-input">
                      Word
                      <input
                        id="dictionary-input"
                        className="text-input"
                        value={dictionaryInput}
                        onChange={(event) => setDictionaryInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !requestInFlight) {
                            event.preventDefault();
                            void handleDictionaryLookup();
                          }
                        }}
                        placeholder="house"
                      />
                    </label>

                    <div className="inline-actions">
                      <Button
                        type="button"
                        variant="primary"
                        leftIcon={<BookOpenText size={16} />}
                        onClick={() => {
                          void handleDictionaryLookup();
                        }}
                        disabled={requestInFlight || dictionaryLoading}
                        loading={requestInFlight || dictionaryLoading}
                      >
                        Look up
                      </Button>
                    </div>

                    {dictionaryError ? <div className="empty-state">{dictionaryError}</div> : null}

                    {dictionaryLoading ? (
                      <div className="panel nova-loading-panel">
                        <Skeleton height={14} width="52%" />
                        <Skeleton height={14} />
                        <Skeleton height={14} width="88%" />
                        <Skeleton height={14} width="67%" />
                      </div>
                    ) : null}

                    {dictionaryResult ? (
                      <div className="translation-output panel">{dictionaryResult}</div>
                    ) : null}
                  </div>
                </section>

                <section className="panel nova-info-card">
                  <div className="panel-head">
                    <h3>Lookup tips</h3>
                    <span className="nova-chip">Editorial mode</span>
                  </div>
                  <div className="nova-card-body">
                    <ul className="nova-tips-list">
                      <li>Use singular forms for cleaner lexical entries.</li>
                      <li>Try short nouns or verbs to get richer examples.</li>
                      <li>Switch to translation mode for full sentence context.</li>
                    </ul>
                  </div>
                </section>
              </section>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
