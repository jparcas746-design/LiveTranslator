"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

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

export default function HomePage() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);
  const [responseStyle, setResponseStyle] = useState<"formal" | "balanced" | "casual">("balanced");
  const [mode, setMode] = useState<"chat" | "translation">("chat");
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("en-US");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const languages = [
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
    { name: "Русский", code: "ru-RU" },
  ];

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Tu navegador no soporta reconocimiento de voz");
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = navigator.language || "es-ES";
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
    };

    recognition.onresult = (event: any) => {
      const transcript =
        event.results[0][0].transcript;

      if (mode === "translation") {
        handleTranslationSubmit(transcript, true);
      } else {
        askAI(transcript, true);
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
      "en": { preferredCodes: ["en-us", "en-gb", "en-au", "en-ca"], fallbackCodes: ["en"] },
      "es": { preferredCodes: ["es-es", "es-mx", "es-us", "es"], fallbackCodes: ["es"] },
      "fr": { preferredCodes: ["fr-fr", "fr-ca", "fr"], fallbackCodes: ["fr"] },
      "de": { preferredCodes: ["de-de", "de"], fallbackCodes: ["de"] },
      "it": { preferredCodes: ["it-it", "it"], fallbackCodes: ["it"] },
      "pt": { preferredCodes: ["pt-br", "pt-pt", "pt"], fallbackCodes: ["pt"] },
      "ja": { preferredCodes: ["ja-jp", "ja"], fallbackCodes: ["ja"] },
      "ko": { preferredCodes: ["ko-kr", "ko"], fallbackCodes: ["ko"] },
      "zh": { preferredCodes: ["zh-cn", "zh-hk", "zh-tw", "zh"], fallbackCodes: ["zh"] },
      "nl": { preferredCodes: ["nl-nl", "nl"], fallbackCodes: ["nl"] },
      "sv": { preferredCodes: ["sv-se", "sv"], fallbackCodes: ["sv"] },
      "ru": { preferredCodes: ["ru-ru", "ru"], fallbackCodes: ["ru"] },
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
        const matchesBase = profile.preferredCodes.some((code) => lang.startsWith(code)) || profile.fallbackCodes.some((code) => lang.startsWith(code));
        const matchesLanguageFamily = lang.startsWith(baseLanguage + "-") || lang.startsWith(baseLanguage);
        const isNatural = /natural|premium|neural|wave|universal|enhanced|female|male/i.test(name);
        const isGoogle = /google|siri|azure|amazon|polly|neural/i.test(name);
        const isDefault = /default/i.test(name);
        const isPreferredName = profile.preferredCodes.some((code) => name.includes(code.replace("-", "")));

        let score = 0;
        if (matchesExact) score += 120;
        if (matchesBase) score += 80;
        if (matchesLanguageFamily) score += 35;
        if (isGoogle) score += 20;
        if (isNatural) score += 15;
        if (isPreferredName) score += 10;
        if (isDefault) score += 5;

        return { voice, score };
      })
      .sort((a, b) => b.score - a.score);

    const preferredVoice = rankedVoices.find((entry) => entry.score >= 120);
    if (preferredVoice) {
      return preferredVoice.voice;
    }

    const fallbackVoice = rankedVoices.find((entry) => entry.score >= 80);
    if (fallbackVoice) {
      return fallbackVoice.voice;
    }

    const languageFamilyVoice = rankedVoices.find((entry) => entry.score >= 35);
    if (languageFamilyVoice) {
      return languageFamilyVoice.voice;
    }

    return rankedVoices[0]?.voice;
  }

  function speak(text: string, languageCode?: string) {
    if (!window.speechSynthesis || !text?.trim()) return;

    window.speechSynthesis.cancel();

    const utterance =
      new SpeechSynthesisUtterance(text);

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
      setIsSpeaking(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
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
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }

  function playTranslatedResult() {
    const trimmed = translatedText.trim();

    if (!trimmed || trimmed === "Translating..." || trimmed.startsWith("Error:")) {
      return;
    }

    const translationLanguage = getSpeechLanguageCode(targetLanguage);
    speak(trimmed, translationLanguage);
  }

  async function handleTranslationSubmit(textOverride?: string, fromVoice = false) {
    const trimmed = (textOverride ?? sourceText).trim();

    if (!trimmed) return;

    setSourceText(trimmed);
    setTranslatedText("Translating...");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: trimmed,
            },
          ],
          text: trimmed,
          responseStyle: responseStyle,
          translationMode: true,
          sourceLanguage,
          targetLanguage,
        }),
      });

      if (!res.ok) {
        throw new Error(`Error del servidor: ${res.status}`);
      }

      const data = await res.json();
      const translation = data.response || "No translation returned.";

      setTranslatedText(translation);

      if (fromVoice) {
        const translationLanguage = getSpeechLanguageCode(targetLanguage);
        speak(translation, translationLanguage);
      }
    } catch (error) {
      setTranslatedText("Error: " + String(error));
    }
  }

  async function askAI(
    messageText?: string,
    fromVoice = false
  ) {
    const finalText = messageText || text;

    if (!finalText.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: finalText,
    };

    const newMessages = [
      ...messages,
      userMessage,
    ];

    setMessages([
      ...newMessages,
      {
        role: "assistant",
        content: "Thor está pensando... ⚡",
      },
    ]);

    setText("");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: newMessages,
          responseStyle: responseStyle,
        }),
      });

      if (!res.ok) {
        throw new Error(
          `Error del servidor: ${res.status}`
        );
      }

      const data = await res.json();

      const aiResponse =
        data.response ||
        "ThorAI no devolvió respuesta.";

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: aiResponse,
        },
      ]);

      // Solo habla cuando viene del micrófono
      if (fromVoice) {
        speak(aiResponse);
      }

    } catch (error) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "Error: " + String(error),
        },
      ]);
    }
  }

  const hasTranslationToPlay = Boolean(
    translatedText.trim() &&
      translatedText !== "Translating..." &&
      !translatedText.startsWith("Error:")
  );

  const showAudioControls = mode === "translation" && hasTranslationToPlay;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        display: "flex",
        justifyContent: "center",
        padding: "40px",
      }}
    >
      <div
        style={{
          width: "800px",
          background: "#1e293b",
          borderRadius: "20px",
          padding: "30px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <h1
          style={{
            color: "white",
            textAlign: "center",
            fontSize: "48px",
          }}
        >
          ⚡ ThorAI
        </h1>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
          <div style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600, letterSpacing: "0.04em" }}>
            Response style
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setResponseStyle("formal")}
              title="Formal"
              style={{
                padding: "10px 15px",
                borderRadius: "10px",
                border: responseStyle === "formal" ? "2px solid #fbbf24" : "1px solid #475569",
                background: responseStyle === "formal" ? "#f59e0b" : "#334155",
                color: "white",
                cursor: "pointer",
                fontSize: "18px",
              }}
            >
              🎓
            </button>
            <button
              onClick={() => setResponseStyle("balanced")}
              title="Normal"
              style={{
                padding: "10px 15px",
                borderRadius: "10px",
                border: responseStyle === "balanced" ? "2px solid #34d399" : "1px solid #475569",
                background: responseStyle === "balanced" ? "#10b981" : "#334155",
                color: "white",
                cursor: "pointer",
                fontSize: "18px",
              }}
            >
              🙂
            </button>
            <button
              onClick={() => setResponseStyle("casual")}
              title="Casual"
              style={{
                padding: "10px 15px",
                borderRadius: "10px",
                border: responseStyle === "casual" ? "2px solid #fb923c" : "1px solid #475569",
                background: responseStyle === "casual" ? "#f97316" : "#334155",
                color: "white",
                cursor: "pointer",
                fontSize: "18px",
              }}
            >
              🔥
            </button>
            <button
              onClick={() => setMode(mode === "translation" ? "chat" : "translation")}
              title="Translation"
              style={{
                padding: "10px 15px",
                borderRadius: "10px",
                border: mode === "translation" ? "2px solid #60a5fa" : "1px solid #475569",
                background: mode === "translation" ? "#2563eb" : "#334155",
                color: "white",
                cursor: "pointer",
                fontSize: "18px",
              }}
            >
              🌎 Translation
            </button>
          </div>
        </div>

        {mode === "chat" ? (
          <div
            style={{
              height: "500px",
              overflowY: "auto",
              padding: "15px",
              background: "#0f172a",
              borderRadius: "15px",
            }}
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                style={{
                  marginBottom: "15px",
                  textAlign:
                    msg.role === "user"
                      ? "right"
                      : "left",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "15px",
                    borderRadius: "15px",
                    background:
                      msg.role === "user"
                        ? "#2563eb"
                        : "#334155",
                    color: "white",
                    maxWidth: "80%",
                    fontSize: "18px",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.role === "assistant" ? (
                    <ReactMarkdown>
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "15px",
              padding: "15px",
              background: "#0f172a",
              borderRadius: "15px",
            }}
          >
            <h2 style={{ color: "white", margin: 0, fontSize: "24px" }}>
              🌎 Translation Mode
            </h2>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <label style={{ color: "#e2e8f0", fontSize: "16px" }}>
                Source language
                <select
                  value={sourceLanguage}
                  onChange={(e) => setSourceLanguage(e.target.value)}
                  style={{ display: "block", marginTop: "6px", padding: "8px", borderRadius: "8px" }}
                >
                  <option value="auto">Auto Detect</option>
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ color: "#e2e8f0", fontSize: "16px" }}>
                Target language
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  style={{ display: "block", marginTop: "6px", padding: "8px", borderRadius: "8px" }}
                >
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ color: "#e2e8f0", fontSize: "16px" }}>
              Original text
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleTranslationSubmit();
                  }
                }}
                placeholder="Type or speak the text to translate..."
                style={{
                  width: "100%",
                  minHeight: "120px",
                  marginTop: "8px",
                  padding: "12px",
                  borderRadius: "10px",
                  fontSize: "18px",
                  resize: "vertical",
                }}
              />
            </label>
            <label style={{ color: "#e2e8f0", fontSize: "16px" }}>
              Translated text
              <div
                style={{
                  width: "100%",
                  minHeight: "120px",
                  marginTop: "8px",
                  padding: "12px",
                  borderRadius: "10px",
                  fontSize: "18px",
                  background: "#1f2937",
                  color: "#f8fafc",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {translatedText || "Translation preview will appear here."}
              </div>
            </label>
            {showAudioControls && (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  onClick={playTranslatedResult}
                  title="Play translated text"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #475569",
                    background: "#16a34a",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  ▶️ Play
                </button>
                <button
                  onClick={pausePlayback}
                  disabled={!isSpeaking || isPaused}
                  title="Pause playback"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #475569",
                    background: isSpeaking && !isPaused ? "#f59e0b" : "#334155",
                    color: "white",
                    cursor: isSpeaking && !isPaused ? "pointer" : "not-allowed",
                    opacity: isSpeaking && !isPaused ? 1 : 0.7,
                  }}
                >
                  ⏸️ Pause
                </button>
                <button
                  onClick={resumePlayback}
                  disabled={!isPaused}
                  title="Resume playback"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #475569",
                    background: isPaused ? "#3b82f6" : "#334155",
                    color: "white",
                    cursor: isPaused ? "pointer" : "not-allowed",
                    opacity: isPaused ? 1 : 0.7,
                  }}
                >
                  ▶️ Resume
                </button>
                <button
                  onClick={stopPlayback}
                  title="Stop playback"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #475569",
                    background: "#dc2626",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  ⏹️ Stop
                </button>
              </div>
            )}
          </div>
        )}

        {mode === "chat" ? (
          <textarea
            value={text}
            onChange={(e) =>
              setText(e.target.value)
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey
              ) {
                e.preventDefault();
                askAI(undefined, false);
              }
            }}
            placeholder="Escribe un mensaje..."
            style={{
              width: "100%",
              height: "100px",
              padding: "15px",
              borderRadius: "10px",
              fontSize: "20px",
              resize: "none",
            }}
          />
        ) : null}

        <button
          onClick={startListening}
          title="Start voice input"
          style={{
            padding: "15px",
            borderRadius: "10px",
            border: "none",
            background: listening
              ? "#dc2626"
              : "#16a34a",
            color: "white",
            fontSize: "22px",
            cursor: "pointer",
          }}
        >
          {listening ? "🔴🎤" : "🎤"}
        </button>

        <button
          onClick={() => {
            if (mode === "translation") {
              handleTranslationSubmit();
            } else {
              askAI(undefined, false);
            }
          }}
          title={mode === "translation" ? "Translate" : "Send message"}
          style={{
            padding: "15px",
            borderRadius: "10px",
            border: "none",
            background: "#2563eb",
            color: "white",
            fontSize: "22px",
            cursor: "pointer",
          }}
        >
          ⚡
        </button>
      </div>
    </main>
  );
}