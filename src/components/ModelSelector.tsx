/**
 * NeXifyAI Builder - Model Selector
 * UI für manuelle Modellauswahl pro Task
 */

import React, { useState } from 'react';
import { Cpu, ChevronDown, Check } from 'lucide-react';
import { getModelRouter, type ModelProvider, type TaskType, type Complexity } from '../lib/modelRouter';

interface ModelSelectorProps {
  taskType: TaskType;
  complexity: Complexity;
  onSelect?: (provider: ModelProvider, model: string) => void;
  selectedModel?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  taskType,
  complexity,
  onSelect,
  selectedModel
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const router = getModelRouter();
  const availableModels = router.getAvailableModels();

  const recommendedModel = router.selectModel(taskType, complexity);

  const getProviderColor = (provider: ModelProvider): string => {
    switch (provider) {
      case 'claude':
        return 'text-purple-400 bg-purple-950/30 border-purple-500/30';
      case 'gemini':
        return 'text-blue-400 bg-blue-950/30 border-blue-500/30';
      case 'openai':
        return 'text-green-400 bg-green-950/30 border-green-500/30';
      case 'huggingface':
        return 'text-yellow-400 bg-yellow-950/30 border-yellow-500/30';
      default:
        return 'text-slate-400 bg-slate-800/30 border-slate-700/30';
    }
  };

  const getProviderLabel = (provider: ModelProvider): string => {
    switch (provider) {
      case 'claude':
        return 'Claude';
      case 'gemini':
        return 'Gemini';
      case 'openai':
        return 'OpenAI';
      case 'huggingface':
        return 'Hugging Face';
      default:
        return provider;
    }
  };

  if (availableModels.length === 0) {
    return (
      <div className="px-3 py-2 bg-slate-800/30 border border-slate-700 rounded-lg text-xs text-slate-500">
        Keine Modelle verfügbar. Bitte API-Keys in den Settings konfigurieren.
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-[#020408] border border-slate-700 rounded-lg text-sm text-slate-300 hover:border-blue-500/50 transition-all flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-blue-400" />
          <span>
            {selectedModel || recommendedModel
              ? `${getProviderLabel(recommendedModel?.provider || 'gemini')}: ${recommendedModel?.model || 'auto'}`
              : 'Modell auswählen...'}
          </span>
          {recommendedModel && !selectedModel && (
            <span className="px-1.5 py-0.5 bg-blue-950/30 text-blue-400 text-[10px] rounded border border-blue-500/20">
              Empfohlen
            </span>
          )}
        </div>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#0F1623] border border-slate-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
          {availableModels.map((model, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (onSelect) {
                  onSelect(model.provider, model.model);
                }
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 text-left hover:bg-slate-800/50 transition-colors border-b border-slate-800 last:border-b-0 flex items-center justify-between ${
                selectedModel === model.model ? 'bg-blue-950/20' : ''
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getProviderColor(model.provider)}`}>
                    {getProviderLabel(model.provider)}
                  </span>
                  <span className="text-sm font-medium text-slate-200">{model.model}</span>
                </div>
                <div className="text-xs text-slate-500">
                  Use Case: {model.useCase}
                </div>
              </div>
              {selectedModel === model.model && (
                <Check size={16} className="text-blue-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

