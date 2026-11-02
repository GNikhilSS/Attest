export const LANGUAGE_ID_MAP: Record<string, number> = {
  // Python
  python: 71,
  python3: 71,
  "python 3": 71,
  "python scripting": 71,
  "python script": 71,

  // JavaScript / Node
  javascript: 63,
  js: 63,
  node: 63,
  nodejs: 63,
  "node.js": 63,

  // TypeScript
  typescript: 74,
  ts: 74,

  // Java
  java: 62,

  // C / C++
  c: 50,
  cpp: 54,
  "c++": 54,
  "c plus plus": 54,

  // C#
  csharp: 51,
  "c#": 51,
  dotnet: 51,
  ".net": 51,

  // Go
  go: 60,
  golang: 60,

  // Rust
  rust: 73,

  // Ruby
  ruby: 72,

  // PHP
  php: 68,

  // SQL
  sql: 82,
  sqlite: 82,

  // Bash
  bash: 46,
  shell: 46,
};

export const DEFAULT_LANGUAGE_ID = 71; // Default to Python 3 if unspecified

export function resolveLanguageId(skillOrLanguage?: string | null): number {
  if (!skillOrLanguage || typeof skillOrLanguage !== "string") {
    const configured = process.env.JUDGE0_LANGUAGE_ID?.trim();
    if (configured && Number.isInteger(Number(configured)) && Number(configured) > 0) {
      return Number(configured);
    }
    return DEFAULT_LANGUAGE_ID;
  }

  const normalized = skillOrLanguage.trim().toLowerCase();
  if (LANGUAGE_ID_MAP[normalized]) {
    return LANGUAGE_ID_MAP[normalized];
  }

  // Partial matches (e.g. "Python 3.8", "Node.js (v14)")
  for (const [key, id] of Object.entries(LANGUAGE_ID_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return id;
    }
  }

  const configured = process.env.JUDGE0_LANGUAGE_ID?.trim();
  if (configured && Number.isInteger(Number(configured)) && Number(configured) > 0) {
    return Number(configured);
  }

  return DEFAULT_LANGUAGE_ID;
}

