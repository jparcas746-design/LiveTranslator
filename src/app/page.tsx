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
  const [translatedText, setTranslatedText] = useState("Translation preview will appear here.");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("en");

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

  function speak(text: string) {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance =
      new SpeechSynthesisUtterance(text);

    utterance.lang =
      navigator.language || "es-ES";

    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
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
        speak(translation);
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
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
              </label>
              <label style={{ color: "#e2e8f0", fontSize: "16px" }}>
                Target language
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  style={{ display: "block", marginTop: "6px", padding: "8px", borderRadius: "8px" }}
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
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
              <textarea
                value={translatedText}
                readOnly
                style={{
                  width: "100%",
                  minHeight: "120px",
                  marginTop: "8px",
                  padding: "12px",
                  borderRadius: "10px",
                  fontSize: "18px",
                  resize: "vertical",
                  background: "#1f2937",
                  color: "#f8fafc",
                }}
              />
            </label>
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
        ) : (
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleTranslationSubmit();
              }
            }}
            placeholder="Type text to translate..."
            style={{
              width: "100%",
              height: "100px",
              padding: "15px",
              borderRadius: "10px",
              fontSize: "20px",
              resize: "none",
            }}
          />
        )}

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