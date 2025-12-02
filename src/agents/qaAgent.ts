/**
 * NeXifyAI Builder - QA Agent (Prüfungsagent)
 * Echtzeit-Code-Überwachung, Fehlererkennung, Self-Healing
 */

import { getModelRouter } from '../lib/modelRouter';
import { parseJSONFromText } from '../lib/jsonParser';

export interface CodeIssue {
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface CodeReview {
  issues: CodeIssue[];
  score: number; // 0-100
  passed: boolean;
  suggestions: string[];
}

export class QAAgent {
  private modelRouter = getModelRouter();

  /**
   * Prüft Code auf Fehler und Qualität
   */
  async reviewCode(
    code: string,
    filePath: string,
    context?: {
      projectFiles?: string[];
      designSystem?: any;
    }
  ): Promise<CodeReview> {
    const reviewPrompt = `Du bist ein Senior Code-Reviewer. Prüfe diesen Code auf:

1. Syntax-Fehler
2. Logik-Fehler
3. Design-Verstöße (muss Dark Mode, Venlo Style haben)
4. Sicherheitsprobleme
5. Performance-Issues
6. Code-Qualität (DRY, Clean Code)

Code:
\`\`\`typescript
${code}
\`\`\`

Datei: ${filePath}

${context?.designSystem ? `Design-System: ${JSON.stringify(context.designSystem)}` : ''}

Antworte als JSON:
{
  "issues": [
    {
      "type": "error | warning | info",
      "severity": "critical | high | medium | low",
      "file": "${filePath}",
      "line": 42,
      "message": "...",
      "suggestion": "..."
    }
  ],
  "score": 85,
  "passed": true,
  "suggestions": ["...", "..."]
}`;

    const config = this.modelRouter.selectModel('reasoning', 'high');
    if (!config) {
      // Fallback: Einfache Prüfung
      return this.simpleCodeCheck(code, filePath);
    }

    try {
      const response = await this.modelRouter.callModel(
        config,
        reviewPrompt,
        'Du bist ein erfahrener Code-Reviewer. Antworte NUR mit validem JSON.'
      );

      const fallbackReview: CodeReview = this.simpleCodeCheck(code, filePath);
      
      try {
        const review = parseJSONFromText<CodeReview>(
          response.content,
          ['issues', 'score', 'passed', 'suggestions'],
          fallbackReview
        );

        // Validiere Review-Struktur
        if (!Array.isArray(review.issues)) {
          review.issues = fallbackReview.issues;
        }
        if (typeof review.score !== 'number' || review.score < 0 || review.score > 100) {
          review.score = fallbackReview.score;
        }
        if (typeof review.passed !== 'boolean') {
          review.passed = fallbackReview.passed;
        }
        if (!Array.isArray(review.suggestions)) {
          review.suggestions = fallbackReview.suggestions;
        }

        return review;
      } catch (error) {
        console.error('Fehler beim Parsen des Code-Reviews:', error);
        return fallbackReview;
      }
    } catch (error) {
      console.error('Fehler bei Code-Review:', error);
    }

    return this.simpleCodeCheck(code, filePath);
  }

