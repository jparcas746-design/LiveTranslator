import type { ThorIntent } from "@/ai/intents";

export type LocalResponseContext = {
  historyCount?: number;
  preferredLanguage?: string;
};

const LOCAL_RESPONSES: Record<ThorIntent, string[]> = {
  GREETING: [
    "Hola. Soy ThorAI. Puedo ayudarte con chat, traduccion y diccionario sin demoras.",
    "Hey. ThorAI listo para ayudarte. Dime que necesitas.",
    "Hola, que bueno verte por aqui. En que te ayudo hoy?",
  ],
  HELP: [
    "Puedo ayudarte con traducciones, definiciones, explicaciones y correcciones. Tambien acepto comandos como: abrir ajustes, activar modo oscuro y mostrar historial.",
    "Aqui va una guia rapida: 1) Chat inteligente 2) Traduccion 3) Diccionario 4) Comandos internos como borrar historial o limpiar conversacion.",
    "Estas son mis funciones principales: conversaciones con contexto, traduccion multilenguaje, diccionario educativo y comandos rapidos de control.",
  ],
  THANKS: [
    "Con gusto. Si quieres, seguimos con la siguiente tarea.",
    "Perfecto. Aqui estoy para ayudarte cuando quieras.",
    "De nada. Continuamos cuando tu digas.",
  ],
  GOODBYE: [
    "Hasta luego. Fue un gusto ayudarte.",
    "Nos vemos. Cuando regreses, retomamos donde quedamos.",
    "Adios. Que tengas un gran dia.",
  ],
  SETTINGS: [
    "Puedes cambiar tema e idioma desde ajustes. Tambien puedes usar comandos: activar modo oscuro, activar modo claro o cambiar idioma.",
    "La configuracion esta lista para comandos rapidos. Prueba: abrir ajustes o cambiar idioma a en-US.",
    "Para personalizar la app, usa ajustes o comandos internos de tema e idioma.",
  ],
  HISTORY: [
    "Puedo mostrar el historial reciente. Escribe: mostrar historial.",
    "Si quieres revisar la conversacion, ejecuta el comando mostrar historial.",
    "Tengo memoria de contexto activa. Pide mostrar historial para ver los ultimos turnos.",
  ],
  COMMAND: [
    "Listo. Estoy preparado para ejecutar comandos internos.",
  ],
  TRANSLATE: [
    "Puedo traducir eso. Si es una traduccion avanzada, usare el mejor modelo disponible.",
  ],
  DICTIONARY: [
    "Puedo darte una entrada de diccionario clara y estructurada para esa palabra.",
  ],
  GRAMMAR: [
    "Puedo corregir gramatica y explicarte el por que de cada ajuste.",
  ],
  SMALL_TALK: [
    "Todo bien por aqui. Listo para ayudarte con algo util.",
    "Estoy genial y en modo productivo. Que quieres resolver ahora?",
    "Con energia y foco. Vamos con tu siguiente objetivo.",
  ],
  AI: [
    "Esta consulta requiere razonamiento avanzado. Voy a usar IA para darte una respuesta completa.",
  ],
  UNKNOWN: [
    "No estoy seguro de tu intencion aun. Puedes reformular o pedirme ayuda para ver ejemplos.",
  ],
};

function pickVariant(options: string[]) {
  if (!options.length) {
    return "Estoy listo para ayudarte.";
  }

  const index = Math.floor(Math.random() * options.length);
  return options[index] || options[0];
}

export function getLocalResponse(intent: ThorIntent, context: LocalResponseContext = {}) {
  const base = pickVariant(LOCAL_RESPONSES[intent] || LOCAL_RESPONSES.UNKNOWN);

  if (intent === "HISTORY" && typeof context.historyCount === "number") {
    return `${base} Hay ${context.historyCount} mensajes en el historial local de esta sesion.`;
  }

  if (intent === "SETTINGS" && context.preferredLanguage) {
    return `${base} Idioma preferido actual: ${context.preferredLanguage}.`;
  }

  return base;
}

export const COMMAND_HELP_TEXT = [
  "Comandos disponibles:",
  "- abrir ajustes",
  "- cambiar idioma a en-US",
  "- activar modo oscuro",
  "- activar modo claro",
  "- borrar historial",
  "- mostrar historial",
  "- copiar ultimo resultado",
  "- limpiar conversacion",
].join("\n");
