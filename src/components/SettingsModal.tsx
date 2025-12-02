/**
 * NeXifyAI Builder - Settings Modal
 * Verwaltung aller API-Keys und Konfigurationen
 */

import React, { useState, useEffect } from 'react';
import { X, Key, Eye, EyeOff, Save, RefreshCw, CheckCircle2, AlertCircle, Database, Server, ShieldCheck } from 'lucide-react';
import { loadApiKeys, saveApiKeys, updateApiKey, hasApiKey } from '../lib/apiKeys';
import { getModelRouter } from '../lib/modelRouter';
import type { ApiKeys } from '../lib/apiKeys';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [keys, setKeys] = useState<ApiKeys>({});
  const [showKeys, setShowKeys] = useState<Record<keyof ApiKeys, boolean>>({
    claude: false,
    openai: false,
    huggingface: false,
    gemini: false,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    // Lade gespeicherte Keys
    const loadedKeys = loadApiKeys();
    setKeys(loadedKeys);
    
    // Prüfe verfügbare Modelle
    const router = getModelRouter();
    const models = router.getAvailableModels();
    setAvailableModels(models.map(m => `${m.provider}: ${m.model}`));
  }, []);

  const handleKeyChange = (provider: keyof ApiKeys, value: string) => {
    setKeys(prev => ({ ...prev, [provider]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus({ type: null, message: '' });

    try {
      saveApiKeys(keys);
      
      // Aktualisiere Model Router
      const router = getModelRouter();
      router.refreshClients();
      
      setStatus({ type: 'success', message: 'API-Keys erfolgreich gespeichert!' });
      
      // Prüfe verfügbare Modelle erneut
      const models = router.getAvailableModels();
      setAvailableModels(models.map(m => `${m.provider}: ${m.model}`));
      
      setTimeout(() => {
        setStatus({ type: null, message: '' });
      }, 3000);
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message || 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  const toggleKeyVisibility = (provider: keyof ApiKeys) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const providers: Array<{
    key: keyof ApiKeys;
    label: string;
    description: string;
    icon: React.ReactNode;
    placeholder: string;
  }> = [
    {
      key: 'claude',
      label: 'Claude (Anthropic)',
      description: 'Für komplexe Reasoning und Coding-Aufgaben',
      icon: <Key size={16} className="text-purple-400" />,
      placeholder: 'sk-ant-api03-...'
    },
    {
      key: 'openai',
      label: 'OpenAI',
      description: 'Fallback-Modell für allgemeine Aufgaben',
      icon: <Key size={16} className="text-green-400" />,
      placeholder: 'sk-proj-...'
    },
    {
      key: 'gemini',
      label: 'Gemini (Google)',
      description: 'Für schnelle Aufgaben und Prompt-Optimierung',
      icon: <Key size={16} className="text-blue-400" />,
      placeholder: 'AIza...'
    },
    {
      key: 'huggingface',
      label: 'Hugging Face',
      description: 'Für Standard-Tasks (optional)',
      icon: <Key size={16} className="text-yellow-400" />,
      placeholder: 'hf_...'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="bg-[#0F1623] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative animate-zoom-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-[#0F1623] border-b border-slate-800 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Key className="text-blue-500" size={24} />
              API-Key Verwaltung
            </h2>
            <p className="text-slate-400 text-sm mt-1">Verwalte deine API-Keys für alle Model-Provider</p>
            <div className="mt-2 p-3 bg-blue-950/20 border border-blue-500/30 rounded-lg">
              <p className="text-xs text-blue-300">
                <ShieldCheck size={12} className="inline mr-1" />
                <strong>Sicherheit:</strong> API-Keys werden verschlüsselt in localStorage gespeichert und niemals im Code-Bundle exponiert.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-800 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Message */}
          {status.type && (
            <div className={`p-4 rounded-lg border flex items-center gap-3 ${
              status.type === 'success'
                ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-200'
                : 'bg-red-950/30 border-red-500/50 text-red-200'
            }`}>
              {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-medium">{status.message}</span>
            </div>
          )}

          {/* Verfügbare Modelle */}
          {availableModels.length > 0 && (
            <div className="bg-[#020408]/50 p-4 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <Server size={16} className="text-emerald-400" />
                <span className="text-sm font-semibold text-slate-300">Verfügbare Modelle</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableModels.map((model, idx) => (
                  <span key={idx} className="px-2 py-1 bg-slate-800/50 text-xs text-slate-400 rounded border border-slate-700">
                    {model}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* API-Key Inputs */}
          {providers.map(provider => (
            <div key={provider.key} className="space-y-2">
              <div className="flex items-center gap-2">
                {provider.icon}
                <label className="text-sm font-semibold text-slate-300">{provider.label}</label>
                {hasApiKey(provider.key) && (
                  <span className="px-2 py-0.5 bg-emerald-950/30 text-emerald-400 text-[10px] rounded border border-emerald-500/20">
                    Konfiguriert
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 ml-6">{provider.description}</p>
              <div className="relative">
                <input
                  type={showKeys[provider.key] ? 'text' : 'password'}
                  value={keys[provider.key] || ''}
                  onChange={e => handleKeyChange(provider.key, e.target.value)}
                  placeholder={provider.placeholder}
                  className="w-full bg-[#020408] border border-slate-700 rounded-lg p-3 pr-10 text-slate-200 placeholder-slate-600 focus:border-blue-500 outline-none text-sm font-mono"
                />
                <button
                  onClick={() => toggleKeyVisibility(provider.key)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showKeys[provider.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          ))}

          {/* Supabase Config Info */}
          <div className="bg-blue-950/20 border border-blue-500/30 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Database size={16} className="text-blue-400" />
              <span className="text-sm font-semibold text-blue-300">Supabase Konfiguration</span>
            </div>
            <p className="text-xs text-slate-400">
              Supabase wird über das Supabase-Modal konfiguriert. Die Verbindung wird separat verwaltet.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#0F1623] border-t border-slate-800 p-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:hover:bg-blue-600 flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Speichern...
              </>
            ) : (
              <>
                <Save size={16} />
                Speichern
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

