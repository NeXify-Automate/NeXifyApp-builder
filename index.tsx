import React, { useState, useRef, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Send, Loader2, PanelLeftClose, PanelLeftOpen, Code, Play, FileCode, Terminal, Settings,
  Menu, X, ChevronRight, ChevronDown, ChevronLeft, Layout, RefreshCw, Box, Monitor, Cloud,
  Check, ShieldCheck, Sparkles, Bot, BrainCircuit, Zap, PenTool, Palette, Wrench, BookOpen,
  Plus, Trash2, FolderOpen, Rocket, ExternalLink, CheckCircle2, AlertCircle, FolderPlus,
  Cpu, Activity, Database, Key, Eye, EyeOff, Edit2, Play as PlayIcon, Download, Upload, 
  FileJson, MessageSquareQuote, Layers, Briefcase, Image as ImageIcon, Lightbulb, Square, Pause,
  Shield, Globe, MapPin, Lock, Server, FileText, CreditCard
} from 'lucide-react';
// NeXifyAI Agenten
import { getPromptExpert } from './src/agents/promptExpert';
import { getArchitect } from './src/agents/architect';
import { getQAAgent } from './src/agents/qaAgent';
import { getDesigner } from './src/agents/designer';
import { getDocuBot } from './src/agents/docuBot';
import { getModelRouter } from './src/lib/modelRouter';
import { SettingsModal } from './src/components/SettingsModal';
import { AgentStatus } from './src/components/AgentStatus';
import { InterviewModal, type InterviewAnswers } from './src/components/InterviewModal';
import { PaymentModal } from './src/components/PaymentModal';
import { autoSaveProject, saveProject, updateProject } from './src/lib/supabase/projects';
import { saveConcept, saveDesignSystem, saveDecision, saveBrainEntry, getRelevantContext } from './src/lib/supabase/brain';
import { supabase } from './src/lib/supabase/client';
import { runCICDPipeline } from './src/lib/cicd/buildSystem';
import { getCICDMonitor } from './src/lib/cicd/monitor';
import { getPerformanceOptimizer } from './src/lib/cicd/performance';

// --- Configuration & Constants ---

const DEFAULT_SUPABASE_URL = "https://twjssiysjhnxjqilmwlq.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_YcXRDy6Zpdcda43SzQgj-w_Tz0P5RI4";

// --- Types ---

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

interface Project {
  id: string;
  name: string;
  files: FileNode[];
  createdAt: number;
  updatedAt: number;
  systemPrompt?: string;
  supabaseConfig?: SupabaseConfig;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  agent?: AgentType; 
  meta?: string;
  images?: string[];
}

type AgentType = 'orchestrator' | 'coder' | 'reviewer' | 'fixer' | 'database_architect' | 'system' | 'prompt_expert' | 'planner' | 'creative';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
  isOpen?: boolean;
}

interface TerminalLog {
  id: string;
  timestamp: number;
  source: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'agent';
}

// --- Utilities ---

const findNodeByPath = (nodes: FileNode[], path: string): FileNode | null => {
  for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
          const found = findNodeByPath(node.children, path);
          if (found) return found;
      }
  }
  return null;
};

const updateNodeByPath = (nodes: FileNode[], path: string, updater: (node: FileNode) => FileNode): FileNode[] => {
  return nodes.map(node => {
      if (node.path === path) return updater(node);
      if (node.children) return { ...node, children: updateNodeByPath(node.children, path, updater) };
      return node;
  });
};

const ensureFolderExists = (nodes: FileNode[], currentParts: string[], currentPath: string): FileNode[] => {
  if(currentParts.length === 0) return nodes;
  const folderName = currentParts[0];
  const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
  const existing = nodes.find(n => n.name === folderName && n.type === 'folder');
  
  if(existing) {
      return nodes.map(n => n === existing ? { ...n, children: ensureFolderExists(n.children || [], currentParts.slice(1), folderPath) } : n);
  } else {
      const newFolder: FileNode = { name: folderName, path: folderPath, type: 'folder', children: [], isOpen: true };
      newFolder.children = ensureFolderExists([], currentParts.slice(1), folderPath);
      return [...nodes, newFolder];
  }
};

const addNodeToTarget = (nodes: FileNode[], targetPath: string, newNode: FileNode): FileNode[] => {
  if (targetPath === '') return [...nodes.filter(n => n.path !== newNode.path), newNode]; 
  return nodes.map(node => {
      if (node.path === targetPath) {
          const children = node.children || [];
          return { ...node, children: [...children.filter(n => n.path !== newNode.path), newNode], isOpen: true };
      }
      if (node.children) return { ...node, children: addNodeToTarget(node.children, targetPath, newNode) };
      return node;
  });
};

const removeNodeRecursive = (nodes: FileNode[], pathToRemove: string): FileNode[] => {
  return nodes.filter(n => n.path !== pathToRemove).map(n => {
      if(n.children) return {...n, children: removeNodeRecursive(n.children, pathToRemove)};
      return n;
  });
};

const cleanJson = (text: string): string => {
    try {
        const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/) || text.match(/{[\s\S]*}/);
        if (match) {
            return match[1] || match[0];
        }
        return text;
    } catch (e) {
        return text;
    }
};

// --- Project Context ---

interface ProjectContextType {
  project: Project;
  updateFileContent: (path: string, content: string) => void;
  createNode: (path: string, type: 'file' | 'folder', content?: string) => void;
  deleteNode: (path: string) => void;
  updateSupabaseConfig: (config: SupabaseConfig) => void;
  openFiles: FileNode[];
  activeFile: FileNode | null;
  handleFileSelect: (file: FileNode) => void;
  handleFileClose: (file: FileNode) => void;
  saveStatus: 'saved' | 'saving';
  logs: TerminalLog[];
  addLog: (source: string, message: string, type?: 'info' | 'success' | 'warning' | 'error' | 'agent') => void;
  setActiveModal: (modal: 'none' | 'settings' | 'docs' | 'supabase') => void;
  showNotification: (msg: string, type: 'success' | 'error' | 'info') => void;
  activeModal: 'none' | 'settings' | 'docs' | 'supabase' | 'payment';
  notification: { message: string, type: 'success' | 'error' | 'info' } | null;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within a ProjectProvider');
  return context;
};

// --- Initial Data ---

