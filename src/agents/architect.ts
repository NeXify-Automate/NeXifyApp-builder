/**
 * NeXifyAI Builder - Architect & Planner Agent
 * Erstellt vollständiges Business-Konzept, DB-Schema, Marketing-Strategie
 */

import { getModelRouter } from '../lib/modelRouter';
import { parseJSONFromText } from '../lib/jsonParser';

export interface BusinessConcept {
  summary: string;
  targetAudience: string;
  features: string[];
  techStack: string[];
  dbSchema?: string;
  marketingStrategy?: string;
}

export interface DatabaseSchema {
  tables: Array<{
    name: string;
    description: string;
    columns: Array<{
      name: string;
      type: string;
      description: string;
      constraints?: string[];
    }>;
    relationships?: Array<{
      table: string;
      type: 'one-to-one' | 'one-to-many' | 'many-to-many';
    }>;
  }>;
  migrations?: string[];
}

export class Architect {
  private modelRouter = getModelRouter();

  /**
   * Erstellt ein vollständiges Business-Konzept
   */
  async createBusinessConcept(optimizedPrompt: string): Promise<BusinessConcept> {
    const conceptPrompt = `Du bist der Chief Product Officer (CPO) von NeXifyAI. Erstelle ein vollständiges Business-Konzept basierend auf:

${optimizedPrompt}

Erstelle ein detailliertes Konzept mit:
1. Business Summary: Kurze Zusammenfassung der App-Idee
2. Target Audience: Wer ist die Zielgruppe?
3. Features: Liste aller Features (MVP + Future)
4. Tech Stack: Alle verwendeten Technologien
5. Database Schema: Supabase Tabellen-Struktur (als SQL)
6. Marketing Strategy: Kurze Marketing-Strategie

Format: Markdown mit klaren Abschnitten

WICHTIG:
- Nutze Supabase für die Datenbank
- Berücksichtige Row Level Security (RLS) für Mandantentrennung
- Design: Dark Mode, Venlo Style
- DSGVO-konform`;

    const config = this.modelRouter.selectModel('reasoning', 'high');
    if (!config) {
      throw new Error('Kein verfügbares Modell für Konzept-Erstellung');
    }

    const response = await this.modelRouter.callModel(
      config,
      conceptPrompt,
      'Du bist ein erfahrener CPO und Product Architect. Erstelle strukturierte, professionelle Business-Konzepte.'
    );

    // Parse die Antwort in strukturiertes Format
    return this.parseConcept(response.content);
  }

  /**
   * Erstellt ein detailliertes Datenbank-Schema
   */
  async createDatabaseSchema(concept: BusinessConcept): Promise<DatabaseSchema> {
    const schemaPrompt = `Erstelle ein detailliertes Supabase Datenbank-Schema für:

Business-Konzept: ${concept.summary}
Features: ${concept.features.join(', ')}

Anforderungen:
- Supabase PostgreSQL
- Row Level Security (RLS) für Mandantentrennung
- Alle Tabellen müssen RLS Policies haben
- Foreign Keys für Beziehungen
- Timestamps (created_at, updated_at) für alle Tabellen
- UUID als Primary Keys

Antworte als JSON:
{
  "tables": [
    {
      "name": "table_name",
      "description": "...",
      "columns": [
        {
          "name": "column_name",
          "type": "uuid | text | integer | boolean | timestamp | jsonb",
          "description": "...",
          "constraints": ["PRIMARY KEY", "NOT NULL", "DEFAULT uuid_generate_v4()"]
        }
      ],
      "relationships": [
        {
          "table": "related_table",
          "type": "one-to-many"
        }
      ]
    }
  ],
  "migrations": [
    "-- SQL Migration Statements"
  ]
}`;

    const config = this.modelRouter.selectModel('coding', 'high');
    if (!config) {
      throw new Error('Kein verfügbares Modell für Schema-Erstellung');
    }

    const response = await this.modelRouter.callModel(
      config,
      schemaPrompt,
      'Du bist ein Datenbank-Architekt. Erstelle professionelle, sichere Supabase-Schemas mit RLS.'
    );

    // Fallback-Schema
    const fallbackSchema: DatabaseSchema = {
      tables: [
        {
          name: 'users',
          description: 'Benutzer-Tabelle',
          columns: [
            { name: 'id', type: 'uuid', description: 'Primary Key', constraints: ['PRIMARY KEY', 'DEFAULT uuid_generate_v4()'] },
            { name: 'email', type: 'text', description: 'E-Mail-Adresse', constraints: ['NOT NULL', 'UNIQUE'] },
            { name: 'created_at', type: 'timestamp', description: 'Erstellt am', constraints: ['NOT NULL', 'DEFAULT now()'] }
          ]
        }
      ],
      migrations: [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        'CREATE TABLE users (...);',
        'ALTER TABLE users ENABLE ROW LEVEL SECURITY;'
      ]
    };

    try {
      const schema = parseJSONFromText<DatabaseSchema>(
        response.content,
        ['tables'],
        fallbackSchema
      );

      // Validiere Schema-Struktur
      if (!Array.isArray(schema.tables)) {
        schema.tables = fallbackSchema.tables;
      }
      if (!schema.migrations || !Array.isArray(schema.migrations)) {
        schema.migrations = fallbackSchema.migrations;
      }

      return schema;
    } catch (error) {
      console.error('Fehler beim Parsen des DB-Schemas:', error);
      return fallbackSchema;
    }
  }

