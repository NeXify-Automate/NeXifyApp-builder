/**
 * NeXifyAI Builder - CI/CD Performance Optimierungen
 * Beschleunigt Build-Prozesse durch Caching und Parallelisierung
 */

import { BuildResult } from './buildSystem';

interface CacheEntry {
  fileHash: string;
  result: BuildResult;
  timestamp: number;
}

class PerformanceOptimizer {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 Minuten

  /**
   * Berechnet einen Hash für Datei-Inhalte
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Berechnet einen Hash für alle Projekt-Dateien
   */
  hashProjectFiles(projectFiles: Record<string, string>): string {
    const sortedPaths = Object.keys(projectFiles).sort();
    const combined = sortedPaths.map(path => `${path}:${this.hashContent(projectFiles[path])}`).join('|');
    return this.hashContent(combined);
  }

  /**
   * Prüft ob ein Build-Result im Cache ist
   */
  getCachedResult(projectFiles: Record<string, string>): BuildResult | null {
    const hash = this.hashProjectFiles(projectFiles);
    const cached = this.cache.get(hash);

    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      return cached.result;
    }

    // Entferne abgelaufene Einträge
    if (cached) {
      this.cache.delete(hash);
    }

    return null;
  }

  /**
   * Speichert ein Build-Result im Cache
   */
  cacheResult(projectFiles: Record<string, string>, result: BuildResult): void {
    const hash = this.hashProjectFiles(projectFiles);
    this.cache.set(hash, {
      fileHash: hash,
      result,
      timestamp: Date.now()
    });

    // Limitiere Cache-Größe (max 50 Einträge)
    if (this.cache.size > 50) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Bereinigt den Cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Parallele Datei-Analyse für bessere Performance
   */
  async analyzeFilesInParallel(
    projectFiles: Record<string, string>,
    analyzer: (path: string, content: string) => Promise<{ errors: string[]; warnings: string[] }>,
    maxConcurrent: number = 5
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    const entries = Object.entries(projectFiles);

    // Analysiere in Batches
    for (let i = 0; i < entries.length; i += maxConcurrent) {
      const batch = entries.slice(i, i + maxConcurrent);
      const results = await Promise.all(
        batch.map(([path, content]) => analyzer(path, content))
      );

      for (const result of results) {
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);
      }
    }

    return { errors: allErrors, warnings: allWarnings };
  }

  /**
   * Optimiert Build-Konfiguration für Geschwindigkeit
   */
  optimizeForSpeed(): {
    maxRetries: number;
    skipAIAnalysis: boolean;
    parallelAnalysis: boolean;
  } {
    return {
      maxRetries: 2, // Reduzierte Retries für Speed
      skipAIAnalysis: false, // KI-Analyse bleibt aktiv
      parallelAnalysis: true // Parallele Analyse aktivieren
    };
  }

  /**
   * Optimiert Build-Konfiguration für Qualität
   */
  optimizeForQuality(): {
    maxRetries: number;
    skipAIAnalysis: boolean;
    parallelAnalysis: boolean;
  } {
    return {
      maxRetries: 3, // Mehr Retries für Qualität
      skipAIAnalysis: false, // KI-Analyse aktiv
      parallelAnalysis: true
    };
  }
}

// Singleton-Instanz
let optimizerInstance: PerformanceOptimizer | null = null;

export function getPerformanceOptimizer(): PerformanceOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new PerformanceOptimizer();
  }
  return optimizerInstance;
}

