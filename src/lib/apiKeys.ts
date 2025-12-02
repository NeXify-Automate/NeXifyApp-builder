/**
 * NeXifyAI Builder - API Key Management
 * Sichere Verwaltung von API-Keys mit Verschlüsselung
 */

import CryptoJS from 'crypto-js';

const STORAGE_KEY = 'nexifyai_api_keys';
const ENCRYPTION_KEY = 'nexifyai_secure_key_2025'; // In Production sollte dies aus einem sicheren Backend kommen

export interface ApiKeys {
  claude?: string;
  openai?: string;
  huggingface?: string;
  gemini?: string;
}

/**
 * Verschlüsselt einen String
 */
function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

/**
 * Entschlüsselt einen String
 */
function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * Lädt API-Keys aus localStorage (verschlüsselt)
 * 
 * SICHERHEIT: API-Keys werden NUR aus localStorage geladen.
 * Environment-Variablen werden NICHT verwendet, da sie im Client-Bundle exponiert wären.
 * API-Keys müssen über das Settings-Modal konfiguriert werden.
 */
export function loadApiKeys(): ApiKeys {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // Keine API-Keys gefunden - muss über Settings-Modal konfiguriert werden
      return {};
    }
    
    const decrypted = decrypt(stored);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Fehler beim Laden der API-Keys:', error);
    return {};
  }
}

/**
 * Speichert API-Keys in localStorage (verschlüsselt)
 */
export function saveApiKeys(keys: ApiKeys): void {
  try {
    const encrypted = encrypt(JSON.stringify(keys));
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch (error) {
    console.error('Fehler beim Speichern der API-Keys:', error);
    throw new Error('API-Keys konnten nicht gespeichert werden');
  }
}

/**
 * Aktualisiert einen einzelnen API-Key
 */
export function updateApiKey(provider: keyof ApiKeys, key: string): void {
  const keys = loadApiKeys();
  keys[provider] = key;
  saveApiKeys(keys);
}

/**
 * Löscht alle gespeicherten API-Keys
 */
export function clearApiKeys(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Prüft ob ein API-Key für einen Provider vorhanden ist
 */
export function hasApiKey(provider: keyof ApiKeys): boolean {
  const keys = loadApiKeys();
  return !!keys[provider] && keys[provider]!.length > 0;
}

/**
 * Gibt einen spezifischen API-Key zurück
 */
export function getApiKey(provider: keyof ApiKeys): string | undefined {
  const keys = loadApiKeys();
  return keys[provider];
}

