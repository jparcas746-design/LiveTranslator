export type ThorIntent =
  | "GREETING"
  | "HELP"
  | "THANKS"
  | "GOODBYE"
  | "SETTINGS"
  | "HISTORY"
  | "COMMAND"
  | "TRANSLATE"
  | "DICTIONARY"
  | "GRAMMAR"
  | "SMALL_TALK"
  | "AI"
  | "UNKNOWN";

export type DetectIntentInput = {
  message: string;
  translationMode?: boolean;
  dictionaryMode?: boolean;
};

const COMMAND_PATTERNS: RegExp[] = [
  /\b(abrir|open)\s+(ajustes|configuracion|settings)\b/i,
  /\b(cambiar|change)\s+(idioma|language)\b/i,
  /\b(activar|enable|poner|set)\s+(modo\s+)?(oscuro|dark)\b/i,
  /\b(activar|enable|poner|set)\s+(modo\s+)?(claro|light)\b/i,
  /\bmodo\s+oscuro\b/i,
  /\bmodo\s+claro\b/i,
  /\b(borrar|eliminar|limpiar|clear)\s+(historial|history)\b/i,
  /\b(mostrar|ver|show)\s+(historial|history)\b/i,
  /\b(copiar|copy)\s+(ultimo|ultima|last)\s+(resultado|response|reply)\b/i,
  /\b(limpiar|clear)\s+(conversacion|conversaci[oó]n|chat)\b/i,
];

const INTENT_RULES: Array<{ intent: ThorIntent; patterns: RegExp[] }> = [
  {
    intent: "GREETING",
    patterns: [
      /\b(hola|hello|hey|buenas|good\s+morning|good\s+afternoon|good\s+evening)\b/i,
    ],
  },
  {
    intent: "THANKS",
    patterns: [/\b(gracias|thank\s*you|thanks|thx|muchas\s+gracias)\b/i],
  },
  {
    intent: "GOODBYE",
    patterns: [/\b(adios|adi|bye|goodbye|nos\s+vemos|see\s+you|hasta\s+luego)\b/i],
  },
  {
    intent: "HELP",
    patterns: [
      /\b(ayuda|help|que\s+puedes\s+hacer|puedes\s+hacer|what\s+can\s+you\s+do|comandos|commands?)\b/i,
    ],
  },
  {
    intent: "SETTINGS",
    patterns: [
      /\b(ajustes|configuracion|configur|settings|preferencias|preferences|modo\s+oscuro|modo\s+claro|dark\s+mode|light\s+mode|idioma\s+de\s+la\s+app|app\s+language)\b/i,
    ],
  },
  {
    intent: "HISTORY",
    patterns: [/\b(historial|history|mensajes\s+anteriores|previous\s+messages)\b/i],
  },
  {
    intent: "DICTIONARY",
    patterns: [
      /\b(diccionario|dictionary|define|definition|significado|meaning|sinonimo|antonimo|synonym|antonym)\b/i,
    ],
  },
  {
    intent: "GRAMMAR",
    patterns: [
      /\b(gramatica|grammar|corrige|correct\s+my\s+sentence|fix\s+my\s+grammar)\b/i,
    ],
  },
  {
    intent: "TRANSLATE",
    patterns: [
      /\b(traduce|translate|translation|como\s+se\s+dice|how\s+do\s+you\s+say)\b/i,
    ],
  },
  {
    intent: "SMALL_TALK",
    patterns: [
      /\b(como\s+estas|how\s+are\s+you|quien\s+eres|who\s+are\s+you|que\s+tal|what\s+is\s+up)\b/i,
    ],
  },
];

const AI_HINT_PATTERNS: RegExp[] = [
  /\b(explica|explicame|explic|expl|explain|analiza|analyze|resume|summari[sz]e|reformula|rephrase|rewrite|opinion|por\s+que|why|how\s+does|how\s+to|what\s+if|chat|conversation|conversacion)\b/i,
];

function normalizeWhitespace(value: string) {
  const repairedEncoding = value
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Â¿/g, "¿")
    .replace(/Â¡/g, "¡");

  const withoutDiacritics = repairedEncoding
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return withoutDiacritics
    .toLowerCase()
    .replace(/[¿?¡!.,;:()\[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function detectIntent(input: DetectIntentInput): ThorIntent {
  if (input.translationMode) {
    return "TRANSLATE";
  }

  if (input.dictionaryMode) {
    return "DICTIONARY";
  }

  const message = normalizeWhitespace(input.message || "");
  if (!message) {
    return "HELP";
  }

  if (hasAnyPattern(message, COMMAND_PATTERNS)) {
    return "COMMAND";
  }

  const matched = INTENT_RULES.find((rule) => hasAnyPattern(message, rule.patterns));
  if (matched) {
    return matched.intent;
  }

  if (hasAnyPattern(message, AI_HINT_PATTERNS)) {
    return "AI";
  }

  return "UNKNOWN";
}

export function isSimpleLocalIntent(intent: ThorIntent) {
  return (
    intent === "GREETING" ||
    intent === "HELP" ||
    intent === "THANKS" ||
    intent === "GOODBYE" ||
    intent === "SETTINGS" ||
    intent === "HISTORY" ||
    intent === "SMALL_TALK"
  );
}
