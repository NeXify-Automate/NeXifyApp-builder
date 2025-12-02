/**
 * NeXifyAI Builder - Auto-Fixer für Build-Fehler
 * KI-gestützter Build-Fix bei Fehlern
 */

import { getModelRouter } from '../modelRouter';
import { getQAAgent } from '../../agents/qaAgent';

export interface BuildError {
  file: string;
  line?: number;
  message: string;
  type: 'syntax' | 'type' | 'import' | 'runtime' | 'other';
}

/**
 * Analysiert Build-Log und extrahiert Fehler
 */
export function parseBuildLog(log: string): BuildError[] {
  const errors: BuildError[] = [];
  const lines = log.split('\n');

  for (const line of lines) {
    // TypeScript/ESLint Fehler-Format
    const tsErrorMatch = line.match(/^(.+?)\((\d+),\d+\):\s*(.+)$/);
    if (tsErrorMatch) {
      errors.push({
        file: tsErrorMatch[1],
        line: parseInt(tsErrorMatch[2]),
        message: tsErrorMatch[3],
        type: 'syntax'
      });
      continue;
    }

    // Vite Build-Fehler
    const viteErrorMatch = line.match(/^(.+?):(\d+):(\d+):\s*(.+)$/);
    if (viteErrorMatch) {
      errors.push({
        file: viteErrorMatch[1],
        line: parseInt(viteErrorMatch[2]),
        message: viteErrorMatch[4],
        type: 'syntax'
      });
      continue;
    }

    // Generischer Fehler
    if (line.toLowerCase().includes('error') && line.includes(':')) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        errors.push({
          file: parts[0].trim(),
          message: parts.slice(1).join(':').trim(),
          type: 'other'
        });
      }
    }
  }

  return errors;
}

/**
 * Repariert Build-Fehler automatisch
 */
export async function fixBuildErrors(
  projectFiles: Record<string, string>,
  errors: BuildError[]
): Promise<{ fixedFiles: Record<string, string>; remainingErrors: BuildError[] }> {
  const qaAgent = getQAAgent();
  const fixedFiles: Record<string, string> = { ...projectFiles };
  const remainingErrors: BuildError[] = [];

  // Gruppiere Fehler nach Datei
  const errorsByFile: Record<string, BuildError[]> = {};
  for (const error of errors) {
    if (!errorsByFile[error.file]) {
      errorsByFile[error.file] = [];
    }
    errorsByFile[error.file].push(error);
  }

  // Repariere jede Datei
  for (const [filePath, fileErrors] of Object.entries(errorsByFile)) {
    if (!fixedFiles[filePath]) {
      remainingErrors.push(...fileErrors);
      continue;
    }

    try {
      // Konvertiere BuildError zu CodeIssue
      const issues = fileErrors.map(error => ({
        type: 'error' as const,
        severity: 'high' as const,
        file: filePath,
        line: error.line,
        message: error.message,
        suggestion: `Repariere ${error.type} Fehler: ${error.message}`
      }));

      // QA Agent repariert
      const fixedCode = await qaAgent.fixCode(fixedFiles[filePath], filePath, issues);
      fixedFiles[filePath] = fixedCode;
    } catch (error) {
      console.error(`Fehler beim Reparieren von ${filePath}:`, error);
      remainingErrors.push(...fileErrors);
    }
  }

  return {
    fixedFiles,
    remainingErrors
  };
}

