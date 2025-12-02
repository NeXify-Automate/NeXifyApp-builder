/**
 * NeXifyAI Builder - Agent Status
 * Live-Visualisierung der aktiven Agenten
 */

import React from 'react';
import { Bot, BrainCircuit, Code, CheckCircle2, Loader2, AlertCircle, Palette, Wrench } from 'lucide-react';

export type AgentType = 'prompt_expert' | 'planner' | 'architect' | 'coder' | 'reviewer' | 'designer' | 'qa' | null;
export type AgentStatus = 'idle' | 'working' | 'success' | 'error';

interface AgentStatusProps {
  activeAgent: AgentType;
  status: AgentStatus;
  message?: string;
}

export const AgentStatus: React.FC<AgentStatusProps> = ({ activeAgent, status, message }) => {
  const getAgentInfo = (agent: AgentType) => {
    switch (agent) {
      case 'prompt_expert':
        return {
          name: 'Prompt Experte',
          icon: <BrainCircuit size={16} className="text-purple-400" />,
          color: 'text-purple-400 bg-purple-950/30 border-purple-500/30'
        };
      case 'planner':
      case 'architect':
        return {
          name: 'Architekt & Planer',
          icon: <Code size={16} className="text-blue-400" />,
          color: 'text-blue-400 bg-blue-950/30 border-blue-500/30'
        };
      case 'coder':
        return {
          name: 'Architect',
          icon: <Code size={16} className="text-emerald-400" />,
          color: 'text-emerald-400 bg-emerald-950/30 border-emerald-500/30'
        };
      case 'reviewer':
      case 'qa':
        return {
          name: 'QA Agent',
          icon: <Wrench size={16} className="text-amber-400" />,
          color: 'text-amber-400 bg-amber-950/30 border-amber-500/30'
        };
      case 'designer':
        return {
          name: 'Designer',
          icon: <Palette size={16} className="text-pink-400" />,
          color: 'text-pink-400 bg-pink-950/30 border-pink-500/30'
        };
      default:
        return {
          name: 'Bereit',
          icon: <Bot size={16} className="text-slate-400" />,
          color: 'text-slate-400 bg-slate-800/30 border-slate-700/30'
        };
    }
  };

  const agentInfo = getAgentInfo(activeAgent);

  const getStatusIcon = () => {
    switch (status) {
      case 'working':
        return <Loader2 size={14} className="animate-spin text-blue-400" />;
      case 'success':
        return <CheckCircle2 size={14} className="text-emerald-400" />;
      case 'error':
        return <AlertCircle size={14} className="text-red-400" />;
      default:
        return null;
    }
  };

  if (!activeAgent && status === 'idle') {
    return (
      <div className="px-4 py-2 bg-[#020408]/50 border border-slate-800 rounded-lg flex items-center gap-2">
        <Bot size={16} className="text-slate-500" />
        <span className="text-sm text-slate-500">NeXifyAI Team bereit</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 bg-[#020408]/50 border border-slate-800 rounded-lg flex items-center gap-3">
      <div className={`p-1.5 rounded border ${agentInfo.color}`}>
        {agentInfo.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200 truncate">{agentInfo.name}</span>
          {getStatusIcon()}
        </div>
        {message && (
          <div className="text-xs text-slate-500 truncate mt-0.5">{message}</div>
        )}
      </div>
    </div>
  );
};

/**
 * Agent Status List - Zeigt alle Agenten mit ihrem Status
 */
interface AgentStatusListProps {
  agents: Array<{
    type: AgentType;
    status: AgentStatus;
    message?: string;
  }>;
}

export const AgentStatusList: React.FC<AgentStatusListProps> = ({ agents }) => {
  return (
    <div className="space-y-2">
      {agents.map((agent, idx) => (
        <AgentStatus
          key={idx}
          activeAgent={agent.type}
          status={agent.status}
          message={agent.message}
        />
      ))}
    </div>
  );
};

