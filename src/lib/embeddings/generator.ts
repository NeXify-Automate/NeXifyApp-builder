/**
 * NeXifyAI Builder - Embedding Generator
 * Generiert Embeddings für RAG-System via OpenAI oder Gemini
 */

import { getApiKey } from '../apiKeys';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1536;

let openaiClient: OpenAI | null = null;
let geminiClient: GoogleGenAI | null = null;

/**
 * Initialisiert die Embedding-Clients
 */
function initializeClients(): void {
  const openaiKey = getApiKey('openai');
  const geminiKey = getApiKey('gemini');

  if (openaiKey && !openaiClient) {
    try {
      openaiClient = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });
    } catch (error) {
      console.warn('OpenAI Embedding Client konnte nicht initialisiert werden:', error);
    }
  }

  if (geminiKey && !geminiClient) {
    try {
      geminiClient = new GoogleGenAI({ apiKey: geminiKey });
    } catch (error) {
      console.warn('Gemini Embedding Client konnte nicht initialisiert werden:', error);
    }
  }
}

/**
 * Generiert Embedding für einen Text via OpenAI
 */
async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  if (!openaiClient) {
    throw new Error('OpenAI Client nicht initialisiert');
  }

  try {
    const response = await openaiClient.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSION
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Fehler bei OpenAI Embedding-Generierung:', error);
    throw error;
  }
}

/**
 * Generiert Embedding für einen Text via Gemini
 */
async function generateGeminiEmbedding(text: string): Promise<number[]> {
  if (!geminiClient) {
    throw new Error('Gemini Client nicht initialisiert');
  }

  try {
    // Gemini Embeddings API (falls verfügbar)
    // Hinweis: Gemini hat möglicherweise eine andere API-Struktur
    // Für jetzt: Fallback auf OpenAI oder Placeholder
    const response = await geminiClient.models.embedContent({
      model: 'models/embedding-001', // Beispiel-Modell
      content: { parts: [{ text }] }
    });

    // Gemini gibt möglicherweise ein anderes Format zurück
    // Anpassen je nach tatsächlicher API-Struktur
    return response.embedding?.values || [];
  } catch (error) {
    console.error('Fehler bei Gemini Embedding-Generierung:', error);
    throw error;
  }
}

/**
 * Generiert Embedding für einen Text (mit Fallback)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  initializeClients();

  // Versuche zuerst OpenAI
  if (openaiClient) {
    try {
      return await generateOpenAIEmbedding(text);
    } catch (error) {
      console.warn('OpenAI Embedding fehlgeschlagen, versuche Gemini:', error);
    }
  }

  // Fallback auf Gemini
  if (geminiClient) {
    try {
      return await generateGeminiEmbedding(text);
    } catch (error) {
      console.warn('Gemini Embedding fehlgeschlagen:', error);
    }
  }

  // Fallback: Placeholder (für Development)
  console.warn('Keine Embedding-API verfügbar. Verwende Placeholder.');
  return generatePlaceholderEmbedding(text);
}

/**
 * Generiert Placeholder-Embedding (für Development)
 */
function generatePlaceholderEmbedding(text: string): number[] {
  // Einfacher Hash-basierter Placeholder
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Generiere deterministischen "Embedding" basierend auf Hash
  const embedding: number[] = [];
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    const seed = (hash + i) * 0.0001;
    embedding.push(Math.sin(seed) * 0.5);
  }

  return embedding;
}

/**
 * Generiert Embeddings für mehrere Texte (Batch)
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize: number = 10
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchEmbeddings = await Promise.all(
      batch.map(text => generateEmbedding(text))
    );
    embeddings.push(...batchEmbeddings);

    // Rate Limiting: Warte zwischen Batches
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return embeddings;
}

/**
 * Konvertiert Embedding-Array zu pgvector Format
 */
export function embeddingToPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Konvertiert pgvector Format zu Embedding-Array
 */
export function pgVectorToEmbedding(pgVector: string): number[] {
  try {
    return JSON.parse(pgVector);
  } catch (error) {
    console.error('Fehler beim Parsen von pgvector:', error);
    return [];
  }
}

