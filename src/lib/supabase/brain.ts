/**
 * NeXifyAI Builder - RAG System (Brain)
 * Vektor-Store für Projekt-Wissen mit Eternal Memory
 */

import { supabase } from './client';
import type { BrainEntry } from './schema';
import { generateEmbedding, embeddingToPgVector } from '../embeddings/generator';

/**
 * Speichert einen Eintrag im Projekt-Brain
 */
export async function saveBrainEntry(
  projectId: string,
  content: string,
  entryType: BrainEntry['entry_type'],
  metadata: Record<string, any> = {}
): Promise<BrainEntry | null> {
  try {
    // Generiere Embedding
    const embedding = await generateEmbedding(content);

    const { data, error } = await supabase
      .from('project_brain')
      .insert({
        project_id: projectId,
        user_id: (await supabase.auth.getUser()).data.user?.id || '',
        content,
        embedding: embeddingToPgVector(embedding), // pgvector Format
        entry_type: entryType,
        metadata
      })
      .select()
      .single();

    if (error) {
      console.error('Fehler beim Speichern im Brain:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Speichern im Brain:', error);
    return null;
  }
}

/**
 * Sucht im Projekt-Brain mit semantischer Suche
 */
export async function searchBrain(
  projectId: string,
  query: string,
  limit: number = 5
): Promise<BrainEntry[]> {
  try {
    // Generiere Embedding für Query
    const queryEmbedding = await generateEmbedding(query);

    // Semantische Suche mit pgvector
    const { data, error } = await supabase.rpc('match_brain_entries', {
      project_id: projectId,
      query_embedding: embeddingToPgVector(queryEmbedding),
      match_threshold: 0.7,
      match_count: limit
    });

    if (error) {
      console.error('Fehler bei Brain-Suche:', error);
      // Fallback: Einfache Text-Suche
      return await searchBrainFallback(projectId, query, limit);
    }

    return data || [];
  } catch (error) {
    console.error('Fehler bei Brain-Suche:', error);
    return await searchBrainFallback(projectId, query, limit);
  }
}

/**
 * Fallback: Einfache Text-Suche
 */
async function searchBrainFallback(
  projectId: string,
  query: string,
  limit: number
): Promise<BrainEntry[]> {
  const { data, error } = await supabase
    .from('project_brain')
    .select('*')
    .eq('project_id', projectId)
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Fehler bei Fallback-Suche:', error);
    return [];
  }

  return data || [];
}

/**
 * Lädt alle Brain-Einträge eines Projekts
 */
export async function loadBrainEntries(
  projectId: string,
  entryType?: BrainEntry['entry_type']
): Promise<BrainEntry[]> {
  try {
    let query = supabase
      .from('project_brain')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (entryType) {
      query = query.eq('entry_type', entryType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Fehler beim Laden der Brain-Einträge:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Fehler beim Laden der Brain-Einträge:', error);
    return [];
  }
}

/**
 * Speichert Konzept im Brain
 */
export async function saveConcept(
  projectId: string,
  conceptContent: string
): Promise<BrainEntry | null> {
  return saveBrainEntry(projectId, conceptContent, 'concept', {
    source: 'architect',
    timestamp: new Date().toISOString()
  });
}

/**
 * Speichert Design-System im Brain
 */
export async function saveDesignSystem(
  projectId: string,
  designSystem: any
): Promise<BrainEntry | null> {
  return saveBrainEntry(
    projectId,
    JSON.stringify(designSystem),
    'design',
    {
      source: 'designer',
      timestamp: new Date().toISOString()
    }
  );
}

/**
 * Speichert Entscheidung im Brain (Docu-Bot)
 */
export async function saveDecision(
  projectId: string,
  decision: string,
  agent: string,
  context?: Record<string, any>,
  userId?: string
): Promise<BrainEntry | null> {
  // Hole user_id falls nicht übergeben
  let finalUserId = userId;
  if (!finalUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    finalUserId = user?.id || '';
  }

  return saveBrainEntry(projectId, decision, 'decision', {
    source: 'docu_bot',
    agent,
    context,
    timestamp: new Date().toISOString()
  });
}

/**
 * Ruft relevantes Wissen für einen Agent ab (RAG)
 */
export async function getRelevantContext(
  projectId: string,
  query: string,
  maxEntries: number = 3
): Promise<string> {
  const entries = await searchBrain(projectId, query, maxEntries);

  if (entries.length === 0) {
    return 'Kein relevantes Wissen im Brain gefunden.';
  }

  return entries
    .map(entry => {
      const type = entry.entry_type;
      const content = entry.content;
      const metadata = entry.metadata;
      return `[${type.toUpperCase()}] ${content}\nQuelle: ${metadata.source || 'unknown'}`;
    })
    .join('\n\n---\n\n');
}