const INITIAL_FILES: FileNode[] = [
  { name: 'src', type: 'folder', isOpen: true, path: 'src', children: [
      { name: 'brain', type: 'folder', isOpen: true, path: 'src/brain', children: [
          { name: 'read_me.md', path: 'src/brain/read_me.md', type: 'file', content: '# NeXify Brain - EU Hosted Core\n\nDieser Ordner enthält das zentrale Wissen des Projekts.\nAgenten speichern hier Konzepte, Design-Systeme und Strategien.\n\n- concept.md: Business Plan & Features\n- marketing.md: Zielgruppen & Strategie\n- design.json: Farben, Fonts, Assets' }
      ]},
      { name: 'App.tsx', path: 'src/App.tsx', type: 'file', content: `import React, { useState, useEffect } from "react";
import { Rocket, Sparkles, Database, CheckCircle2, ShieldCheck, Server } from "lucide-react";
import { supabase } from "./lib/supabase";

export default function App() {
  const [dbStatus, setDbStatus] = useState<string>("Initializing Connection...");

  useEffect(() => {
    async function checkConnection() {
      try {
        // Simple check to see if we can reach Supabase
        const { data, error } = await supabase.from('test').select('*').limit(1).maybeSingle();
        if (error && error.code !== 'PGRST116') {
             console.log("Supabase reachable, table might be missing (Expected on fresh init)", error.message);
             setDbStatus("Connected (No Tables)");
        } else {
             setDbStatus("Securely Connected");
        }
      } catch (e) {
        setDbStatus("Client Ready (Offline)");
      }
    }
    checkConnection();
  }, []);

  return (
    <div className="min-h-screen bg-[#020408] flex flex-col items-center justify-center text-slate-100 font-sans p-4 relative overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-[128px]"></div>
          <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-emerald-900/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="bg-[#0B0F17]/80 backdrop-blur-xl border border-slate-800 p-10 rounded-2xl shadow-2xl max-w-xl w-full text-center relative z-10 animate-fade-in">
        
        {/* Header Badge */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 bg-emerald-950/30 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium tracking-wide">
            <ShieldCheck size={10} /> DSGVO READY
        </div>

        <div className="flex justify-center mb-8 relative">
           <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full scale-75 animate-pulse"></div>
           <div className="bg-[#1E293B]/50 p-5 rounded-full ring-1 ring-white/10 relative">
              <Rocket size={48} className="text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
           </div>
        </div>
        
        <h1 className="text-5xl font-extrabold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent mb-5 tracking-tight">NeXifyAI Ready</h1>
        
        <p className="text-slate-400 mb-10 leading-relaxed text-sm max-w-md mx-auto">
          Dein autonomes <span className="text-slate-200 font-medium">Enterprise Team</span> steht bereit.
          <br/>
          Hosting in Venlo, NL. Powered by Gemini 3.
        </p>

        <div className="grid grid-cols-2 gap-4 text-left bg-[#020408]/50 p-5 rounded-xl border border-slate-800/50 mb-8">
           <div className="flex flex-col gap-1">
               <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Core System</span>
               <div className="flex items-center gap-2 text-sm text-slate-300 font-medium"><Sparkles size={14} className="text-yellow-400"/> Brain Active</div>
           </div>
           <div className="flex flex-col gap-1">
               <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Backend Status</span>
               <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium"><Server size={14} /> {dbStatus}</div>
           </div>
        </div>
        
        <button className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] active:scale-[0.98]">
            Dashboard öffnen
        </button>
      </div>
      
      <div className="mt-8 text-xs text-slate-600 font-mono">
         Process ID: {Math.random().toString(36).substring(7).toUpperCase()} • Region: eu-central-1 (Venlo)
      </div>
    </div>
  );
}` },
      { name: 'index.css', path: 'src/index.css', type: 'file', content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;' },
      { name: 'lib', type: 'folder', isOpen: true, path: 'src/lib', children: [
        { name: 'supabase', type: 'folder', isOpen: true, path: 'src/lib/supabase', children: [
          { name: 'client.ts', path: 'src/lib/supabase/client.ts', type: 'file', content: `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '${DEFAULT_SUPABASE_URL}';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '${DEFAULT_SUPABASE_KEY}';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});` }
        ]}
      ]}
    ]
  },
  { name: 'package.json', path: 'package.json', type: 'file', content: JSON.stringify({
    "name": "nexify-project",
    "version": "1.0.0",
    "dependencies": {
      "react": "^18.2.0",
      "react-dom": "^18.2.0",
      "lucide-react": "^0.263.1",
      "tailwindcss": "^3.4.1",
      "@supabase/supabase-js": "^2.39.0",
      "clsx": "^2.0.0",
      "tailwind-merge": "^2.0.0",
      "framer-motion": "^10.16.4"
    }
  }, null, 2) },
  { name: 'index.html', path: 'index.html', type: 'file', content: '<!DOCTYPE html><html><head><meta charset="UTF-8" /><link href="/src/index.css" rel="stylesheet"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>' },
];

const INITIAL_PROJECT: Project = {
  id: 'default-project',
  name: 'NeXify Startup',
  files: INITIAL_FILES,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  supabaseConfig: { url: DEFAULT_SUPABASE_URL, anonKey: DEFAULT_SUPABASE_KEY }
};

// --- Components ---

const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<Project>(INITIAL_PROJECT);
  const [openFiles, setOpenFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [logs, setLogs] = useState<TerminalLog[]>([]);
  const [activeModal, setActiveModal] = useState<'none' | 'settings' | 'docs' | 'supabase' | 'payment'>('none');
  
  // Agent-Status für UI
  const [agentStatus, setAgentStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  const addLog = useCallback((source: string, message: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent' = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substring(2), timestamp: Date.now(), source, message, type }]);
  }, []);

  const showNotification = useCallback((msg: string, type: 'success' | 'error' | 'info') => {
      setNotification({message: msg, type});
      setTimeout(() => setNotification(null), 3000);
  }, []);

  const updateFileContent = useCallback((path: string, content: string) => {
    setProject(p => {
      const updated = {...p, files: updateNodeByPath(p.files, path, node => ({...node, content})), updatedAt: Date.now()};
      
      // Auto-Save in Supabase (wenn User eingeloggt)
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          autoSaveProject(p.id !== 'default-project' ? p.id : null, {
            name: updated.name,
            files: updated.files,
            supabaseConfig: updated.supabaseConfig
          }, user.id);
        }
      });
      
      return updated;
    });
    setActiveFile(prev => prev?.path === path ? { ...prev, content } : prev);
  }, []);

  const createNode = useCallback((parentPath: string, type: 'file' | 'folder', content: string = '', specificPath?: string) => {
      let newName: string;
      let targetPath: string;
      let newPath: string;
      
      if (specificPath) {
          // Verwende spezifischen Pfad (z.B. für src/brain/concept.md)
          newPath = specificPath;
          const parts = specificPath.split('/');
          newName = parts[parts.length - 1];
          parts.pop();
          targetPath = parts.join('/');
      } else {
          // Standard-Verhalten: Erstelle neue Datei/Ordner
          newName = type === 'file' ? `new-file-${Date.now()}.tsx` : 'new-folder';
          targetPath = parentPath;
          if (parentPath.includes('.')) { 
              const parts = parentPath.split('/');
              parts.pop();
              targetPath = parts.join('/');
          }
          newPath = targetPath ? `${targetPath}/${newName}` : newName;
      }
      
      const newNode: FileNode = { 
          name: newName, 
          path: newPath, 
          type, 
          children: type === 'folder' ? [] : undefined, 
          content: type === 'file' ? content : undefined 
      };
      
      setProject(p => {
          const filesWithFolders = ensureFolderExists(p.files, targetPath.split('/').filter(Boolean), '');
          return { ...p, files: addNodeToTarget(filesWithFolders, targetPath, newNode) };
      });
      if(newNode.type === 'file') handleFileSelect(newNode);
  }, [handleFileSelect]);

  const deleteNode = useCallback((path: string) => {
    setProject(p => ({...p, files: removeNodeRecursive(p.files, path)}));
    handleFileClose({path} as FileNode);
  }, [handleFileClose]);

  const updateSupabaseConfig = useCallback((config: SupabaseConfig) => {
    setProject(p => ({ ...p, supabaseConfig: config }));
    showNotification("Supabase Verbindung aktualisiert", "success");
  }, [showNotification]);

  const handleFileSelect = useCallback((file: FileNode) => {
    const fullFile = findNodeByPath(project.files, file.path);
    if(fullFile && fullFile.type === 'file'){
      setOpenFiles(prev => {
          if (!prev.some(f => f.path === fullFile.path)) return [...prev, fullFile];
          return prev;
      });
      setActiveFile(fullFile);
    }
  }, [project.files]);
  
  const handleFileClose = useCallback((fileToClose: FileNode) => {
    setOpenFiles(prev => {
        const newOpenFiles = prev.filter(f => f.path !== fileToClose.path);
        if (activeFile?.path === fileToClose.path) {
          setActiveFile(newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null);
        }
        return newOpenFiles;
    });
  }, [activeFile]);

  // CI/CD 24/7 Monitor initialisieren
  useEffect(() => {
    const monitor = getCICDMonitor();
    const optimizer = getPerformanceOptimizer();

    // Starte Monitor mit Performance-Optimierung
    const getProjectFiles = (): Record<string, string> => {
      const files: Record<string, string> = {};
      const collectFiles = (nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.type === 'file' && node.content) {
            files[node.path] = node.content;
          }
          if (node.children) {
            collectFiles(node.children);
          }
        }
      };
      collectFiles(project.files);
      return files;
    };

    const handleMonitorStatusChange = (status: any) => {
      if (status.lastResult && status.lastResult.success) {
        addLog('CI/CD Monitor', `Build erfolgreich (${status.successfulBuilds}/${status.totalChecks})`, 'success');
      } else if (status.lastResult && !status.lastResult.success) {
        addLog('CI/CD Monitor', `${status.lastResult.errors.length} Fehler gefunden`, 'warning');
      }
    };

    const handleBuildResult = (result: any) => {
      if (result.metrics) {
        addLog('CI/CD', `Qualität: ${result.metrics.codeQuality}, Komplexität: ${result.metrics.complexity}`, 'info');
      }
      if (result.optimizations && result.optimizations.length > 0) {
        addLog('CI/CD', `${result.optimizations.length} Optimierungen gefunden`, 'success');
      }
    };

    // Starte Monitor (nur wenn Projekt Dateien hat)
    if (project.files.length > 0) {
      monitor.start(
        getProjectFiles,
        handleMonitorStatusChange,
        handleBuildResult
      );
    }

    return () => {
      monitor.stop();
    };
  }, [project.files, addLog]);

  return (
    <ProjectContext.Provider value={{
      project, updateFileContent, createNode, deleteNode, updateSupabaseConfig,
      openFiles, activeFile, handleFileSelect, handleFileClose, saveStatus, logs, addLog,
      setActiveModal, showNotification, activeModal, notification
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

const FileTreeItem: React.FC<{ node: FileNode, level: number }> = ({ node, level }) => {
  const { handleFileSelect, activeFile, project } = useProject();
  const [isOpen, setIsOpen] = useState(node.isOpen || false);
  
  const handleClick = () => {
    if (node.type === 'folder') setIsOpen(!isOpen);
    else handleFileSelect(node);
  };

  return (
    <div className="select-none">
      <div 
        className={`flex items-center py-1 px-2 cursor-pointer transition-all duration-200 group
          ${activeFile?.path === node.path ? 'bg-blue-500/20 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}
        `}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        <span className="mr-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
          {node.type === 'folder' ? (
            <ChevronRight size={14} className={`transform transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
          ) : (
            <FileCode size={14} />
          )}
        </span>
        <span className="text-xs font-medium truncate">{node.name}</span>
      </div>
      {node.type === 'folder' && isOpen && node.children && (
        <div className="animate-slide-up origin-top">
          {node.children.map(child => <FileTreeItem key={child.path} node={child} level={level + 1} />)}
        </div>
      )}
    </div>
  );
};

const TerminalView = () => {
  const { logs } = useProject();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  return (
    <div className="h-full bg-[#0B0F17] flex flex-col font-mono text-xs border-t border-slate-800">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0F1623] border-b border-slate-800">
         <div className="flex items-center gap-2 text-slate-400">
             <Terminal size={14} />
             <span className="font-semibold uppercase tracking-wider text-[10px]">NeXify Core Terminal</span>
         </div>
         <div className="flex gap-2">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
         </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {logs.length === 0 && <div className="text-slate-600 italic">System bereit. Warte auf Agenten-Input...</div>}
        {logs.map(log => (
          <div key={log.id} className="flex gap-3 animate-fade-in group">
            <span className="text-slate-600 shrink-0 select-none">[{new Date(log.timestamp).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'})}]</span>
            <div className="flex-1 break-words leading-relaxed">
              <span className={`font-bold mr-2 uppercase text-[10px] px-1.5 py-0.5 rounded tracking-wide
                ${log.type === 'error' ? 'bg-red-950 text-red-400' : 
                  log.type === 'success' ? 'bg-emerald-950 text-emerald-400' : 
                  log.type === 'agent' ? 'bg-blue-950 text-blue-400' : 
                  'bg-slate-800 text-slate-300'}`}>
                {log.source}
              </span>
              <span className={`
                ${log.type === 'error' ? 'text-red-300' : 
                  log.type === 'success' ? 'text-emerald-300' : 
                  log.type === 'warning' ? 'text-amber-300' : 
                  log.type === 'agent' ? 'text-blue-100' : 
                  'text-slate-300'}`}>
                {log.message}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Agent Logic ---

const AgentSystem = () => {
    const { addLog, project, createNode, updateFileContent, activeFile, openFiles, showNotification } = useProject();
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [currentAgent, setCurrentAgent] = useState<AgentType | null>(null);
    const [agentStatus, setAgentStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
    const [showInterview, setShowInterview] = useState(false);
    const [interviewAnswers, setInterviewAnswers] = useState<InterviewAnswers | null>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    // Alte callAgent-Funktion entfernt - wird jetzt über ModelRouter verwendet

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isProcessing) return;
        setShowInterview(true);
    };

    const handleInterviewComplete = async (answers: InterviewAnswers) => {
        setInterviewAnswers(answers);
        setShowInterview(false);
        const userInput = input;
        setInput('');
        await orchestrate(userInput, answers);
    };

    const handleInterviewSkip = () => {
        setShowInterview(false);
        const userInput = input;
        setInput('');
        orchestrate(userInput, null);
    };

    const orchestrate = async (userInput: string, interviewData: InterviewAnswers | null = null) => {
        setIsProcessing(true);
        setAgentStatus('working');
        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userInput, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);

        try {
            // Initialisiere Agenten
            const promptExpert = getPromptExpert();
            const architect = getArchitect();
            const designer = getDesigner();
            const qaAgent = getQAAgent();
            const docuBot = getDocuBot();
            const modelRouter = getModelRouter();

            // Step 1: Prompt Expert - Analysiere und optimiere User-Input
            setCurrentAgent('prompt_expert');
            addLog('Prompt Expert', 'Analysiere User-Intent und optimiere Eingabe...', 'agent');
            
            const fileStructure = project.files.map(f => f.path);
            
            // RAG: Hole relevantes Wissen aus dem Brain
            let brainContext = '';
            if (project.id !== 'default-project') {
                try {
                    brainContext = await getRelevantContext(project.id, userInput, 3);
                    if (brainContext && !brainContext.includes('Kein relevantes Wissen')) {
                        addLog('RAG', 'Relevantes Wissen aus Brain geladen', 'success');
                    }
                } catch (error) {
                    console.warn('Fehler beim Laden des Brain-Contexts:', error);
                }
            }
            
            // Integriere Interview-Daten in den Prompt
            let enhancedInput = userInput;
            if (brainContext) {
                enhancedInput += `\n\nRelevantes Projekt-Wissen:\n${brainContext}`;
            }
            if (interviewData) {
                if (interviewData.designStyle) enhancedInput += `\nDesign-Stil: ${interviewData.designStyle}`;
                if (interviewData.targetAudience) enhancedInput += `\nZielgruppe: ${interviewData.targetAudience}`;
                if (interviewData.colorPreferences?.length) enhancedInput += `\nFarb-Präferenzen: ${interviewData.colorPreferences.join(', ')}`;
                if (interviewData.referenceUrl) enhancedInput += `\nReferenz-URL: ${interviewData.referenceUrl}`;
                if (interviewData.features?.length) enhancedInput += `\nWichtige Features: ${interviewData.features.join(', ')}`;
            }
            
            const analysis = await promptExpert.optimizePrompt(enhancedInput, {
                existingFiles: fileStructure,
                designSystem: null,
                referenceUrl: interviewData?.referenceUrl
            });
            
            addLog('Prompt Expert', `Intent erkannt: ${analysis.intent}`, 'success');
            if (analysis.missingDetails.length > 0) {
                addLog('Prompt Expert', `Fehlende Details: ${analysis.missingDetails.join(', ')}`, 'warning');
            }

            // Step 2: Architect - Erstelle Business-Konzept
            setCurrentAgent('architect');
            addLog('Architect', 'Erstelle vollständiges Business-Konzept...', 'agent');
            
            const businessConcept = await architect.createBusinessConcept(analysis.optimizedPrompt);
            
            // Speichere Konzept
            const conceptMarkdown = `# Business-Konzept

## Summary
${businessConcept.summary}

## Zielgruppe
${businessConcept.targetAudience}

## Features
${businessConcept.features.map(f => `- ${f}`).join('\n')}

## Tech Stack
${businessConcept.techStack.map(t => `- ${t}`).join('\n')}

${businessConcept.dbSchema ? `## Database Schema\n\`\`\`sql\n${businessConcept.dbSchema}\n\`\`\`` : ''}

${businessConcept.marketingStrategy ? `## Marketing-Strategie\n${businessConcept.marketingStrategy}` : ''}
`;
            
            // Stelle sicher, dass src/brain Ordner existiert
            createNode('src', 'folder', '', 'src/brain');
            // Erstelle concept.md Datei
            createNode('src/brain', 'file', conceptMarkdown, 'src/brain/concept.md');
            
            // Speichere im Brain (RAG-System)
            const { data: { user } } = await supabase.auth.getUser();
            if (user && project.id !== 'default-project') {
                await saveConcept(project.id, conceptMarkdown);
            }
            
            addLog('Architect', 'Business-Konzept erstellt und gespeichert.', 'success');

            // Step 2.5: Architect - Erstelle Marketing-Strategie
            setCurrentAgent('architect');
            addLog('Architect', 'Erstelle Marketing-Strategie...', 'agent');
            
            const marketingStrategy = await architect.createMarketingStrategy(businessConcept);
            const marketingMarkdown = `# Marketing-Strategie\n\n${marketingStrategy}`;
            
            // Erstelle marketing.md Datei
            createNode('src/brain', 'file', marketingMarkdown, 'src/brain/marketing.md');
            
            // Speichere Marketing-Strategie im Brain
            const { data: { user: userMarketing } } = await supabase.auth.getUser();
            if (userMarketing && project.id !== 'default-project') {
                await saveBrainEntry(project.id, marketingMarkdown, 'marketing', {
                    source: 'architect',
                    timestamp: new Date().toISOString()
                });
            }
            
            addLog('Architect', 'Marketing-Strategie erstellt und gespeichert.', 'success');

            // Step 3: Designer - Erstelle Design-System
            setCurrentAgent('designer');
            addLog('Designer', 'Generiere Design-System und Assets...', 'agent');
            
            const designSystem = await designer.createDesignSystem(businessConcept);
            const designJson = JSON.stringify(designSystem, null, 2);
            // Erstelle design.json Datei mit spezifischem Pfad
            createNode('src/brain', 'file', designJson, 'src/brain/design.json');
            
            // Speichere Design-System im Brain
            const { data: { user: user2 } } = await supabase.auth.getUser();
            if (user2 && project.id !== 'default-project') {
                await saveDesignSystem(project.id, designSystem);
            }
            
            // Erstelle Tailwind Config
            const tailwindConfig = designer.createTailwindConfig(designSystem);
            createNode('', 'file', tailwindConfig, 'tailwind.config.js');
            
            addLog('Designer', 'Design-System erstellt.', 'success');

            // Step 4: Architect - Erstelle DB-Schema
            setCurrentAgent('architect');
            addLog('Architect', 'Erstelle Datenbank-Schema...', 'agent');
            
            const dbSchema = await architect.createDatabaseSchema(businessConcept);
            const schemaMarkdown = `# Database Schema

## Tabellen

${dbSchema.tables.map(table => `
### ${table.name}
${table.description}

**Spalten:**
${table.columns.map(col => `- \`${col.name}\` (${col.type}): ${col.description}${col.constraints ? ` [${col.constraints.join(', ')}]` : ''}`).join('\n')}

${table.relationships ? `**Beziehungen:**\n${table.relationships.map(rel => `- ${rel.type} → ${rel.table}`).join('\n')}` : ''}
`).join('\n')}

## Migrations

\`\`\`sql
${dbSchema.migrations?.join('\n\n') || '-- Keine Migrationen definiert'}
\`\`\`
`;
            
            // Erstelle database.md Datei mit spezifischem Pfad
            createNode('src/brain', 'file', schemaMarkdown, 'src/brain/database.md');
            addLog('Architect', 'Datenbank-Schema erstellt.', 'success');

            // Step 5: Architect - Generiere Code
            setCurrentAgent('coder');
            addLog('Architect', 'Generiere React-Komponenten und Code...', 'agent');
            
            const codingPrompt = `
Implementiere eine vollständige React-App basierend auf:

Business-Konzept: ${businessConcept.summary}
Features: ${businessConcept.features.join(', ')}
Design-System: ${JSON.stringify(designSystem.colors)}

Technische Anforderungen:
- React 18 mit TypeScript
- TailwindCSS (nutze die erstellte tailwind.config.js)
- Lucide React für Icons
- Supabase für Backend (nutze import.meta.env.VITE_SUPABASE_URL)
- Dark Mode Design mit den definierten Farben

Vorhandene Dateien:
${fileStructure.join('\n')}

WICHTIG:
- Antworte als JSON Array von Datei-Objekten
- Jede Datei muss vollständig und funktionsfähig sein
- Nutze das Design-System konsequent

Format:
[
  { "path": "src/components/Header.tsx", "content": "..." },
  { "path": "src/App.tsx", "content": "..." }
]
`;

            const config = modelRouter.selectModel('coding', 'high');
            if (!config) {
                throw new Error('Kein verfügbares Modell für Code-Generierung');
            }

            const codeResponse = await modelRouter.callModel(
                config,
                codingPrompt,
                'Du bist ein Senior React Architect. Erstelle vollständigen, produktionsreifen Code. Antworte NUR mit validem JSON.'
            );

            const cleanedJson = cleanJson(codeResponse.content);
            let filesToCreate: any[] = [];
            
            try {
                filesToCreate = JSON.parse(cleanedJson);
            } catch (e) {
                addLog('Architect', 'JSON Parsing fehlgeschlagen. Starte QA-Fixer...', 'error');
                // QA Agent repariert den Code
                const fixedCode = await qaAgent.fixCode(cleanedJson, 'generated-code.json', [{
                    type: 'error',
                    severity: 'high',
                    file: 'generated-code.json',
                    message: 'JSON Parsing fehlgeschlagen',
                    suggestion: 'Repariere JSON-Syntax'
                }]);
                filesToCreate = JSON.parse(cleanJson(fixedCode));
            }

            // Step 6: QA Agent - Prüfe Code-Qualität
            setCurrentAgent('qa');
            addLog('QA Agent', `Prüfe ${filesToCreate.length} Dateien auf Qualität...`, 'agent');
            
            const reviewedFiles: any[] = [];
            for (const file of filesToCreate) {
                const review = await qaAgent.reviewCode(
                    file.content,
                    file.path,
                    {
                        projectFiles: fileStructure,
                        designSystem
                    }
                );

                if (!review.passed) {
                    addLog('QA Agent', `${file.path}: ${review.issues.length} Issues gefunden`, 'warning');
                    
                    // Versuche automatische Reparatur
                    if (review.issues.some(i => i.severity === 'critical' || i.severity === 'high')) {
                        addLog('QA Agent', `Repariere kritische Issues in ${file.path}...`, 'agent');
                        file.content = await qaAgent.fixCode(file.content, file.path, review.issues);
                    }
                }

                reviewedFiles.push(file);
            }

            // Step 7: Erstelle Dateien
            setCurrentAgent('reviewer');
            addLog('System', 'Erstelle Dateien...', 'agent');
            
            const filesForDocu: Array<{ path: string; purpose: string }> = [];
            const projectFilesMap: Record<string, string> = {};
            
            // Sammle alle Dateien für CI/CD (inkl. Brain-Dateien und Config)
            // Lade bestehende Dateien aus dem Projekt
            const collectAllFiles = (nodes: FileNode[]): void => {
                for (const node of nodes) {
                    if (node.type === 'file' && node.content) {
                        projectFilesMap[node.path] = node.content;
                    }
                    if (node.children) {
                        collectAllFiles(node.children);
                    }
                }
            };
            collectAllFiles(project.files);
            
            // Füge Brain-Dateien hinzu (die bereits erstellt wurden)
            // Diese werden aus dem aktuellen Projekt-Status geladen
            const brainFiles = ['src/brain/concept.md', 'src/brain/marketing.md', 'src/brain/design.json', 'src/brain/database.md'];
            for (const brainPath of brainFiles) {
                const brainFile = findNodeByPath(project.files, brainPath);
                if (brainFile && brainFile.content) {
                    projectFilesMap[brainPath] = brainFile.content;
                }
            }
            
            for (const file of reviewedFiles) {
                if (file.path.includes('/')) {
                    createNode(file.path, 'file', file.content, file.path);
                } else {
                    createNode('', 'file', file.content, file.path);
                }
                
                // Sammle für CI/CD Pipeline
                projectFilesMap[file.path] = file.content;
                
                // Bestimme Purpose der Datei
                let purpose = 'React-Komponente';
                if (file.path.includes('.tsx')) purpose = 'React-Komponente';
                else if (file.path.includes('.ts')) purpose = 'TypeScript-Modul';
                else if (file.path.includes('.css')) purpose = 'Styling';
                else if (file.path.includes('.json')) purpose = 'Konfiguration';
                else if (file.path.includes('.md')) purpose = 'Dokumentation';
                else if (file.path.includes('.js')) purpose = 'Konfiguration';
                
                filesForDocu.push({ path: file.path, purpose });
                addLog('System', `✓ ${file.path}`, 'success');
            }
            
            // Füge auch tailwind.config.js hinzu
            if (tailwindConfig) {
                projectFilesMap['tailwind.config.js'] = tailwindConfig;
            }
            
            // Step 8: CI/CD Pipeline - Build & Auto-Fix (KI-optimiert)
            setCurrentAgent('cicd');
            addLog('CI/CD', 'Starte KI-optimierte Build-Pipeline...', 'agent');
            
            try {
                const optimizer = getPerformanceOptimizer();
                
                // Prüfe Cache für beschleunigten Build
                const cachedResult = optimizer.getCachedResult(projectFilesMap);
                let buildResult;
                
                if (cachedResult) {
                    addLog('CI/CD', 'Cache-Hit: Verwende gecachtes Build-Result', 'info');
                    buildResult = cachedResult;
                } else {
                    // Performance-Optimierung für Speed
                    const perfConfig = optimizer.optimizeForSpeed();
                    addLog('CI/CD', 'Führe Build mit Performance-Optimierung durch...', 'agent');
                    
                    buildResult = await runCICDPipeline(projectFilesMap, perfConfig.maxRetries);
                    
                    // Cache Result
                    optimizer.cacheResult(projectFilesMap, buildResult);
                }
                
                // Zeige Metriken
                if (buildResult.metrics) {
                    addLog('CI/CD', `📊 Metriken: ${buildResult.metrics.totalFiles} Dateien, ${buildResult.metrics.totalLines} Zeilen`, 'info');
                    addLog('CI/CD', `📈 Qualität: ${buildResult.metrics.codeQuality}, Komplexität: ${buildResult.metrics.complexity}`, 'info');
                    if (buildResult.metrics.securityIssues > 0) {
                        addLog('CI/CD', `⚠️ ${buildResult.metrics.securityIssues} Sicherheitsprobleme gefunden`, 'warning');
                    }
                }
                
                // Zeige Optimierungen
                if (buildResult.optimizations && buildResult.optimizations.length > 0) {
                    addLog('CI/CD', `✨ ${buildResult.optimizations.length} Optimierungen gefunden:`, 'success');
                    buildResult.optimizations.slice(0, 5).forEach(opt => {
                        addLog('CI/CD', `  • ${opt}`, 'info');
                    });
                }
                
                // Wenn Dateien repariert wurden, schreibe sie zurück
                if (buildResult.fixedFiles && buildResult.fixed) {
                    addLog('CI/CD', '🤖 Wende KI-reparierte Dateien an...', 'agent');
                    for (const [filePath, fixedContent] of Object.entries(buildResult.fixedFiles)) {
                        // Prüfe ob Datei bereits existiert
                        const existingFile = findNodeByPath(project.files, filePath);
                        if (existingFile) {
                            updateFileContent(filePath, fixedContent);
                        } else {
                            // Erstelle neue Datei
                            if (filePath.includes('/')) {
                                createNode(filePath, 'file', fixedContent, filePath);
                            } else {
                                createNode('', 'file', fixedContent, filePath);
                            }
                        }
                        addLog('CI/CD', `✓ ${filePath} repariert`, 'success');
                    }
                }
                
                if (buildResult.success) {
                    addLog('CI/CD', '✅ Build erfolgreich!', 'success');
                    if (buildResult.fixed) {
                        addLog('CI/CD', '🔧 Fehler automatisch behoben und angewendet', 'success');
                    }
                } else {
                    addLog('CI/CD', `❌ ${buildResult.errors.length} Fehler gefunden`, 'warning');
                    if (buildResult.errors.length > 0) {
                        addLog('CI/CD', `Fehler: ${buildResult.errors.slice(0, 3).join(', ')}`, 'error');
                    }
                }
            } catch (error: any) {
                addLog('CI/CD', `❌ Build-Fehler: ${error.message}`, 'error');
            }
            
            // Dokumentiere Code-Generierung
            if (project.id !== 'default-project') {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    await docuBot.documentDecision(project.id, 'orchestrator', 'Code-Generierung abgeschlossen', {
                        files: filesForDocu,
                        designSystem,
                        buildSuccess: true
                    } as any, user.id);
                }
            }

            setAgentStatus('success');
            addLog('Orchestrator', 'Mission erfolgreich abgeschlossen!', 'success');
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'model',
                content: `✅ Projekt erfolgreich erstellt!\n\n- Business-Konzept: src/brain/concept.md\n- Design-System: src/brain/design.json\n- DB-Schema: src/brain/database.md\n- ${reviewedFiles.length} Dateien generiert und geprüft`,
                timestamp: Date.now(),
                agent: 'orchestrator'
            }]);

        } catch (error: any) {
            setAgentStatus('error');
            addLog('System', `Kritischer Fehler: ${error.message}`, 'error');
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'model',
                content: `❌ Fehler: ${error.message}\n\nBitte überprüfe die API-Keys in den Settings oder versuche es erneut.`,
                timestamp: Date.now()
            }]);
        } finally {
            setIsProcessing(false);
            setCurrentAgent(null);
            setTimeout(() => setAgentStatus('idle'), 2000);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0B0F17]">
            <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-60">
                        <Bot size={48} className="mb-4 text-blue-500/50" />
                        <p className="text-sm">NeXifyAI Team bereit.</p>
                        <p className="text-xs">Prompt Expert • CPO • Creative • Architect • Reviewer</p>
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-slide-up`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 
                            ${msg.role === 'user' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                            {msg.role === 'user' ? <MessageSquareQuote size={16} /> : <Bot size={16} />}
                        </div>
                        <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-lg
                            ${msg.role === 'user' 
                                ? 'bg-blue-600/20 text-blue-100 border border-blue-500/30 rounded-tr-none' 
                                : 'bg-slate-800/50 text-slate-200 border border-slate-700 rounded-tl-none'}`}>
                            {msg.agent && (
                                <div className="mb-2 text-[10px] uppercase tracking-widest font-bold opacity-50 flex items-center gap-2">
                                    {msg.agent === 'planner' && <BrainCircuit size={12}/>}
                                    {msg.agent === 'coder' && <Code size={12}/>}
                                    {msg.agent}
                                </div>
                            )}
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                    </div>
                ))}
                {isProcessing && (
                    <div className="flex gap-4 animate-slide-up">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600/20 flex items-center justify-center shrink-0 animate-pulse">
                            <Bot size={16} className="text-emerald-400" />
                        </div>
                        <div className="flex items-center gap-3 text-slate-400 text-sm p-4 bg-slate-800/30 rounded-2xl border border-slate-800 rounded-tl-none">
                            <Loader2 size={16} className="animate-spin text-emerald-500" />
                            <span className="animate-pulse">
                                {currentAgent === 'prompt_expert' && "Prompt Expert optimiert..."}
                                {currentAgent === 'planner' && "CPO plant das Business-Konzept..."}
                                {currentAgent === 'creative' && "Creative Director generiert Assets..."}
                                {currentAgent === 'coder' && "Architect schreibt Code..."}
                                {currentAgent === 'reviewer' && "Reviewer prüft Qualität..."}
                                {!currentAgent && "NeXifyAI arbeitet..."}
                            </span>
                        </div>
                    </div>
                )}
            </div>
            <div className="p-4 bg-[#0F1623] border-t border-slate-800">
                {/* Agent Status */}
                <div className="mb-3">
                    <AgentStatus 
                        activeAgent={currentAgent}
                        status={agentStatus === 'working' ? 'working' : agentStatus === 'success' ? 'success' : agentStatus === 'error' ? 'error' : 'idle'}
                    />
                </div>
                
                <div className="relative">
                    <textarea 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if(e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if(input.trim() && !isProcessing) {
                                    handleSubmit(e);
                                }
                            }
                        }}
                        placeholder="Beschreibe deine App-Idee..."
                        className="w-full bg-[#020408] border border-slate-700 rounded-xl p-4 pr-12 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-none h-24 text-sm transition-all"
                    />
                    <button 
                        onClick={handleSubmit}
                        disabled={!input.trim() || isProcessing}
                        className="absolute right-3 bottom-3 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:hover:bg-blue-600 transition-all active:scale-95"
                    >
                        <Send size={16} />
                    </button>
                </div>
                <div className="flex justify-between items-center mt-3 text-[10px] text-slate-500 font-medium px-1">
                    <div className="flex gap-4">
                        <span className="flex items-center gap-1.5"><ShieldCheck size={10} className="text-emerald-500"/> DSGVO Safe</span>
                        <span className="flex items-center gap-1.5"><Server size={10} className="text-blue-500"/> Venlo Node EU-1</span>
                    </div>
                    <span>NeXifyAI Builder v2.0</span>
                </div>
            </div>
        </div>
    );
};

