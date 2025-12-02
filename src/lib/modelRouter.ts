/**
 * NeXifyAI Builder - Model Router
 * Dynamische Auswahl des besten Modells für jede Aufgabe
 */

import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { loadApiKeys, getApiKey } from './apiKeys';

export type ModelProvider = 'claude' | 'gemini' | 'openai' | 'huggingface';
export type TaskType = 'reasoning' | 'speed' | 'coding' | 'creative' | 'image' | 'general';
export type Complexity = 'low' | 'medium' | 'high';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  useCase: TaskType;
  apiKey: string;
  available: boolean;
}

export interface ModelResponse {
  content: string;
  model: string;
  provider: ModelProvider;
  tokensUsed?: number;
}

/**
 * Model Router - Wählt das beste Modell basierend auf Task-Typ und Komplexität
 */
export class ModelRouter {
  private geminiClient: GoogleGenAI | null = null;
  private claudeClient: Anthropic | null = null;
  private openaiClient: OpenAI | null = null;

  constructor() {
    this.initializeClients();
  }

  /**
   * Initialisiert die API-Clients
   */
  private initializeClients(): void {
    const keys = loadApiKeys();

    // Gemini Client
    if (keys.gemini) {
      try {
        this.geminiClient = new GoogleGenAI({ apiKey: keys.gemini });
      } catch (error) {
        console.warn('Gemini Client konnte nicht initialisiert werden:', error);
      }
    }

    // Claude Client
    if (keys.claude) {
      try {
        this.claudeClient = new Anthropic({ apiKey: keys.claude });
      } catch (error) {
        console.warn('Claude Client konnte nicht initialisiert werden:', error);
      }
    }

    // OpenAI Client
    if (keys.openai) {
      try {
        this.openaiClient = new OpenAI({ apiKey: keys.openai, dangerouslyAllowBrowser: true });
      } catch (error) {
        console.warn('OpenAI Client konnte nicht initialisiert werden:', error);
      }
    }
  }

  /**
   * Wählt das beste Modell für eine Aufgabe
   */
  selectModel(taskType: TaskType, complexity: Complexity = 'medium'): ModelConfig | null {
    const availableModels: ModelConfig[] = [];

    // Claude - Best für Complex Reasoning & Coding
    if (this.claudeClient && getApiKey('claude')) {
      if (taskType === 'reasoning' || taskType === 'coding' || complexity === 'high') {
        availableModels.push({
          provider: 'claude',
          model: complexity === 'high' ? 'claude-3-5-sonnet-20241022' : 'claude-3-haiku-20240307',
          useCase: taskType,
          apiKey: getApiKey('claude')!,
          available: true
        });
      }
    }

    // Gemini - Best für Speed & Prompt Optimization
    if (this.geminiClient && getApiKey('gemini')) {
      if (taskType === 'speed' || taskType === 'creative' || taskType === 'image') {
        availableModels.push({
          provider: 'gemini',
          model: taskType === 'image' ? 'gemini-2.5-flash-image' : 
                 complexity === 'high' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash',
          useCase: taskType,
          apiKey: getApiKey('gemini')!,
          available: true
        });
      }
    }

    // OpenAI - Fallback
    if (this.openaiClient && getApiKey('openai')) {
      availableModels.push({
        provider: 'openai',
        model: complexity === 'high' ? 'gpt-4-turbo-preview' : 'gpt-3.5-turbo',
        useCase: taskType,
        apiKey: getApiKey('openai')!,
        available: true
      });
    }

    // Hugging Face - Für Standard-Tasks (wird später implementiert)
    // if (getApiKey('huggingface')) {
    //   availableModels.push({
    //     provider: 'huggingface',
    //     model: 'meta-llama/Llama-2-7b-chat-hf',
    //     useCase: taskType,
    //     apiKey: getApiKey('huggingface')!,
    //     available: true
    //   });
    // }

    // Wähle das beste verfügbare Modell
    if (availableModels.length === 0) {
      console.warn('Keine verfügbaren Modelle gefunden');
      return null;
    }

    // Priorisierung: Claude > Gemini > OpenAI
    const prioritized = availableModels.sort((a, b) => {
      const priority: Record<ModelProvider, number> = {
        claude: 3,
        gemini: 2,
        openai: 1,
        huggingface: 0
      };
      return priority[b.provider] - priority[a.provider];
    });

    return prioritized[0];
  }

