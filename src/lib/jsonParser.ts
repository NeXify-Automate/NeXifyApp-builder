/**
 * NeXifyAI Builder - Robust JSON Parser
 * Extrahiert und validiert JSON aus Text-Responses
 */

/**
 * Extrahiert das erste vollständige JSON-Objekt aus einem Text
 * Behandelt verschachtelte Objekte korrekt
 */
export function extractJSON(text: string): string | null {
  let braceCount = 0;
  let startIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      if (startIndex === -1) {
        startIndex = i;
      }
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && startIndex !== -1) {
        return text.substring(startIndex, i + 1);
      }
    }
  }

  return null;
}

/**
 * Parst JSON mit besserer Fehlerbehandlung
 */
export function safeParseJSON<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error('JSON Parse Fehler:', error);
    return fallback;
  }
}

/**
 * Validiert ob ein Objekt alle erforderlichen Felder hat
 */
export function validateFields<T extends Record<string, any>>(
  obj: Partial<T>,
  requiredFields: (keyof T)[]
): obj is T {
  return requiredFields.every(field => {
    const value = obj[field];
    return value !== undefined && value !== null && value !== '';
  });
}

/**
 * Extrahiert und parst JSON aus einem Text-Response
 */
export function parseJSONFromText<T>(
  text: string,
  requiredFields: (keyof T)[],
  fallback: T
): T {
  const jsonString = extractJSON(text);
  
  if (!jsonString) {
    console.warn('Kein JSON in Text gefunden, verwende Fallback');
    return fallback;
  }

  const parsed = safeParseJSON<T>(jsonString, fallback);

  // Validiere erforderliche Felder
  if (!validateFields(parsed, requiredFields)) {
    console.warn('JSON enthält nicht alle erforderlichen Felder, verwende Fallback');
    return fallback;
  }

  return parsed;
}

