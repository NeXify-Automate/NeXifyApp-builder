/**
 * NeXifyAI Builder - CI/CD Build System
 * KI-optimierte automatische Builds und Auto-Fix bei Fehlern
 */

import { getModelRouter, TaskType, Complexity } from '../modelRouter';
import { getQAAgent } from '../../agents/qaAgent';
import { getPerformanceOptimizer } from './performance';

export interface BuildResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  fixed: boolean;
  buildLog: string;
  fixedFiles?: Record<string, string>; // Reparierte Dateien
  metrics?: BuildMetrics; // Code-Qualitäts-Metriken
  optimizations?: string[]; // Durchgeführte Optimierungen
}

export interface BuildMetrics {
  totalFiles: number;
  totalLines: number;
  complexity: number;
  testCoverage?: number;
  performanceScore?: number;
  maintainabilityIndex?: number;
  securityIssues: number;
  codeQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * KI-gestützte Code-Analyse
 */
async function analyzeCodeWithAI(
  filePath: string,
  content: string,
  projectContext: Record<string, string>
): Promise<{ errors: string[]; warnings: string[]; suggestions: string[] }> {
  const modelRouter = getModelRouter();
  const config = modelRouter.selectModel('reasoning', 'medium');
  
  if (!config) {
    return { errors: [], warnings: [], suggestions: [] };
  }

  const analysisPrompt = `Analysiere diesen Code auf Fehler, Warnungen und Optimierungsmöglichkeiten:

Datei: ${filePath}
Code:
\`\`\`
${content.substring(0, 2000)}${content.length > 2000 ? '\n... (gekürzt)' : ''}
\`\`\`

Projekt-Kontext:
- ${Object.keys(projectContext).length} Dateien im Projekt
- React 19.2.0 mit TypeScript
- TailwindCSS für Styling
- Supabase für Backend

Prüfe auf:
1. Syntax-Fehler
2. TypeScript-Typ-Fehler
3. Fehlende Imports
4. Performance-Probleme
5. Sicherheitsprobleme
6. Code-Qualität (DRY, SOLID)
7. React Best Practices
8. Accessibility-Probleme

Antworte als JSON:
{
  "errors": ["Fehler 1", "Fehler 2"],
  "warnings": ["Warnung 1", "Warnung 2"],
  "suggestions": ["Optimierung 1", "Optimierung 2"]
}`;

  try {
    const response = await modelRouter.callModel(
      config,
      analysisPrompt,
      'Du bist ein Senior Code-Reviewer und Software-Architekt. Antworte NUR mit validem JSON.'
    );

    // Parse JSON Response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        errors: Array.isArray(parsed.errors) ? parsed.errors : [],
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      };
    }
  } catch (error) {
    console.warn(`KI-Analyse für ${filePath} fehlgeschlagen:`, error);
  }

  return { errors: [], warnings: [], suggestions: [] };
}

/**
 * Berechnet Code-Qualitäts-Metriken
 */
function calculateMetrics(projectFiles: Record<string, string>): BuildMetrics {
  let totalLines = 0;
  let complexity = 0;
  let securityIssues = 0;
  
  for (const [path, content] of Object.entries(projectFiles)) {
    const lines = content.split('\n').length;
    totalLines += lines;
    
    // Einfache Komplexitäts-Schätzung
    const functions = (content.match(/(function|const|=>)/g) || []).length;
    const conditionals = (content.match(/(if|else|switch|case)/g) || []).length;
    const loops = (content.match(/(for|while|forEach|map)/g) || []).length;
    complexity += functions + conditionals * 2 + loops * 2;
    
    // Sicherheits-Checks
    if (content.includes('eval(') || content.includes('innerHTML') || content.includes('dangerouslySetInnerHTML')) {
      securityIssues++;
    }
  }
  
  // Code-Qualitäts-Bewertung
  const avgComplexity = complexity / Object.keys(projectFiles).length;
  let codeQuality: BuildMetrics['codeQuality'] = 'excellent';
  if (avgComplexity > 50) codeQuality = 'poor';
  else if (avgComplexity > 30) codeQuality = 'fair';
  else if (avgComplexity > 15) codeQuality = 'good';
  
  return {
    totalFiles: Object.keys(projectFiles).length,
    totalLines,
    complexity: Math.round(avgComplexity),
    securityIssues,
    codeQuality
  };
}

