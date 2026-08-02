export type SignipediaCategoryId =
  | "mathematics"
  | "chemistry"
  | "biology"
  | "religion"
  | "astronomy"
  | "currency"
  | "computing"
  | "traffic"
  | "heraldry"
  | "alchemy"
  | "runes";

export type SignipediaCategory = {
  id: SignipediaCategoryId;
  label: string;
  description: string;
};

export type SignipediaSymbol = {
  slug: string;
  name: string;
  glyph: string;
  categoryId: SignipediaCategoryId;
  meaning: string;
  history: string;
  origin: string;
  currentUses: string;
  variants: string[];
  curiosities: string[];
  relatedSlugs: string[];
  aliases: string[];
  keywords: string[];
  synonyms?: string[];
  featured?: boolean;
};

export const signipediaCategories: SignipediaCategory[] = [
  {
    id: "mathematics",
    label: "Matemáticas",
    description: "Notación, lógica, cálculo y estructuras formales.",
  },
  {
    id: "chemistry",
    label: "Química",
    description: "Elementos, laboratorio y señales de seguridad científica.",
  },
  {
    id: "biology",
    label: "Biología",
    description: "Vida, evolución, anatomía y bioseguridad.",
  },
  {
    id: "religion",
    label: "Religión",
    description: "Símbolos de fe, rito y tradición espiritual.",
  },
  {
    id: "astronomy",
    label: "Astronomía",
    description: "Astros, ciclos celestes y cartografía del cielo.",
  },
  {
    id: "currency",
    label: "Monedas",
    description: "Símbolos monetarios, divisas y representaciones financieras.",
  },
  {
    id: "computing",
    label: "Informática",
    description: "Iconos de interfaces, atajos y cultura digital.",
  },
  {
    id: "traffic",
    label: "Señales",
    description: "Símbolos normativos y lenguaje vial universal.",
  },
  {
    id: "heraldry",
    label: "Heráldica",
    description: "Emblemas históricos, blasones y linajes visuales.",
  },
  {
    id: "alchemy",
    label: "Alquimia",
    description: "Diagramas antiguos de transformación y materia.",
  },
  {
    id: "runes",
    label: "Runas",
    description: "Alfabetos germánicos, escritura y uso ritual.",
  },
];

