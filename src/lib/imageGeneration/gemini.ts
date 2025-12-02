/**
 * NeXifyAI Builder - Gemini Image Generation
 * Generiert Images via Gemini Image Generation API
 */

import { GoogleGenAI } from '@google/genai';
import { getApiKey } from '../apiKeys';
import type { ImagePrompt } from '../../agents/designer';

let geminiClient: GoogleGenAI | null = null;

/**
 * Initialisiert Gemini Client
 */
function initializeClient(): void {
  const apiKey = getApiKey('gemini');
  if (apiKey && !geminiClient) {
    try {
      geminiClient = new GoogleGenAI({ apiKey });
    } catch (error) {
      console.warn('Gemini Image Client konnte nicht initialisiert werden:', error);
    }
  }
}

export interface GeneratedImage {
  url: string;
  prompt: string;
  useCase: string;
  dimensions: string;
}

/**
 * Generiert ein Image via Gemini
 */
export async function generateImage(
  prompt: ImagePrompt
): Promise<GeneratedImage | null> {
  try {
    initializeClient();

    if (!geminiClient) {
      console.warn('Gemini Client nicht verfügbar. Verwende Placeholder.');
      return generatePlaceholderImage(prompt);
    }

    // Gemini Image Generation (falls verfügbar)
    // Hinweis: Gemini hat möglicherweise eine andere API-Struktur für Image Generation
    // Für jetzt: Placeholder mit Logging
    
    const fullPrompt = `${prompt.description}, ${prompt.style}, ${prompt.dimensions}`;
    
    // TODO: Implementiere echte Gemini Image Generation API
    // const response = await geminiClient.models.generateImage({
    //   model: 'gemini-2.5-flash-image',
    //   prompt: fullPrompt,
    //   dimensions: prompt.dimensions
    // });

    console.log('Gemini Image Generation (Placeholder):', fullPrompt);
    
    // Placeholder: Generiere Data URL für Development
    return generatePlaceholderImage(prompt);
  } catch (error) {
    console.error('Fehler bei Image-Generierung:', error);
    return generatePlaceholderImage(prompt);
  }
}

/**
 * Generiert mehrere Images (Batch)
 */
export async function generateImagesBatch(
  prompts: ImagePrompt[]
): Promise<GeneratedImage[]> {
  const images: GeneratedImage[] = [];

  for (const prompt of prompts) {
    const image = await generateImage(prompt);
    if (image) {
      images.push(image);
    }

    // Rate Limiting: Warte zwischen Generierungen
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return images;
}

/**
 * Generiert Placeholder-Image (für Development)
 */
function generatePlaceholderImage(prompt: ImagePrompt): GeneratedImage {
  // Erstelle SVG Placeholder
  const [width, height] = prompt.dimensions.split('x').map(Number);
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#020408"/>
      <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#0EA5E9" text-anchor="middle" dominant-baseline="middle">
        ${prompt.useCase}
      </text>
      <text x="50%" y="60%" font-family="Arial" font-size="14" fill="#6B7280" text-anchor="middle" dominant-baseline="middle">
        ${prompt.description.substring(0, 50)}...
      </text>
    </svg>
  `.trim();

  const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;

  return {
    url: dataUrl,
    prompt: prompt.description,
    useCase: prompt.useCase,
    dimensions: prompt.dimensions
  };
}

/**
 * Speichert generiertes Image in Supabase Storage
 */
export async function saveImageToStorage(
  image: GeneratedImage,
  projectId: string,
  fileName: string
): Promise<string | null> {
  try {
    const { supabase } = await import('../supabase/client');
    
    // Konvertiere Data URL zu Blob
    const response = await fetch(image.url);
    const blob = await response.blob();

    // Upload zu Supabase Storage
    const { data, error } = await supabase.storage
      .from('project-assets')
      .upload(`${projectId}/${fileName}`, blob, {
        contentType: blob.type,
        upsert: true
      });

    if (error) {
      console.error('Fehler beim Speichern des Images:', error);
      return null;
    }

    // Generiere Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('project-assets')
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (error) {
    console.error('Fehler beim Speichern des Images:', error);
    return null;
  }
}