  /**
   * Ruft ein Modell mit einem Prompt auf
   */
  async callModel(
    config: ModelConfig,
    prompt: string,
    systemInstruction?: string,
    maxRetries: number = 3
  ): Promise<ModelResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        switch (config.provider) {
          case 'claude':
            return await this.callClaude(config, prompt, systemInstruction);
          
          case 'gemini':
            return await this.callGemini(config, prompt, systemInstruction);
          
          case 'openai':
            return await this.callOpenAI(config, prompt, systemInstruction);
          
          case 'huggingface':
            throw new Error('Hugging Face Integration noch nicht implementiert');
          
          default:
            throw new Error(`Unbekannter Provider: ${config.provider}`);
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`Versuch ${attempt + 1}/${maxRetries} fehlgeschlagen:`, error);
        
        if (attempt < maxRetries - 1) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new Error(`Alle Versuche fehlgeschlagen: ${lastError?.message}`);
  }

  /**
   * Ruft Claude API auf
   */
  private async callClaude(
    config: ModelConfig,
    prompt: string,
    systemInstruction?: string
  ): Promise<ModelResponse> {
    if (!this.claudeClient) {
      throw new Error('Claude Client nicht initialisiert');
    }

    const response = await this.claudeClient.messages.create({
      model: config.model as any,
      max_tokens: 4096,
      system: systemInstruction || 'Du bist ein hilfreicher AI-Assistent.',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unerwarteter Response-Typ von Claude');
    }

    return {
      content: content.text,
      model: config.model,
      provider: 'claude',
      tokensUsed: response.usage?.input_tokens ? response.usage.input_tokens + response.usage.output_tokens : undefined
    };
  }

  /**
   * Ruft Gemini API auf
   */
  private async callGemini(
    config: ModelConfig,
    prompt: string,
    systemInstruction?: string
  ): Promise<ModelResponse> {
    if (!this.geminiClient) {
      throw new Error('Gemini Client nicht initialisiert');
    }

    const response = await this.geminiClient.models.generateContent({
      model: config.model,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || 'Du bist ein hilfreicher AI-Assistent.',
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    });

    return {
      content: response.text || '',
      model: config.model,
      provider: 'gemini'
    };
  }

  /**
   * Ruft OpenAI API auf
   */
  private async callOpenAI(
    config: ModelConfig,
    prompt: string,
    systemInstruction?: string
  ): Promise<ModelResponse> {
    if (!this.openaiClient) {
      throw new Error('OpenAI Client nicht initialisiert');
    }

    const response = await this.openaiClient.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: systemInstruction || 'Du bist ein hilfreicher AI-Assistent.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4096,
      temperature: 0.7
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Keine Antwort von OpenAI erhalten');
    }

    return {
      content,
      model: config.model,
      provider: 'openai',
      tokensUsed: response.usage ? response.usage.total_tokens : undefined
    };
  }

  /**
   * Prüft welche Modelle verfügbar sind
   */
  getAvailableModels(): ModelConfig[] {
    const models: ModelConfig[] = [];
    const keys = loadApiKeys();

    if (keys.claude) {
      models.push({
        provider: 'claude',
        model: 'claude-3-5-sonnet-20241022',
        useCase: 'reasoning',
        apiKey: keys.claude,
        available: true
      });
    }

    if (keys.gemini) {
      models.push({
        provider: 'gemini',
        model: 'gemini-3-pro-preview',
        useCase: 'speed',
        apiKey: keys.gemini,
        available: true
      });
    }

    if (keys.openai) {
      models.push({
        provider: 'openai',
        model: 'gpt-4-turbo-preview',
        useCase: 'general',
        apiKey: keys.openai,
        available: true
      });
    }

    return models;
  }

  /**
   * Aktualisiert die Clients (z.B. nach API-Key-Änderung)
   */
  refreshClients(): void {
    this.initializeClients();
  }
}

// Singleton-Instanz
let routerInstance: ModelRouter | null = null;

export function getModelRouter(): ModelRouter {
  if (!routerInstance) {
    routerInstance = new ModelRouter();
  }
  return routerInstance;
}