export const signipediaSymbols: SignipediaSymbol[] = [
  {
    slug: "sumatoria",
    name: "Sigma de sumatoria",
    glyph: "∑",
    categoryId: "mathematics",
    meaning: "Representa la suma de una secuencia o familia de términos.",
    history: "La sigma mayúscula comenzó a usarse como símbolo de suma en la matemática moderna para condensar expresiones largas y repetitivas.",
    origin: "Deriva de la letra griega sigma, adoptada por su relación visual con la idea de agregar elementos en serie.",
    currentUses: "Aparece en álgebra, estadística, análisis numérico y documentación técnica.",
    variants: ["∑", "Σ"],
    curiosities: ["Su forma se volvió una abreviatura visual de ideas acumulativas.", "En tipografía científica suele aparecer con límites superior e inferior."],
    relatedSlugs: ["infinito", "pi", "omega"],
    aliases: ["sigma", "sumatoria"],
    keywords: ["suma", "serie", "matemática", "álgebra"],
    featured: true,
  },
  {
    slug: "infinito",
    name: "Infinito",
    glyph: "∞",
    categoryId: "mathematics",
    meaning: "Expresa una magnitud sin límite o sin final conocido.",
    history: "Popularizado en el siglo XVII, se convirtió en un símbolo esencial para el cálculo y la filosofía matemática.",
    origin: "Su trazado continuo sugiere un ciclo que no se interrumpe, una imagen útil para representar lo ilimitado.",
    currentUses: "Se usa en matemáticas, diseño, joyería, cultura popular y explicaciones sobre límites.",
    variants: ["∞"],
    curiosities: ["A menudo se llama lemniscata.", "En branding suele asociarse con continuidad y permanencia."],
    relatedSlugs: ["sumatoria", "omega", "atomo"],
    aliases: ["lemniscata", "símbolo de infinito"],
    keywords: ["sin límite", "continuidad", "matemática", "ciclo"],
    featured: true,
  },
  {
    slug: "pi",
    name: "Pi",
    glyph: "π",
    categoryId: "mathematics",
    meaning: "Razón entre la longitud de una circunferencia y su diámetro.",
    history: "Fue adoptado como notación estándar en el siglo XVIII y hoy es uno de los símbolos más reconocibles de las ciencias.",
    origin: "Proviene de la primera letra de la palabra griega para perímetro y quedó fijado por tradición matemática.",
    currentUses: "Aparece en geometría, física, ingeniería, software y divulgación científica.",
    variants: ["π"],
    curiosities: ["Se celebra el Pi Day el 14 de marzo.", "Es un símbolo matemático convertido en icono cultural."],
    relatedSlugs: ["sumatoria", "infinito", "atomo"],
    aliases: ["pi"],
    keywords: ["círculo", "geometría", "constante", "matemática"],
  },
  {
    slug: "atomo",
    name: "Símbolo del átomo",
    glyph: "⚛",
    categoryId: "chemistry",
    meaning: "Representa la estructura de la materia y la física atómica.",
    history: "Se convirtió en un emblema moderno de la ciencia del siglo XX, especialmente ligado a divulgación y tecnología.",
    origin: "La imagen estilizada de órbitas y núcleo sintetiza la idea de un sistema atómico en una sola figura.",
    currentUses: "Se usa en química, física, divulgación científica y señalética educativa.",
    variants: ["⚛"],
    curiosities: ["Su diseño es una convención moderna, no un símbolo histórico antiguo.", "En cultura popular suele representar conocimiento científico."],
    relatedSlugs: ["radioactivo", "pi", "biohazard"],
    aliases: ["átomo", "atom"],
    keywords: ["química", "física", "ciencia", "materia"],
    featured: true,
  },
  {
    slug: "radioactivo",
    name: "Radioactividad",
    glyph: "☢",
    categoryId: "chemistry",
    meaning: "Advierte sobre materiales o entornos con radiación ionizante.",
    history: "Nació como señal de advertencia en laboratorios y entornos nucleares para indicar peligro invisible.",
    origin: "Su forma radial extrema y alto contraste facilitan la identificación rápida en situaciones de riesgo.",
    currentUses: "Se usa en instalaciones científicas, medicina, transporte y protocolos de seguridad.",
    variants: ["☢"],
    curiosities: ["Su simplicidad visual lo volvió uno de los iconos de peligro más universales.", "Suele aparecer junto a código de color negro y amarillo."],
    relatedSlugs: ["biohazard", "atomo", "stop"],
    aliases: ["radioactivo", "radiación"],
    keywords: ["peligro", "seguridad", "laboratorio", "nuclear"],
  },
  {
    slug: "biohazard",
    name: "Biohazard",
    glyph: "☣",
    categoryId: "biology",
    meaning: "Indica un riesgo biológico o contaminación potencial.",
    history: "Fue diseñado en el siglo XX para etiquetar residuos y materiales infecciosos de forma inequívoca.",
    origin: "Su geometría modular fue creada para ser memorable y no confundirse con otras señales.",
    currentUses: "Se utiliza en laboratorios, hospitales, residuos peligrosos y protocolos de bioseguridad.",
    variants: ["☣"],
    curiosities: ["Es uno de los símbolos de seguridad más replicados del mundo.", "Su diseño se pensó para ser reconocible incluso a distancia."],
    relatedSlugs: ["radioactivo", "atomo", "doble-helice"],
    aliases: ["biohazard", "riesgo biológico"],
    keywords: ["biología", "seguridad", "contagio", "laboratorio"],
  },
  {
    slug: "doble-helice",
    name: "Doble hélice",
    glyph: "🧬",
    categoryId: "biology",
    meaning: "Representa la estructura del ADN y la genética moderna.",
    history: "Se volvió un símbolo popular tras la descripción de la estructura del ADN en el siglo XX.",
    origin: "La figura remite al giro espiralado de dos cadenas complementarias.",
    currentUses: "Aparece en biotecnología, medicina, educación científica y divulgación genética.",
    variants: ["🧬"],
    curiosities: ["Es uno de los símbolos científicos más recientes en uso masivo.", "Se asocia con herencia, datos biológicos y medicina personalizada."],
    relatedSlugs: ["biohazard", "atomo", "infinito"],
    aliases: ["ADN", "DNA"],
    keywords: ["genética", "biología", "ADN", "ciencia"],
  },
  {
    slug: "ankh",
    name: "Ankh",
    glyph: "☥",
    categoryId: "religion",
    meaning: "Símbolo egipcio de vida y continuidad espiritual.",
    history: "Se usó ampliamente en el antiguo Egipto como signo ligado a la vida, la protección y la inmortalidad.",
    origin: "Su forma combina una cruz con un asa superior, reinterpretada durante siglos en contextos religiosos y culturales.",
    currentUses: "Se ve en estudios de egiptología, diseño, joyería y referencias culturales al Egipto antiguo.",
    variants: ["☥"],
    curiosities: ["Se conoce como la llave de la vida.", "En iconografía moderna suele aparecer estilizado en blanco o dorado."],
    relatedSlugs: ["cross", "star-and-crescent", "fleur-de-lis"],
    aliases: ["ankh", "cruz ansada"],
    keywords: ["Egipto", "vida", "historia", "religión"],
    featured: true,
  },
  {
    slug: "cross",
    name: "Cruz latina",
    glyph: "✝",
    categoryId: "religion",
    meaning: "Símbolo central del cristianismo y de su tradición litúrgica.",
    history: "Su uso se consolidó como emblema cristiano a lo largo de la Antigüedad tardía y la Edad Media.",
    origin: "Representa la cruz asociada a la narrativa de la crucifixión y a la fe cristiana.",
    currentUses: "Aparece en templos, iconografía religiosa, tipografía y heráldica.",
    variants: ["✝", "✟"],
    curiosities: ["Tiene múltiples variantes regionales y litúrgicas.", "Su presencia es común tanto en arte sacro como en diseño editorial."],
    relatedSlugs: ["ankh", "star-and-crescent", "fleur-de-lis"],
    aliases: ["cruz", "cruz latina"],
    keywords: ["cristianismo", "fe", "religión", "símbolo"],
  },
  {
    slug: "star-and-crescent",
    name: "Estrella y creciente",
    glyph: "☪",
    categoryId: "religion",
    meaning: "Asociado a tradiciones culturales y religiosas del mundo islámico.",
    history: "Su uso como emblema se expandió en contextos históricos del Mediterráneo y luego se popularizó como símbolo identitario.",
    origin: "Combina una luna creciente con una estrella de cinco puntas en una sola composición visual.",
    currentUses: "Se utiliza en banderas, arquitectura, iconografía y contextos comunitarios.",
    variants: ["☪"],
    curiosities: ["No es un símbolo exclusivo de una sola escuela religiosa.", "Su lectura varía según país, época y contexto."],
    relatedSlugs: ["cross", "ankh", "sun"],
    aliases: ["luna y estrella", "estrella creciente"],
    keywords: ["islam", "religión", "cultura", "identidad"],
  },
  {
    slug: "sun",
    name: "Sol",
    glyph: "☉",
    categoryId: "astronomy",
    meaning: "Representa el astro rey y, en varios sistemas, el oro y la identidad solar.",
    history: "Apareció en astronomía, astrología y alquimia como una de las imágenes más antiguas de la humanidad.",
    origin: "El círculo con punto central es una forma histórica asociada al disco solar.",
    currentUses: "Se usa en mapas celestes, calendarios, astrología y símbolos culturales.",
    variants: ["☉"],
    curiosities: ["En alquimia se vinculaba con el oro.", "Es uno de los símbolos astronómicos más antiguos y persistentes."],
    relatedSlugs: ["moon", "omega", "silver"],
    aliases: ["sol"],
    keywords: ["astronomía", "astro", "cielo", "sol"],
  },
  {
    slug: "moon",
    name: "Luna",
    glyph: "☾",
    categoryId: "astronomy",
    meaning: "Representa la Luna y, por extensión, ciclos y luz nocturna.",
    history: "Acompaña a la iconografía astronómica desde la antigüedad y figura en cartas celestes y tradiciones simbólicas.",
    origin: "La forma de creciente es una representación simplificada del aspecto visible de la Luna.",
    currentUses: "Se utiliza en astronomía, calendarios, diseño y símbolos de observación nocturna.",
    variants: ["☾", "☽"],
    curiosities: ["Suele asociarse con cambio, feminidad o ciclos en distintas culturas.", "También aparece en banderas y escudos."],
    relatedSlugs: ["sun", "star-and-crescent", "runa-fehu"],
    aliases: ["luna"],
    keywords: ["astronomía", "luna", "ciclo", "cielo"],
  },
  {
    slug: "euro",
    name: "Euro",
    glyph: "€",
    categoryId: "currency",
    meaning: "Símbolo de la moneda común de gran parte de la Unión Europea.",
    history: "Fue introducido en el final del siglo XX para una identidad monetaria compartida.",
    origin: "Su diseño combina una E estilizada con líneas de estabilidad visual y reconocimiento rápido.",
    currentUses: "Se emplea en economía, banca, contabilidad y comercio internacional.",
    variants: ["€"],
    curiosities: ["Fue diseñado para funcionar bien tanto en impresión como en interfaces digitales.", "La forma y las barras sugieren estabilidad."],
    relatedSlugs: ["yen", "bitcoin", "ats"],
    aliases: ["euro"],
    keywords: ["dinero", "finanzas", "moneda", "economía"],
  },
  {
    slug: "yen",
    name: "Yen",
    glyph: "¥",
    categoryId: "currency",
    meaning: "Símbolo de la moneda japonesa y de algunas representaciones monetarias compartidas.",
    history: "Se consolidó como abreviatura monetaria internacional en documentos financieros y tipográficos.",
    origin: "Su forma procede de la letra Y con barras horizontales, una convención usada en símbolos monetarios.",
    currentUses: "Aparece en mercados, software, banca y señalética económica.",
    variants: ["¥"],
    curiosities: ["Comparte formas visuales con otros símbolos monetarios que usan barras.", "Es frecuente en listas de precios y conversiones de divisas."],
    relatedSlugs: ["euro", "bitcoin", "atlas"],
    aliases: ["yen"],
    keywords: ["moneda", "japón", "economía", "divisa"],
  },
  {
    slug: "command",
    name: "Command",
    glyph: "⌘",
    categoryId: "computing",
    meaning: "Atajo clave en interfaces de Apple para modificar y ejecutar comandos.",
    history: "Fue adoptado como símbolo de teclado para distinguir la tecla de comando de otras teclas modificadoras.",
    origin: "Su forma proviene de un icono usado en señalética nórdica y luego reinterpretado para teclados.",
    currentUses: "Se ve en teclados, manuales y atajos de productividad en macOS.",
    variants: ["⌘"],
    curiosities: ["Su forma tiene una historia curiosa entre iconografía nórdica y diseño de producto.", "Es uno de los símbolos de teclado más reconocibles."],
    relatedSlugs: ["option", "gear", "hashtag"],
    aliases: ["command", "cmd"],
    keywords: ["teclado", "macOS", "atajo", "informática"],
    featured: true,
  },
  {
    slug: "gear",
    name: "Engranaje",
    glyph: "⚙",
    categoryId: "computing",
    meaning: "Representa configuración, control y funcionamiento interno.",
    history: "Pasó del mundo mecánico a la interfaz digital como metáfora de ajuste y sistema.",
    origin: "El engranaje simboliza mecanismos internos visibles y entendibles.",
    currentUses: "Aparece en menús de ajustes, software, automatización y herramientas.",
    variants: ["⚙", "⚙️"],
    curiosities: ["Es una de las metáforas más persistentes del software.", "Se usa incluso fuera de la informática como signo de proceso."],
    relatedSlugs: ["command", "hashtag", "stop"],
    aliases: ["settings", "gear"],
    keywords: ["configuración", "software", "sistema", "ajustes"],
  },
  {
    slug: "stop",
    name: "Stop",
    glyph: "⛔",
    categoryId: "traffic",
    meaning: "Señal de prohibición o detención obligatoria.",
    history: "Forma parte del lenguaje vial moderno y de la señalización de seguridad.",
    origin: "El contraste fuerte y el color de advertencia lo convierten en un símbolo de restricción inmediata.",
    currentUses: "Se usa en carreteras, accesos, software y avisos de bloqueo.",
    variants: ["⛔"],
    curiosities: ["En interfaces también comunica una acción bloqueada o cancelada.", "Su lectura es casi inmediata en múltiples culturas."],
    relatedSlugs: ["radioactivo", "biohazard", "gear"],
    aliases: ["stop", "prohibido"],
    keywords: ["tráfico", "prohibición", "seguridad", "señal"],
  },
  {
    slug: "fleur-de-lis",
    name: "Flor de lis",
    glyph: "⚜",
    categoryId: "heraldry",
    meaning: "Emblema histórico asociado a linajes, nobleza y tradición heráldica.",
    history: "Se usó en contextos reales y eclesiásticos, especialmente en Europa occidental.",
    origin: "La flor estilizada se convirtió en una forma heráldica de gran difusión simbólica.",
    currentUses: "Se ve en escudos, ciudades, clubes, productos y arte decorativo.",
    variants: ["⚜"],
    curiosities: ["Su significado cambia con el país y el periodo histórico.", "Es un motivo recurrente en arquitectura y diseño ornamental."],
    relatedSlugs: ["cross", "ankh", "runa-fehu"],
    aliases: ["fleur-de-lis", "flor de lis"],
    keywords: ["heráldica", "nobleza", "escudo", "emblema"],
  },
  {
    slug: "alchemical-mercury",
    name: "Mercurio alquímico",
    glyph: "☿",
    categoryId: "alchemy",
    meaning: "Asociado al mercurio, a la transformación y al principio mutable.",
    history: "La alquimia medieval lo vinculó con la materia cambiante, la transmutación y los metales.",
    origin: "Su forma combina rasgos circulares y cruzados que condensan conceptos de energía y cambio.",
    currentUses: "Se ve en estudios históricos, simbología esotérica y recopilaciones de símbolos antiguos.",
    variants: ["☿"],
    curiosities: ["El signo también quedó ligado al planeta Mercurio.", "Es un puente entre astronomía, alquimia y mitología."],
    relatedSlugs: ["sun", "moon", "fleur-de-lis"],
    aliases: ["mercurio", "alquimia"],
    keywords: ["alquimia", "mercurio", "transformación", "historia"],
  },
  {
    slug: "runa-fehu",
    name: "Runa Fehu",
    glyph: "ᚠ",
    categoryId: "runes",
    meaning: "Símbolo rúnico asociado a ganado, riqueza y prosperidad.",
    history: "Forma parte del alfabeto rúnico germánico, usado en inscripciones y tradición ritual.",
    origin: "La runa Fehu proviene de una tradición de escritura fonética y simbólica con fuerte carga cultural.",
    currentUses: "Aparece en estudios históricos, recreación cultural, diseño y prácticas neopaganas.",
    variants: ["ᚠ"],
    curiosities: ["Muchas runas tienen nombres que también describen ideas concretas.", "Su uso moderno suele combinar historia y reinterpretación simbólica."],
    relatedSlugs: ["runa-ansuz", "moon", "fleur-de-lis"],
    aliases: ["fehu"],
    keywords: ["runas", "nórdico", "escritura", "prosperidad"],
  },
  {
    slug: "runa-ansuz",
    name: "Runa Ansuz",
    glyph: "ᚨ",
    categoryId: "runes",
    meaning: "Runa vinculada al habla, la inspiración y la comunicación.",
    history: "Se relaciona con alfabetos germánicos antiguos y con interpretaciones posteriores de lo sagrado y la palabra.",
    origin: "Su forma angular respondía a la inscripción sobre piedra, madera o hueso.",
    currentUses: "Se estudia en filología, historia de las religiones y simbología contemporánea.",
    variants: ["ᚨ"],
    curiosities: ["Se asocia a la palabra y al aliento en varias tradiciones interpretativas.", "A menudo aparece junto a otras runas en series históricas."],
    relatedSlugs: ["runa-fehu", "command", "cross"],
    aliases: ["ansuz"],
    keywords: ["runas", "lenguaje", "historia", "comunicación"],
  },
];

