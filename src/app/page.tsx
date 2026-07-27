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

      // Voz: manda directamente y activa respuesta hablada
      askAI(transcript, true);
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
          text: finalText,
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

        <button
          onClick={startListening}
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
          {listening
            ? "🎙️ Escuchando..."
            : "🎤 Hablar"}
        </button>

        <button
          onClick={() => askAI(undefined, false)}
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
          Enviar ⚡
        </button>
      </div>
    </main>
  );
}