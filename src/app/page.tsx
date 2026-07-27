"use client";

import { useState } from "react";

export default function HomePage() {
  const [text, setText] = useState("");
  const [response, setResponse] = useState("");

  async function askAI() {
    if (!text.trim()) return;

    setResponse("Thor está pensando... ⚡");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();

      if (data.response) {
        setResponse(data.response);
      } else {
        setResponse("Ha ocurrido un error.");
      }
    } catch {
      setResponse("Error de conexión.");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "800px",
          background: "#1e293b",
          padding: "40px",
          borderRadius: "20px",
          boxShadow: "0 0 25px rgba(0,0,0,0.4)",
        }}
      >
        <h1
          style={{
            color: "white",
            textAlign: "center",
            fontSize: "48px",
            marginBottom: "10px",
          }}
        >
          ⚡ ThorAI
        </h1>

        <p
          style={{
            color: "#94a3b8",
            textAlign: "center",
            fontSize: "20px",
            marginBottom: "25px",
          }}
        >
          Tu asistente virtual inteligente
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pregúntame cualquier cosa..."
          style={{
            width: "100%",
            height: "180px",
            padding: "20px",
            fontSize: "22px",
            borderRadius: "10px",
            resize: "none",
          }}
        />

        <button
          onClick={askAI}
          style={{
            width: "100%",
            marginTop: "20px",
            padding: "18px",
            fontSize: "24px",
            cursor: "pointer",
            borderRadius: "10px",
            border: "none",
            background: "#2563eb",
            color: "white",
            fontWeight: "bold",
          }}
        >
          Preguntar a Thor ⚡
        </button>

        <div
          style={{
            marginTop: "30px",
            background: "#334155",
            padding: "20px",
            borderRadius: "10px",
            minHeight: "150px",
            color: "white",
            fontSize: "22px",
            whiteSpace: "pre-wrap",
          }}
        >
          {response}
        </div>
      </div>
    </main>
  );
}