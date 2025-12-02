/**
 * NeXifyAI Builder - Prompt Expert Agent
 * Analysiert User-Intent, optimiert Prompts, prüft Design-Regeln
 */

import { getModelRouter, TaskType, Complexity } from '../lib/modelRouter';
import { parseJSONFromText } from '../lib/jsonParser';
import { analyzeReferenceUrl, extractDesignPatterns } from '../lib/urlAnalyzer';

export interface PromptAnalysis {
  intent: string;
  missingDetails: string[];
  designRequirements: string[];
  technicalRequirements: string[];
  optimizedPrompt: string;
}

export class PromptExpert {
  private modelRouter = getModelRouter();

  /**
   * Analysiert und optimiert einen User-Prompt
   */
  async optimizePrompt(
    userInput: string,
    projectContext?: {
      existingFiles?: string[];
      designSystem?: any;
      colorScheme?: string;
      referenceUrl?: string;
    }
  ): Promise<PromptAnalysis> {
    // Analysiere Referenz-URL falls vorhanden
    let referenceAnalysis = '';
    if (projectContext?.referenceUrl) {
      const urlAnalysis = await analyzeReferenceUrl(projectContext.referenceUrl);
      if (urlAnalysis) {
        referenceAnalysis = extractDesignPatterns(urlAnalysis);
      }
    }

    const analysisPrompt = `Du bist der NeXify Prompt Experte. Deine Aufgabe ist es, User-Prompts zu analysieren und zu optimieren.

User-Eingabe: "${userInput}"

${projectContext?.designSystem ? `Aktuelles Design-System: ${JSON.stringify(projectContext.designSystem)}` : ''}
${projectContext?.colorScheme ? `Farbschema: ${projectContext.colorScheme}` : ''}
${projectContext?.existingFiles ? `Vorhandene Dateien: ${projectContext.existingFiles.join(', ')}` : ''}
${referenceAnalysis ? `\nReferenz-URL Analyse:\n${referenceAnalysis}` : ''}

Analysiere den Prompt und erstelle:
1. Intent: Was will der User erreichen?
2. Fehlende Details: Was fehlt für eine vollständige Implementierung?
3. Design-Anforderungen: Welche Design-Regeln müssen beachtet werden?
4. Technische Anforderungen: Welche technischen Details müssen ergänzt werden?
5. Optimierter Prompt: Ein vollständiger, technisch präziser Prompt für einen Senior Architect

WICHTIG:
- Stelle sicher, dass das Design "High-End Dark Mode (Venlo Style)" ist
- Ergänze fehlende technische Details (Supabase DB, React Components, Lucide Icons)
- Füge hinzu, dass ein Konzept in src/brain/concept.md erstellt werden MUSS
- Nutze import.meta.env.VITE_SUPABASE_URL für Supabase
- Design: Deep Midnight Blue Background (#020408), Glassmorphism, Thin Borders

Antworte als JSON:
{
  "intent": "...",
  "missingDetails": ["...", "..."],
  "designRequirements": ["...", "..."],
  "technicalRequirements": ["...", "..."],
  "optimizedPrompt": "..."
}`;

    const config = this.modelRouter.selectModel('reasoning', 'high');
    if (!config) {
      throw new Error('Kein verfügbares Modell für Prompt-Optimierung');
    }

    const response = await this.modelRouter.callModel(
      config,
      analysisPrompt,
      'Du bist ein Experte für Prompt-Engineering und Software-Architektur. Antworte NUR mit validem JSON.'
    );

    // Fallback-Objekt für den Fall, dass Parsing fehlschlägt
    const fallbackAnalysis: PromptAnalysis = {
      intent: 'App-Entwicklung basierend auf User-Eingabe',
      missingDetails: ['Detaillierte Feature-Liste', 'Zielgruppen-Definition'],
      designRequirements: ['Dark Mode', 'Venlo Style', 'Glassmorphism'],
      technicalRequirements: ['React 18', 'TailwindCSS', 'Supabase Integration'],
      optimizedPrompt: this.createFallbackPrompt(userInput)
    };

    try {
      // Extrahiere und parse JSON mit robuster Validierung
      const analysis = parseJSONFromText<PromptAnalysis>(
        response.content,
        ['intent', 'missingDetails', 'designRequirements', 'technicalRequirements', 'optimizedPrompt'],
        fallbackAnalysis
      );

      // Stelle sicher, dass optimizedPrompt vorhanden ist
      if (!analysis.optimizedPrompt || analysis.optimizedPrompt.trim() === '') {
        analysis.optimizedPrompt = this.createFallbackPrompt(userInput, analysis);
      }

      // Stelle sicher, dass Arrays vorhanden sind
      if (!Array.isArray(analysis.missingDetails)) {
        analysis.missingDetails = fallbackAnalysis.missingDetails;
      }
      if (!Array.isArray(analysis.designRequirements)) {
        analysis.designRequirements = fallbackAnalysis.designRequirements;
      }
      if (!Array.isArray(analysis.technicalRequirements)) {
        analysis.technicalRequirements = fallbackAnalysis.technicalRequirements;
      }

      return analysis;
    } catch (error) {
      console.error('Fehler beim Parsen der Prompt-Analyse:', error);
      return fallbackAnalysis;
    }
  }