  /**
   * Einfache Code-Prüfung (Fallback)
   */
  private simpleCodeCheck(code: string, filePath: string): CodeReview {
    const issues: CodeIssue[] = [];

    // Prüfe auf häufige Fehler
    if (code.includes('console.log(') && !filePath.includes('.test.')) {
      issues.push({
        type: 'warning',
        severity: 'low',
        file: filePath,
        message: 'console.log gefunden - sollte in Production entfernt werden',
        suggestion: 'Nutze ein Logging-System oder entferne console.log'
      });
    }

    // Prüfe auf Hardcoded Keys
    if (code.match(/['"](sk-|hf_|AIza)/)) {
      issues.push({
        type: 'error',
        severity: 'critical',
        file: filePath,
        message: 'Hardcoded API-Key gefunden - Sicherheitsrisiko!',
        suggestion: 'Nutze Environment-Variablen oder das API-Key-Management-System'
      });
    }

    // Prüfe auf fehlende Error-Handling
    if (code.includes('await') && !code.includes('try') && !code.includes('catch')) {
      issues.push({
        type: 'warning',
        severity: 'medium',
        file: filePath,
        message: 'Async Code ohne Error-Handling',
        suggestion: 'Füge try-catch Blöcke hinzu'
      });
    }

    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const highIssues = issues.filter(i => i.severity === 'high').length;
    const score = Math.max(0, 100 - (criticalIssues * 30) - (highIssues * 15) - (issues.length * 5));

    return {
      issues,
      score,
      passed: criticalIssues === 0 && highIssues === 0,
      suggestions: issues.map(i => i.suggestion || '').filter(Boolean)
    };
  }

  /**
   * Versucht Code automatisch zu reparieren
   */
  async fixCode(
    code: string,
    filePath: string,
    issues: CodeIssue[]
  ): Promise<string> {
    if (issues.length === 0) {
      return code;
    }

    const fixPrompt = `Repariere diesen Code basierend auf den gefundenen Issues:

Code:
\`\`\`typescript
${code}
\`\`\`

Issues:
${issues.map(i => `- [${i.severity}] ${i.message}${i.suggestion ? ` (Suggestion: ${i.suggestion})` : ''}`).join('\n')}

Repariere den Code und gib NUR den reparierten Code zurück (ohne Markdown-Formatierung, ohne Erklärungen).`;

    const config = this.modelRouter.selectModel('coding', 'high');
    if (!config) {
      return code; // Kann nicht repariert werden
    }

    try {
      const response = await this.modelRouter.callModel(
        config,
        fixPrompt,
        'Du bist ein Code-Fixer. Repariere Code basierend auf Review-Issues. Gib NUR den reparierten Code zurück.'
      );

      // Extrahiere Code aus der Antwort
      const codeMatch = response.content.match(/```typescript?\n?([\s\S]*?)\n?```/) || 
                       response.content.match(/```\n?([\s\S]*?)\n?```/);
      
      if (codeMatch) {
        return codeMatch[1].trim();
      }

      // Falls kein Code-Block, nimm die gesamte Antwort
      return response.content.trim();
    } catch (error) {
      console.error('Fehler beim Reparieren des Codes:', error);
      return code;
    }
  }

  /**
   * Prüft ob Code dem Design-System entspricht
   */
  async validateDesignCompliance(
    code: string,
    filePath: string,
    designSystem: any
  ): Promise<{
    compliant: boolean;
    violations: string[];
  }> {
    const validationPrompt = `Prüfe ob dieser Code dem Design-System entspricht:

Code:
\`\`\`typescript
${code}
\`\`\`

Design-System:
${JSON.stringify(designSystem, null, 2)}

Prüfe auf:
- Korrekte Farben (Background: #020408, etc.)
- Dark Mode Compliance
- Venlo Style
- Glassmorphism wo nötig

Antworte als JSON:
{
  "compliant": true/false,
  "violations": ["...", "..."]
}`;

    const config = this.modelRouter.selectModel('reasoning', 'low');
    if (!config) {
      return { compliant: true, violations: [] };
    }

    try {
      const response = await this.modelRouter.callModel(
        config,
        validationPrompt,
        'Du bist ein Design-System-Experte. Antworte NUR mit validem JSON.'
      );

      const fallbackResult = {
        compliant: true,
        violations: [] as string[]
      };

      try {
        const result = parseJSONFromText<typeof fallbackResult>(
          response.content,
          ['compliant', 'violations'],
          fallbackResult
        );

        if (typeof result.compliant !== 'boolean') {
          result.compliant = true;
        }
        if (!Array.isArray(result.violations)) {
          result.violations = [];
        }

        return result;
      } catch (error) {
        console.error('Fehler bei Design-Validierung:', error);
        return fallbackResult;
      }
    } catch (error) {
      console.error('Fehler bei Design-Validierung:', error);
    }

    return { compliant: true, violations: [] };
  }

  /**
   * Prüft Build-Fehler und versucht sie zu beheben
   */
  async fixBuildErrors(
    buildLog: string,
    projectFiles: Record<string, string>
  ): Promise<{
    fixed: boolean;
    fixes: Array<{ file: string; changes: string }>;
    remainingErrors: string[];
  }> {
    const fixPrompt = `Analysiere diesen Build-Log und repariere die Fehler:

Build-Log:
\`\`\`
${buildLog}
\`\`\`

Projekt-Dateien:
${Object.entries(projectFiles).map(([path, content]) => `\n${path}:\n\`\`\`typescript\n${content}\n\`\`\``).join('\n')}

Repariere alle Fehler und gib die geänderten Dateien zurück.

Antworte als JSON:
{
  "fixed": true,
  "fixes": [
    {
      "file": "src/App.tsx",
      "changes": "Geänderter Code..."
    }
  ],
  "remainingErrors": []
}`;

    const config = this.modelRouter.selectModel('coding', 'high');
    if (!config) {
      return {
        fixed: false,
        fixes: [],
        remainingErrors: ['Kein verfügbares Modell für Build-Fix']
      };
    }

    try {
      const response = await this.modelRouter.callModel(
        config,
        fixPrompt,
        'Du bist ein Build-Fix-Experte. Repariere Build-Fehler. Antworte NUR mit validem JSON.'
      );

      const fallbackResult = {
        fixed: false,
        fixes: [] as Array<{ file: string; changes: string }>,
        remainingErrors: ['Automatische Reparatur fehlgeschlagen'] as string[]
      };

      try {
        const result = parseJSONFromText<typeof fallbackResult>(
          response.content,
          ['fixed', 'fixes', 'remainingErrors'],
          fallbackResult
        );

        if (typeof result.fixed !== 'boolean') {
          result.fixed = false;
        }
        if (!Array.isArray(result.fixes)) {
          result.fixes = [];
        }
        if (!Array.isArray(result.remainingErrors)) {
          result.remainingErrors = fallbackResult.remainingErrors;
        }

        return result;
      } catch (error) {
        console.error('Fehler beim Reparieren von Build-Fehlern:', error);
        return fallbackResult;
      }
    } catch (error) {
      console.error('Fehler beim Reparieren von Build-Fehlern:', error);
    }

    return {
      fixed: false,
      fixes: [],
      remainingErrors: ['Automatische Reparatur fehlgeschlagen']
    };
  }
}

// Singleton-Instanz
let qaAgentInstance: QAAgent | null = null;

export function getQAAgent(): QAAgent {
  if (!qaAgentInstance) {
    qaAgentInstance = new QAAgent();
  }
  return qaAgentInstance;
}