// --- Preview & Editor ---

const EditorPreviewArea = () => {
    const { activeFile, updateFileContent, project } = useProject();
    const [viewMode, setViewMode] = useState<'code' | 'preview'>('preview');
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Dynamic Preview Generation
    const previewContent = useMemo(() => {
        if (!project) return '';

        // Extract file contents
        const files: Record<string, string> = {};
        const traverse = (nodes: FileNode[]) => {
            nodes.forEach(node => {
                if (node.type === 'file') files[node.path] = node.content || '';
                if (node.children) traverse(node.children);
            });
        };
        traverse(project.files);

        // Simple Transpilation Logic
        const appCode = files['src/App.tsx'] || '';
        const cssCode = files['src/index.css'] || '';

        // Transpile Imports for the simple iframe runtime
        const transpiledAppCode = appCode
            .replace(/import\s+React.*?from\s+['"]react['"];?/g, 'const React = window.React; const { useState, useEffect, useRef } = React;')
            .replace(/import\s+{([^}]+)}\s+from\s+['"]lucide-react['"];?/g, 'const { $1 } = window.Lucide;')
            .replace(/import\s+{\s*createClient\s*}\s+from\s+['"]@supabase\/supabase-js['"];?/g, 'const { createClient } = window.supabase;')
            .replace(/import\s+{\s*supabase\s*}\s+from\s+['"].\/lib\/supabase['"];?/g, `const supabase = window.supabase.createClient("${project.supabaseConfig?.url}", "${project.supabaseConfig?.anonKey}");`)
            .replace(/export\s+default\s+function\s+App/, 'function App');

        return `
        <!DOCTYPE html>
        <html>
            <head>
                <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
                <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
                <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
                <script src="https://unpkg.com/lucide@latest"></script>
                <script src="https://unpkg.com/lucide-react@latest/dist/lucide-react.min.js"></script>
                <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>${cssCode}</style>
                <style>
                  .lucide { width: 1em; height: 1em; display: inline-block; }
                </style>
            </head>
            <body>
                <div id="root"></div>
                <script type="text/babel">
                    window.Lucide = window.LucideReact;
                    
                    ${transpiledAppCode}

                    const root = ReactDOM.createRoot(document.getElementById('root'));
                    root.render(<App />);
                </script>
            </body>
        </html>
        `;
    }, [project]);

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0B0F17]">
             {/* Toolbar */}
             <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-[#0F1623]">
                <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800">
                    <button 
                        onClick={() => setViewMode('preview')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'preview' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    >
                        <Play size={14} /> Preview
                    </button>
                    <button 
                        onClick={() => setViewMode('code')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'code' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    >
                        <Code size={14} /> Code
                    </button>
                </div>
                <div className="flex items-center gap-3">
                     <span className="text-xs text-slate-500 font-mono hidden md:block truncate max-w-[200px]">
                        {activeFile ? activeFile.path : 'Keine Datei ausgewählt'}
                     </span>
                     <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                        <RefreshCw size={14} onClick={() => { if(iframeRef.current) iframeRef.current.srcdoc = iframeRef.current.srcdoc; }} />
                     </button>
                </div>
             </div>

             {/* Content */}
             <div className="flex-1 overflow-hidden relative">
                {viewMode === 'code' ? (
                    activeFile ? (
                        <textarea 
                            value={activeFile.content || ''}
                            onChange={(e) => updateFileContent(activeFile.path, e.target.value)}
                            className="w-full h-full bg-[#020408] text-slate-300 font-mono text-sm p-4 focus:outline-none resize-none"
                            spellCheck={false}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-600">
                            <FileCode size={48} className="mb-4 opacity-20" />
                            <p>Wähle eine Datei zum Bearbeiten</p>
                        </div>
                    )
                ) : (
                    <iframe 
                        ref={iframeRef}
                        title="app-preview"
                        srcDoc={previewContent}
                        className="w-full h-full bg-white"
                        sandbox="allow-scripts allow-same-origin allow-modals"
                    />
                )}
             </div>
        </div>
    );
};

// --- Modals ---

const ModalOverlay = ({ children, onClose }: { children: React.ReactNode, onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in" onClick={onClose}>
        <div className="bg-[#0F1623] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg p-6 relative animate-zoom-in" onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
            {children}
        </div>
    </div>
);

const SupabaseModal = () => {
    const { project, updateSupabaseConfig, setActiveModal } = useProject();
    const [url, setUrl] = useState(project.supabaseConfig?.url || '');
    const [key, setKey] = useState(project.supabaseConfig?.anonKey || '');

    return (
        <ModalOverlay onClose={() => setActiveModal('none')}>
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Database className="text-emerald-500"/> Supabase Configuration</h2>
            <p className="text-slate-400 text-sm mb-6">Verbinde dein Projekt mit deinem eigenen Supabase Backend.</p>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Project URL</label>
                    <input value={url} onChange={e => setUrl(e.target.value)} className="w-full bg-[#020408] border border-slate-700 rounded-lg p-3 text-slate-200 focus:border-emerald-500 outline-none text-sm"/>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Anon Key</label>
                    <input value={key} onChange={e => setKey(e.target.value)} type="password" className="w-full bg-[#020408] border border-slate-700 rounded-lg p-3 text-slate-200 focus:border-emerald-500 outline-none text-sm"/>
                </div>
                <button 
                    onClick={() => { updateSupabaseConfig({url, anonKey: key}); setActiveModal('none'); }}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-emerald-900/20"
                >
                    Verbindung speichern
                </button>
            </div>
        </ModalOverlay>
    );
};

const DocumentationModal = () => {
    const { setActiveModal, project } = useProject();
    // Try to read documentation from the Brain
    const docFile = findNodeByPath(project.files, 'src/brain/read_me.md');
    const content = docFile?.content || "# Documentation\nNo documentation found in src/brain.";

    return (
        <ModalOverlay onClose={() => setActiveModal('none')}>
             <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><BookOpen className="text-blue-500"/> Project Brain</h2>
             <div className="bg-[#020408] p-4 rounded-lg border border-slate-800 max-h-[60vh] overflow-y-auto font-mono text-sm text-slate-300 whitespace-pre-wrap">
                {content}
             </div>
        </ModalOverlay>
    );
};

// --- Main App Shell ---

export default function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  return (
    <ProjectProvider>
      <div className="flex h-screen w-full bg-[#020408] text-slate-200 font-sans selection:bg-blue-500/30">
        
        {/* Sidebar */}
        <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-[#0F1623] border-r border-slate-800 flex flex-col transition-all duration-300 overflow-hidden relative`}>
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center gap-3 min-w-[256px]">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/30">
                    <Rocket className="text-white" size={18} />
                </div>
                <div>
                    <h1 className="font-bold text-sm text-white tracking-wide">NeXifyAI Builder</h1>
                    <span className="text-[10px] text-slate-500 font-medium">Venlo, NL • Enterprise</span>
                </div>
            </div>

            {/* File Tree */}
            <div className="flex-1 overflow-y-auto py-2">
                <FileTreeWrapper />
            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-slate-800 min-w-[256px]">
                <ActionButtons />
            </div>
        </div>

        {/* Toggle Sidebar */}
        <button 
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="absolute bottom-4 left-4 z-50 p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg border border-slate-700 shadow-xl transition-all"
        >
            {isSidebarOpen ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}
        </button>

        {/* Main Workspace */}
        <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
            <div className="flex-1 h-1/2 md:h-full border-r border-slate-800">
                <EditorPreviewArea />
            </div>
            <div className="w-full md:w-[450px] flex flex-col h-1/2 md:h-full bg-[#0B0F17]">
                <div className="flex-1 overflow-hidden">
                    <AgentSystem />
                </div>
                <div className="h-48 shrink-0">
                    <TerminalView />
                </div>
            </div>
        </div>

        {/* Modals */}
        <ModalManager />

        {/* Toast Notification */}
        <NotificationToast />

      </div>
    </ProjectProvider>
  );
}

// --- Subcomponents extracted for cleaner main file ---

const FileTreeWrapper = () => {
    const { project } = useProject();
    return (
        <div className="px-2">
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2 px-2 tracking-wider">Explorer</div>
            {project.files.map(node => <FileTreeItem key={node.path} node={node} level={0} />)}
        </div>
    );
};

const ActionButtons = () => {
    const { setActiveModal } = useProject();
    const [showSettings, setShowSettings] = useState(false);
    
    return (
        <>
            <div className="grid grid-cols-4 gap-2">
                 <button onClick={() => setActiveModal('supabase')} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-all group">
                    <Database size={16} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[9px]">DB Config</span>
                 </button>
                 <button onClick={() => setActiveModal('docs')} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all group">
                    <BookOpen size={16} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[9px]">Brain</span>
                 </button>
                 <button onClick={() => setShowSettings(true)} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-purple-400 transition-all group">
                    <Key size={16} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[9px]">API Keys</span>
                 </button>
                 <button onClick={() => setActiveModal('payment')} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all group">
                    <CreditCard size={16} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[9px]">Abo</span>
                 </button>
            </div>
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </>
    );
};

const ModalManager = () => {
    const { activeModal, setActiveModal } = useProject();
    if (activeModal === 'supabase') return <SupabaseModal />;
    if (activeModal === 'docs') return <DocumentationModal />;
    if (activeModal === 'payment') return <PaymentModal onClose={() => setActiveModal('none')} />;
    return null;
};

const NotificationToast = () => {
    const { notification } = useProject();
    if (!notification) return null;
    return (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
            <div className={`px-4 py-3 rounded-lg shadow-2xl border flex items-center gap-3 backdrop-blur-md
                ${notification.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200' : 
                  notification.type === 'error' ? 'bg-red-950/80 border-red-500/50 text-red-200' : 
                  'bg-slate-800/80 border-slate-600/50 text-slate-200'}`}>
                {notification.type === 'success' ? <CheckCircle2 size={18} /> : 
                 notification.type === 'error' ? <AlertCircle size={18} /> : 
                 <Activity size={18} />}
                <span className="text-sm font-medium">{notification.message}</span>
            </div>
        </div>
    );
};