  /**
   * Erstellt einen Fallback-Prompt falls die Analyse fehlschlägt
   */
  private createFallbackPrompt(userInput: string, analysis?: Partial<PromptAnalysis>): string {
    return `Implementiere eine vollständige React-App basierend auf: "${userInput}"

Technische Anforderungen:
- React 18 mit TypeScript
- TailwindCSS für Styling
- Lucide React für Icons
- Supabase für Backend (nutze import.meta.env.VITE_SUPABASE_URL)
- Dark Mode Design: Deep Midnight Blue (#020408), Glassmorphism, Thin Borders
- Venlo/EU Branding Style

Design-System:
- Background: #020408 (Deepest Onyx Blue)
- Surface: #0B0F17 (Premium Dark Slate)
- Accent: #0EA5E9 (Sky Blue)
- Text: #F8FAFC (Titanium White)

WICHTIG:
- Erstelle ein vollständiges Konzept in src/brain/concept.md
- Erstelle ein Design-System in src/brain/design.json
- Implementiere alle notwendigen React-Komponenten
- Integriere Supabase für Datenhaltung

${analysis?.missingDetails?.length ? `Fehlende Details die ergänzt werden müssen: ${analysis.missingDetails.join(', ')}` : ''}
${analysis?.technicalRequirements?.length ? `Technische Anforderungen: ${analysis.technicalRequirements.join(', ')}` : ''}`;
  }

  /**
   * Prüft ob ein Prompt Design-Regeln verletzt
   */
  async validateDesignRules(prompt: string): Promise<{
    valid: boolean;
    violations: string[];
    suggestions: string[];
  }> {
    const validationPrompt = `Prüfe diesen Prompt auf Verletzungen der NeXify Design-Regeln:

Prompt: "${prompt}"

Design-Regeln:
1. Muss Dark Mode verwenden (#020408 Background)
2. Muss Venlo/EU Style haben
3. Muss Glassmorphism verwenden
4. Muss Lucide Icons verwenden
5. Muss Supabase Integration haben

Antworte als JSON:
{
  "valid": true/false,
  "violations": ["...", "..."],
  "suggestions": ["...", "..."]
}`;

    const config = this.modelRouter.selectModel('reasoning', 'low');
    if (!config) {
      return {
        valid: true,
        violations: [],
        suggestions: []
      };
    }

    const fallbackResult = {
      valid: true,
      violations: [] as string[],
      suggestions: [] as string[]
    };

    try {
      const response = await this.modelRouter.callModel(
        config,
        validationPrompt,
        'Du bist ein Design-Experte. Antworte NUR mit validem JSON.'
      );

      const result = parseJSONFromText<typeof fallbackResult>(
        response.content,
        ['valid', 'violations', 'suggestions'],
        fallbackResult
      );

      // Stelle sicher, dass Arrays vorhanden sind
      if (!Array.isArray(result.violations)) {
        result.violations = [];
      }
      if (!Array.isArray(result.suggestions)) {
        result.suggestions = [];
      }
      if (typeof result.valid !== 'boolean') {
        result.valid = true;
      }

      return result;
    } catch (error) {
      console.error('Fehler bei Design-Validierung:', error);
      return fallbackResult;
    }
  }
}

// Singleton-Instanz
let promptExpertInstance: PromptExpert | null = null;

export function getPromptExpert(): PromptExpert {
  if (!promptExpertInstance) {
    promptExpertInstance = new PromptExpert();
  }
  return promptExpertInstance;
}

