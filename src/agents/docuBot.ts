/**
 * NeXifyAI Builder - Docu-Bot Agent
 * Dokumentiert jede Entscheidung im Brain (Eternal Memory)
 */

import { getModelRouter } from '../lib/modelRouter';
import { saveDecision } from '../lib/supabase/brain';

export interface Decision {
  agent: string;
  decision: string;
  context: Record<string, any>;
  reasoning?: string;
}

export class DocuBot {
  private modelRouter = getModelRouter();

  /**
   * Dokumentiert eine Entscheidung im Brain
   */
  async documentDecision(
    projectId: string,
    agent: string,
    decision: string,
    context: Record<string, any> = {},
    userId?: string,
    reasoning?: string
  ): Promise<void> {
    try {
      // Erstelle strukturierte Dokumentation
      const documentation = this.createDocumentation(agent, decision, context, reasoning);
      
      // Speichere im Brain
      await saveDecision(projectId, documentation, agent, context, userId);
    } catch (error) {
      console.error('Fehler beim Dokumentieren der Entscheidung:', error);
      // Nicht kritisch - weiter machen
    }
  }

  /**
   * Erstellt strukturierte Dokumentation
   */
  private createDocumentation(
    agent: string,
    decision: string,
    context: Record<string, any>,
    reasoning?: string
  ): string {
    const timestamp = new Date().toISOString();
    
    let doc = `# Entscheidung dokumentiert von ${agent}\n\n`;
    doc += `**Zeitpunkt:** ${timestamp}\n\n`;
    doc += `**Entscheidung:**\n${decision}\n\n`;
    
    if (reasoning) {
      doc += `**Begründung:**\n${reasoning}\n\n`;
    }
    
    if (Object.keys(context).length > 0) {
      doc += `**Kontext:**\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`\n\n`;
    }
    
    return doc;
  }

  /**
   * Dokumentiert Code-Generierung
   */
  async documentCodeGeneration(
    projectId: string,
    files: Array<{ path: string; purpose: string }>,
    designSystem?: any
  ): Promise<void> {
    const decision = `Code-Generierung abgeschlossen. ${files.length} Dateien erstellt:\n${files.map(f => `- ${f.path}: ${f.purpose}`).join('\n')}`;
    
    await this.documentDecision(projectId, 'architect', decision, {
      filesGenerated: files.length,
      filePaths: files.map(f => f.path),
      designSystem: designSystem ? 'verwendet' : 'nicht verwendet'
    });
  }

  /**
   * Dokumentiert Design-Entscheidung
   */
  async documentDesignDecision(
    projectId: string,
    designSystem: any,
    rationale: string,
    userId?: string
  ): Promise<void> {
    const decision = `Design-System erstellt: ${JSON.stringify(designSystem.theme || designSystem.colors?.primary || 'Unbekannt')}`;
    
    await this.documentDecision(projectId, 'designer', decision, {
      designSystem,
      rationale
    }, userId);
  }

  /**
   * Dokumentiert Business-Konzept
   */
  async documentBusinessConcept(
    projectId: string,
    concept: {
      summary: string;
      features: string[];
      targetAudience: string;
    },
    userId?: string
  ): Promise<void> {
    const decision = `Business-Konzept erstellt:\nSummary: ${concept.summary}\nFeatures: ${concept.features.join(', ')}\nZielgruppe: ${concept.targetAudience}`;
    
    await this.documentDecision(projectId, 'architect', decision, {
      concept
    }, userId);
  }

  /**
   * Dokumentiert QA-Findings
   */
  async documentQAFindings(
    projectId: string,
    filePath: string,
    issues: Array<{ severity: string; message: string }>,
    fixes: string[],
    userId?: string
  ): Promise<void> {
    const decision = `QA-Prüfung für ${filePath}: ${issues.length} Issues gefunden, ${fixes.length} Fixes angewendet`;
    
    await this.documentDecision(projectId, 'qa_agent', decision, {
      filePath,
      issuesCount: issues.length,
      fixesCount: fixes.length,
      issues: issues.map(i => `${i.severity}: ${i.message}`),
      fixes
    }, userId);
  }
}

// Singleton-Instanz
let docuBotInstance: DocuBot | null = null;

export function getDocuBot(): DocuBot {
  if (!docuBotInstance) {
    docuBotInstance = new DocuBot();
  }
  return docuBotInstance;
}