/**
 * KI-gestützte Code-Optimierung
 */
async function optimizeCodeWithAI(
  filePath: string,
  content: string,
  suggestions: string[]
): Promise<string | null> {
  if (suggestions.length === 0) return null;
  
  const modelRouter = getModelRouter();
  const config = modelRouter.selectModel('coding', 'medium');
  
  if (!config) return null;

  const optimizationPrompt = `Optimiere diesen Code basierend auf den Vorschlägen:

Datei: ${filePath}
Aktueller Code:
\`\`\`
${content.substring(0, 3000)}${content.length > 3000 ? '\n... (gekürzt)' : ''}
\`\`\`

Optimierungsvorschläge:
${suggestions.map(s => `- ${s}`).join('\n')}

WICHTIG:
- Behalte die Funktionalität bei
- Verbessere Performance
- Erhöhe Code-Qualität
- Nutze React Best Practices
- TypeScript-Typen korrekt verwenden

Gib NUR den optimierten Code zurück (ohne Markdown, ohne Erklärungen).`;

  try {
    const response = await modelRouter.callModel(
      config,
      optimizationPrompt,
      'Du bist ein Senior React/TypeScript Entwickler. Optimiere Code professionell. Antworte NUR mit dem Code.'
    );

    // Extrahiere Code (entferne Markdown-Code-Blöcke falls vorhanden)
    let optimizedCode = response.content;
    const codeBlockMatch = optimizedCode.match(/```(?:typescript|tsx|ts|javascript|jsx|js)?\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      optimizedCode = codeBlockMatch[1];
    }

    return optimizedCode.trim();
  } catch (error) {
    console.warn(`KI-Optimierung für ${filePath} fehlgeschlagen:`, error);
    return null;
  }
}

/**
 * Führt einen KI-optimierten Build durch
 */
export async function runBuild(projectFiles: Record<string, string>): Promise<BuildResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const optimizations: string[] = [];
  let buildLog = '';

  buildLog += '🚀 Starte KI-optimierte Build-Analyse...\n';
  buildLog += `📁 Analysiere ${Object.keys(projectFiles).length} Dateien\n\n`;

  // Phase 1: Statische Code-Analyse
  buildLog += '📊 Phase 1: Statische Code-Analyse\n';
  for (const [path, content] of Object.entries(projectFiles)) {
    // TypeScript/JavaScript Syntax-Checks
    if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.jsx')) {
      // Prüfe auf fehlende Imports
      const reactHooks = ['useState', 'useEffect', 'useRef', 'useCallback', 'useMemo', 'useContext'];
      for (const hook of reactHooks) {
        if (content.includes(hook) && !content.includes("from 'react'") && !content.includes('from "react"')) {
          errors.push(`${path}: ${hook} wird verwendet aber nicht importiert`);
        }
      }

      // Prüfe auf fehlende Lucide-Imports
      const lucideIcons = ['Send', 'Loader2', 'Settings', 'Key', 'CreditCard', 'X', 'Check'];
      for (const icon of lucideIcons) {
        if (content.includes(`<${icon}`) && !content.includes("from 'lucide-react'") && !content.includes('from "lucide-react"')) {
          warnings.push(`${path}: ${icon} Icon verwendet aber möglicherweise nicht importiert`);
        }
      }

      // Prüfe auf Syntax-Fehler
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push(`${path}: Ungleiche Anzahl von geschweiften Klammern (${openBraces} öffnend, ${closeBraces} schließend)`);
      }

      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        errors.push(`${path}: Ungleiche Anzahl von Klammern`);
      }

      // Prüfe auf häufige React-Fehler
      if (content.includes('export default function') && !content.includes('export default')) {
        warnings.push(`${path}: Möglicherweise fehlende default export`);
      }

      // Prüfe auf TypeScript-spezifische Fehler
      if (path.endsWith('.ts') || path.endsWith('.tsx')) {
        const anyMatches = content.match(/\bany\b/g);
        if (anyMatches && anyMatches.length > 5) {
          warnings.push(`${path}: Viele 'any' Typen gefunden (${anyMatches.length}) - sollte spezifische Typen verwenden`);
        }
      }

      // Performance-Checks
      if (content.includes('useEffect') && !content.includes('useEffect(() =>')) {
        warnings.push(`${path}: useEffect sollte mit Dependency-Array verwendet werden`);
      }

      // Sicherheits-Checks
      if (content.includes('dangerouslySetInnerHTML') || content.includes('innerHTML')) {
        warnings.push(`${path}: Potenzielle XSS-Gefahr durch innerHTML`);
      }
    }

    // Prüfe auf leere Dateien
    if (content.trim().length === 0) {
      warnings.push(`${path}: Leere Datei`);
    }
  }

  buildLog += `✓ Statische Analyse abgeschlossen: ${errors.length} Fehler, ${warnings.length} Warnungen\n\n`;

  // Phase 2: KI-gestützte Code-Analyse (parallelisiert für Performance)
  buildLog += '🤖 Phase 2: KI-gestützte Code-Analyse (parallelisiert)\n';
  const criticalFiles = Object.entries(projectFiles).filter(([path]) => 
    path.includes('App') || path.includes('index') || path.includes('main') || path.includes('component')
  );

  const optimizer = getPerformanceOptimizer();
  
  // Parallele Analyse für bessere Performance
  const aiResults = await optimizer.analyzeFilesInParallel(
    Object.fromEntries(criticalFiles.slice(0, 5)), // Limitiere auf 5 Dateien
    async (path, content) => {
      try {
        const aiAnalysis = await analyzeCodeWithAI(path, content, projectFiles);
        if (aiAnalysis.suggestions.length > 0) {
          optimizations.push(`${path}: ${aiAnalysis.suggestions.length} Optimierungsvorschläge gefunden`);
        }
        return {
          errors: aiAnalysis.errors.map(e => `${path}: ${e}`),
          warnings: aiAnalysis.warnings.map(w => `${path}: ${w}`)
        };
      } catch (error) {
        console.warn(`KI-Analyse für ${path} übersprungen:`, error);
        return { errors: [], warnings: [] };
      }
    },
    3 // Max 3 parallele Analysen
  );

  errors.push(...aiResults.errors);
  warnings.push(...aiResults.warnings);

  buildLog += `✓ KI-Analyse abgeschlossen (${criticalFiles.slice(0, 5).length} Dateien parallel analysiert)\n\n`;

  // Phase 3: Metriken berechnen
  buildLog += '📈 Phase 3: Code-Qualitäts-Metriken\n';
  const metrics = calculateMetrics(projectFiles);
  buildLog += `- Dateien: ${metrics.totalFiles}\n`;
  buildLog += `- Zeilen: ${metrics.totalLines}\n`;
  buildLog += `- Komplexität: ${metrics.complexity}\n`;
  buildLog += `- Qualität: ${metrics.codeQuality}\n`;
  buildLog += `- Sicherheitsprobleme: ${metrics.securityIssues}\n\n`;

  buildLog += `📋 Zusammenfassung: ${errors.length} Fehler, ${warnings.length} Warnungen, ${optimizations.length} Optimierungsmöglichkeiten\n`;

  if (errors.length > 0) {
    buildLog += `❌ Build fehlgeschlagen mit ${errors.length} Fehler(n)\n`;
    return {
      success: false,
      errors,
      warnings,
      fixed: false,
      buildLog,
      metrics
    };
  }

  buildLog += '✅ Build-Analyse erfolgreich!\n';
  return {
    success: true,
    errors: [],
    warnings,
    fixed: false,
    buildLog,
    metrics,
    optimizations: optimizations.length > 0 ? optimizations : undefined
  };
}

/**
 * Auto-Fixer: Analysiert Build-Fehler und repariert sie automatisch mit KI
 */
export async function autoFixBuild(
  projectFiles: Record<string, string>,
  buildErrors: string[]
): Promise<{ fixed: boolean; fixedFiles: Record<string, string>; remainingErrors: string[]; optimizations: string[] }> {
  const qaAgent = getQAAgent();
  const modelRouter = getModelRouter();
  const fixedFiles: Record<string, string> = { ...projectFiles };
  const remainingErrors: string[] = [];
  const optimizations: string[] = [];

  // Gruppiere Fehler nach Datei
  const errorsByFile: Record<string, string[]> = {};
  for (const error of buildErrors) {
    const match = error.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      const file = match[1];
      const message = match[2];
      if (!errorsByFile[file]) {
        errorsByFile[file] = [];
      }
      errorsByFile[file].push(message);
    }
  }

  // Versuche jeden Fehler zu beheben
  for (const [filePath, fileErrors] of Object.entries(errorsByFile)) {
    if (!fixedFiles[filePath]) {
      remainingErrors.push(...fileErrors.map(e => `${filePath}: ${e}`));
      continue;
    }

    try {
      // Erstelle Issues für QA Agent
      const issues = fileErrors.map(error => ({
        type: 'error' as const,
        severity: 'high' as const,
        file: filePath,
        message: error,
        suggestion: 'Repariere den Fehler automatisch mit KI'
      }));

      // QA Agent repariert den Code mit KI
      const fixedCode = await qaAgent.fixCode(fixedFiles[filePath], filePath, issues);
      fixedFiles[filePath] = fixedCode;
      optimizations.push(`${filePath}: ${fileErrors.length} Fehler automatisch behoben`);
    } catch (error) {
      console.error(`Fehler beim Reparieren von ${filePath}:`, error);
      remainingErrors.push(...fileErrors.map(e => `${filePath}: ${e}`));
    }
  }

  return {
    fixed: remainingErrors.length === 0,
    fixedFiles,
    remainingErrors,
    optimizations
  };
}

/**
 * KI-optimierte CI/CD Pipeline: Führt Build mit Auto-Fix und Optimierung durch
 */
export async function runCICDPipeline(
  projectFiles: Record<string, string>,
  maxRetries: number = 3
): Promise<BuildResult> {
  let attempt = 0;
  let currentFiles = { ...projectFiles };
  const allOptimizations: string[] = [];

  while (attempt < maxRetries) {
    attempt++;
    
    // Führe KI-optimierten Build durch
    const buildResult = await runBuild(currentFiles);

    if (buildResult.success) {
      return {
        ...buildResult,
        fixed: attempt > 1,
        buildLog: `🎉 Build erfolgreich nach ${attempt} Versuch(en)!\n\n${buildResult.buildLog}`,
        fixedFiles: attempt > 1 ? currentFiles : undefined,
        optimizations: allOptimizations.length > 0 ? allOptimizations : buildResult.optimizations
      };
    }

    // Versuche Auto-Fix mit KI
    if (attempt < maxRetries) {
      const fixResult = await autoFixBuild(currentFiles, buildResult.errors);
      currentFiles = fixResult.fixedFiles;
      allOptimizations.push(...fixResult.optimizations);

      if (fixResult.fixed) {
        // Retry Build nach Fix
        continue;
      } else {
        // Konnte nicht alle Fehler beheben
        return {
          success: false,
          errors: fixResult.remainingErrors,
          warnings: buildResult.warnings,
          fixed: false,
          buildLog: `❌ Build fehlgeschlagen nach ${attempt} Versuchen. ${fixResult.remainingErrors.length} Fehler konnten nicht behoben werden.\n\n${buildResult.buildLog}`,
          fixedFiles: currentFiles,
          metrics: buildResult.metrics,
          optimizations: allOptimizations.length > 0 ? allOptimizations : undefined
        };
      }
    }
  }

  return {
    success: false,
    errors: [],
    warnings: [],
    fixed: false,
    buildLog: `❌ Build fehlgeschlagen nach ${maxRetries} Versuchen.`,
    fixedFiles: currentFiles,
    optimizations: allOptimizations.length > 0 ? allOptimizations : undefined
  };
}