  /**
   * Erstellt eine Marketing-Strategie
   */
  async createMarketingStrategy(concept: BusinessConcept): Promise<string> {
    const marketingPrompt = `Erstelle eine Marketing-Strategie für:

Business-Konzept: ${concept.summary}
Zielgruppe: ${concept.targetAudience}
Features: ${concept.features.join(', ')}

Erstelle:
1. Zielgruppen-Analyse (detailliert)
2. Marketing-Kanäle (E-Mail, Blog, Social Media)
3. Content-Strategie
4. Launch-Plan

Format: Markdown`;

    const config = this.modelRouter.selectModel('creative', 'medium');
    if (!config) {
      return '# Marketing-Strategie\n\nMarketing-Strategie wird erstellt...';
    }

    const response = await this.modelRouter.callModel(
      config,
      marketingPrompt,
      'Du bist ein Marketing-Experte. Erstelle professionelle Marketing-Strategien.'
    );

    return response.content;
  }

  /**
   * Parst ein Konzept aus Markdown-Text
   */
  private parseConcept(markdown: string): BusinessConcept {
    const concept: BusinessConcept = {
      summary: '',
      targetAudience: '',
      features: [],
      techStack: []
    };

    // Extrahiere Business Summary
    const summaryMatch = markdown.match(/##?\s*Business\s*Summary[:\n]*(.+?)(?=##|$)/is);
    if (summaryMatch) {
      concept.summary = summaryMatch[1].trim();
    }

    // Extrahiere Target Audience
    const audienceMatch = markdown.match(/##?\s*Target\s*Audience[:\n]*(.+?)(?=##|$)/is);
    if (audienceMatch) {
      concept.targetAudience = audienceMatch[1].trim();
    }

    // Extrahiere Features
    const featuresMatch = markdown.match(/##?\s*Features?[:\n]*(.+?)(?=##|$)/is);
    if (featuresMatch) {
      const featuresText = featuresMatch[1];
      concept.features = featuresText
        .split(/\n/)
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    // Extrahiere Tech Stack
    const techMatch = markdown.match(/##?\s*Tech\s*Stack[:\n]*(.+?)(?=##|$)/is);
    if (techMatch) {
      const techText = techMatch[1];
      concept.techStack = techText
        .split(/\n/)
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    // Extrahiere DB Schema
    const schemaMatch = markdown.match(/##?\s*Database\s*Schema[:\n]*(.+?)(?=##|$)/is);
    if (schemaMatch) {
      concept.dbSchema = schemaMatch[1].trim();
    }

    // Extrahiere Marketing Strategy
    const marketingMatch = markdown.match(/##?\s*Marketing\s*Strategy[:\n]*(.+?)(?=##|$)/is);
    if (marketingMatch) {
      concept.marketingStrategy = marketingMatch[1].trim();
    }

    // Fallbacks
    if (!concept.summary) {
      concept.summary = 'Vollständige App-Entwicklung mit modernem Tech-Stack';
    }
    if (!concept.targetAudience) {
      concept.targetAudience = 'Endbenutzer';
    }
    if (concept.features.length === 0) {
      concept.features = ['User Authentication', 'Dashboard', 'Data Management'];
    }
    if (concept.techStack.length === 0) {
      concept.techStack = ['React 18', 'TypeScript', 'TailwindCSS', 'Supabase'];
    }

    return concept;
  }
}

// Singleton-Instanz
let architectInstance: Architect | null = null;

export function getArchitect(): Architect {
  if (!architectInstance) {
    architectInstance = new Architect();
  }
  return architectInstance;
}

