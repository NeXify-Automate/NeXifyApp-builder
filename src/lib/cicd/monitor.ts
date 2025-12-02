/**
 * NeXifyAI Builder - CI/CD 24/7 Monitor
 * Kontinuierliche Überwachung und automatische Builds
 */

import { runCICDPipeline, BuildResult } from './buildSystem';

export interface MonitorConfig {
  enabled: boolean;
  checkInterval: number; // in Millisekunden
  autoFix: boolean;
  notifyOnError: boolean;
}

export interface MonitorStatus {
  active: boolean;
  lastCheck: number;
  lastResult?: BuildResult;
  totalChecks: number;
  successfulBuilds: number;
  failedBuilds: number;
}

class CICDMonitor {
  private config: MonitorConfig = {
    enabled: false,
    checkInterval: 60000, // 1 Minute
    autoFix: true,
    notifyOnError: true
  };

  private status: MonitorStatus = {
    active: false,
    lastCheck: 0,
    totalChecks: 0,
    successfulBuilds: 0,
    failedBuilds: 0
  };

  private intervalId: NodeJS.Timeout | null = null;
  private projectFilesGetter: (() => Record<string, string>) | null = null;
  private onStatusChange: ((status: MonitorStatus) => void) | null = null;
  private onBuildResult: ((result: BuildResult) => void) | null = null;

  /**
   * Startet den 24/7 Monitor
   */
  start(
    getProjectFiles: () => Record<string, string>,
    onStatusChange?: (status: MonitorStatus) => void,
    onBuildResult?: (result: BuildResult) => void
  ): void {
    if (this.status.active) {
      console.warn('CI/CD Monitor läuft bereits');
      return;
    }

    this.projectFilesGetter = getProjectFiles;
    this.onStatusChange = onStatusChange || null;
    this.onBuildResult = onBuildResult || null;
    this.config.enabled = true;
    this.status.active = true;

    // Sofortiger Check beim Start
    this.performCheck();

    // Regelmäßige Checks
    this.intervalId = setInterval(() => {
      if (this.config.enabled && this.status.active) {
        this.performCheck();
      }
    }, this.config.checkInterval);

    console.log('🚀 CI/CD 24/7 Monitor gestartet');
  }

  /**
   * Stoppt den Monitor
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.status.active = false;
    this.config.enabled = false;
    this.notifyStatusChange();
    console.log('⏹️ CI/CD Monitor gestoppt');
  }

  /**
   * Führt einen Build-Check durch
   */
  private async performCheck(): Promise<void> {
    if (!this.projectFilesGetter) {
      console.warn('Kein ProjectFiles-Getter registriert');
      return;
    }

    const projectFiles = this.projectFilesGetter();
    if (Object.keys(projectFiles).length === 0) {
      // Keine Dateien zu prüfen
      return;
    }

    this.status.lastCheck = Date.now();
    this.status.totalChecks++;
    this.notifyStatusChange();

    try {
      const result = await runCICDPipeline(projectFiles, 2); // Reduzierte Retries für Performance

      this.status.lastResult = result;

      if (result.success) {
        this.status.successfulBuilds++;
        if (this.onBuildResult) {
          this.onBuildResult(result);
        }
      } else {
        this.status.failedBuilds++;
        if (this.config.notifyOnError && this.onBuildResult) {
          this.onBuildResult(result);
        }
      }

      this.notifyStatusChange();
    } catch (error) {
      console.error('Fehler beim CI/CD Check:', error);
      this.status.failedBuilds++;
      this.notifyStatusChange();
    }
  }

  /**
   * Aktualisiert die Konfiguration
   */
  updateConfig(config: Partial<MonitorConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart mit neuer Konfiguration
    if (this.status.active && this.intervalId) {
      this.stop();
      if (this.projectFilesGetter) {
        this.start(
          this.projectFilesGetter,
          this.onStatusChange || undefined,
          this.onBuildResult || undefined
        );
      }
    }
  }

  /**
   * Gibt den aktuellen Status zurück
   */
  getStatus(): MonitorStatus {
    return { ...this.status };
  }

  /**
   * Gibt die aktuelle Konfiguration zurück
   */
  getConfig(): MonitorConfig {
    return { ...this.config };
  }

  /**
   * Benachrichtigt über Status-Änderungen
   */
  private notifyStatusChange(): void {
    if (this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }
  }

  /**
   * Führt einen manuellen Check durch
   */
  async manualCheck(): Promise<BuildResult | null> {
    if (!this.projectFilesGetter) {
      return null;
    }

    const projectFiles = this.projectFilesGetter();
    return await runCICDPipeline(projectFiles);
  }
}

// Singleton-Instanz
let monitorInstance: CICDMonitor | null = null;

export function getCICDMonitor(): CICDMonitor {
  if (!monitorInstance) {
    monitorInstance = new CICDMonitor();
  }
  return monitorInstance;
}