const categoryLookup = new Map(signipediaCategories.map((category) => [category.id, category]));
const symbolLookup = new Map(signipediaSymbols.map((symbol) => [symbol.slug, symbol]));

export function getCategoryById(categoryId: SignipediaCategoryId) {
  return categoryLookup.get(categoryId) || null;
}

export function getSymbolBySlug(slug: string) {
  return symbolLookup.get(slug) || null;
}

export function getRelatedSymbols(symbol: SignipediaSymbol) {
  return symbol.relatedSlugs.map((slug) => symbolLookup.get(slug)).filter(Boolean) as SignipediaSymbol[];
}

export function getFeaturedSymbols() {
  return signipediaSymbols.filter((symbol) => symbol.featured);
}

export function searchSymbols(query: string, categoryId?: SignipediaCategoryId | "all") {
  const normalized = query.trim().toLowerCase();

  return signipediaSymbols.filter((symbol) => {
    if (categoryId && categoryId !== "all" && symbol.categoryId !== categoryId) {
      return false;
    }

    if (!normalized) {
      return true;
    }

    const haystack = [
      symbol.name,
      symbol.glyph,
      symbol.meaning,
      symbol.history,
      symbol.origin,
      symbol.currentUses,
      symbol.variants.join(" "),
      symbol.curiosities.join(" "),
      symbol.aliases.join(" "),
      symbol.keywords.join(" "),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

export function sortSymbols(symbols: SignipediaSymbol[], sortBy: "featured" | "name" | "category") {
  const list = [...symbols];

  if (sortBy === "name") {
    return list.sort((left, right) => left.name.localeCompare(right.name, "es"));
  }

  if (sortBy === "category") {
    return list.sort((left, right) => {
      const leftCategory = getCategoryById(left.categoryId)?.label || "";
      const rightCategory = getCategoryById(right.categoryId)?.label || "";
      const categoryComparison = leftCategory.localeCompare(rightCategory, "es");
      return categoryComparison || left.name.localeCompare(right.name, "es");
    });
  }

  return list.sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)) || left.name.localeCompare(right.name, "es"));
}

export function getCatalogStats() {
  return {
    symbolCount: signipediaSymbols.length,
    categoryCount: signipediaCategories.length,
    featuredCount: getFeaturedSymbols().length,
  };
}
