import React, { useState, useRef, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  Send, Loader2, PanelLeftClose, PanelLeftOpen, Code, Play, FileCode, Terminal, Settings,
  Menu, X, ChevronRight, ChevronDown, ChevronLeft, Layout, RefreshCw, Box, Monitor, Cloud,
  Check, ShieldCheck, Sparkles, Bot, BrainCircuit, Zap, PenTool, Palette, Wrench, BookOpen,
  Plus, Trash2, FolderOpen, Rocket, ExternalLink, CheckCircle2, AlertCircle, FolderPlus,
  Cpu, Activity, Database, Key, Eye, EyeOff, Edit2, Play as PlayIcon, Download, Upload, 
  FileJson, MessageSquareQuote, Layers, Briefcase, Image as ImageIcon, Lightbulb, Square, Pause,
  Shield, Globe, MapPin, Lock, Server, FileText
} from 'lucide-react';

// --- Configuration & Constants ---

const DEFAULT_SUPABASE_URL = "https://twjssiysjhnxjqilmwlq.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_YcXRDy6Zpdcda43SzQgj-w_Tz0P5RI4";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODELS = {
  FAST: 'gemini-2.5-flash', 
  SMART: 'gemini-3-pro-preview',
  IMAGE: 'gemini-2.5-flash-image',
  CREATIVE: 'gemini-2.5-flash'
};

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
  activeModal: 'none' | 'settings' | 'docs' | 'supabase';
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
        { name: 'supabase.ts', path: 'src/lib/supabase.ts', type: 'file', content: `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '${DEFAULT_SUPABASE_URL}';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '${DEFAULT_SUPABASE_KEY}';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);` }
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
  const [activeModal, setActiveModal] = useState<'none' | 'settings' | 'docs' | 'supabase'>('none');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  const addLog = useCallback((source: string, message: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent' = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substring(2), timestamp: Date.now(), source, message, type }]);
  }, []);

  const showNotification = useCallback((msg: string, type: 'success' | 'error' | 'info') => {
      setNotification({message: msg, type});
      setTimeout(() => setNotification(null), 3000);
  }, []);

  const updateFileContent = useCallback((path: string, content: string) => {
    setProject(p => ({...p, files: updateNodeByPath(p.files, path, node => ({...node, content}))}));
    setActiveFile(prev => prev?.path === path ? { ...prev, content } : prev);
  }, []);

  const createNode = useCallback((parentPath: string, type: 'file' | 'folder', content: string = '') => {
      let newName = type === 'file' ? `new-file-${Date.now()}.tsx` : 'new-folder';
      let targetPath = parentPath;
      if (parentPath.includes('.')) { 
          const parts = parentPath.split('/');
          parts.pop();
          targetPath = parts.join('/');
      }
      let newPath = targetPath ? `${targetPath}/${newName}` : newName;
      const newNode: FileNode = { name: newName, path: newPath, type, children: type === 'folder' ? [] : undefined, content: type === 'file' ? content : undefined };
      
      setProject(p => {
          const filesWithFolders = ensureFolderExists(p.files, targetPath.split('/').filter(Boolean), '');
          return { ...p, files: addNodeToTarget(filesWithFolders, targetPath, newNode) };
      });
      if(newNode.type === 'file') handleFileSelect(newNode);
  }, []);

  const deleteNode = useCallback((path: string) => {
    setProject(p => ({...p, files: removeNodeRecursive(p.files, path)}));
    handleFileClose({path} as FileNode);
  }, []);

  const updateSupabaseConfig = useCallback((config: SupabaseConfig) => {
    setProject(p => ({ ...p, supabaseConfig: config }));
    showNotification("Supabase Verbindung aktualisiert", "success");
  }, []);

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

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const callAgent = async (model: string, prompt: string, sysInstruct: string): Promise<string> => {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: prompt,
                config: {
                    systemInstruction: sysInstruct,
                    temperature: 0.7
                }
            });
            return response.text || "";
        } catch (e) {
            console.error("Agent Error:", e);
            throw e;
        }
    };

    const orchestrate = async (userInput: string) => {
        setIsProcessing(true);
        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userInput, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);

        try {
            // Step 1: Prompt Expert
            setCurrentAgent('prompt_expert');
            addLog('Prompt Expert', 'Analysiere User-Intent und optimiere Eingabe...', 'agent');
            const expertPrompt = `Optimiere diesen User-Prompt für einen Senior Architect. 
            Vorgaben:
            1. Erkenne das Ziel (App-Idee).
            2. Ergänze fehlende technische Details (Supabase DB, React Components, Lucide Icons).
            3. Stelle sicher, dass das Design "High-End Dark Mode (Venlo Style)" ist.
            4. Füge hinzu, dass ein Konzept in src/brain/concept.md erstellt werden MUSS.
            
            User Prompt: "${userInput}"`;
            
            const optimizedPrompt = await callAgent(MODELS.FAST, expertPrompt, "Du bist der NeXify Prompt Experte. Antworte NUR mit dem optimierten Prompt.");
            addLog('Prompt Expert', 'Prompt optimiert und an das Board übergeben.', 'success');

            // Step 2: CPO (Planner) - Concept
            setCurrentAgent('planner');
            addLog('CPO', 'Erstelle Business-Konzept & Projekt-Brain...', 'agent');
            const conceptPrompt = `Erstelle ein detailliertes Konzept basierend auf: ${optimizedPrompt}.
            Format: Markdown.
            Inhalt: Business Summary, Target Audience, Features List, Color Palette Strategy (Venlo Dark Theme).
            Output NUR den Inhalt der Markdown Datei.`;
            const conceptMd = await callAgent(MODELS.SMART, conceptPrompt, "Du bist der Chief Product Officer.");
            createNode('src/brain', 'file', ''); // Ensure folder exists
            updateFileContent('src/brain/concept.md', conceptMd);
            addLog('CPO', 'Konzept in src/brain/concept.md abgelegt.', 'success');

            // Step 3: Creative Director (Asset Generation)
            setCurrentAgent('creative');
            addLog('Creative Dir', 'Generiere Design-Assets und Bild-Prompts...', 'agent');
            // Mocking Image Gen for Stability in this environemnt, but logic stands
            const designJson = JSON.stringify({
                theme: "NeXify Dark Premium",
                primary: "#0EA5E9",
                background: "#020408",
                font: "Inter",
                assets: ["logo_placeholder.png", "hero_bg.png"]
            }, null, 2);
            updateFileContent('src/brain/design.json', designJson);

            // Step 4: Architect (Coder)
            setCurrentAgent('coder');
            addLog('Architect', 'Generiere React-Struktur und Supabase-Integration...', 'agent');
            
            // Getting existing file structure for context
            const fileStructure = project.files.map(f => f.path).join('\n');
            
            const codingPrompt = `
            Task: Implementiere das Projekt basierend auf dem Konzept.
            Stack: React 18, TailwindCSS, Lucide Icons, Supabase-JS.
            Design: Deep Midnight Blue Background, Glassmorphism, Thin Borders, "Venlo/EU" Branding.
            
            Existing Files:
            ${fileStructure}

            Prompt: ${optimizedPrompt}

            IMPORTANT:
            - Nutze import.meta.env.VITE_SUPABASE_URL für Supabase.
            - Antworte als JSON Array von Datei-Objekten:
            [
              { "path": "src/components/Header.tsx", "content": "..." },
              { "path": "src/App.tsx", "content": "..." }
            ]
            `;

            const codeResponse = await callAgent(MODELS.SMART, codingPrompt, "Du bist ein Senior React Architect. Antworte NUR mit validem JSON.");
            const cleanedJson = cleanJson(codeResponse);
            
            let filesToCreate: any[] = [];
            try {
                filesToCreate = JSON.parse(cleanedJson);
            } catch (e) {
                addLog('Architect', 'JSON Parsing fehlgeschlagen. Starte Fixer...', 'error');
                // Trigger Fixer (Simplified loop)
                const fixedJson = await callAgent(MODELS.SMART, `Fix this JSON: ${cleanedJson}`, "Fix JSON syntax only.");
                filesToCreate = JSON.parse(cleanJson(fixedJson));
            }

            // Step 5: Reviewer & Execution
            setCurrentAgent('reviewer');
            addLog('Reviewer', `Prüfe ${filesToCreate.length} Dateien auf Qualität und Sicherheit...`, 'agent');
            
            for (const file of filesToCreate) {
                // Apply Code
                if(file.path.includes('/')) createNode(file.path, 'file', file.content);
                else updateFileContent(file.path, file.content);
                addLog('System', `Datei erstellt: ${file.path}`, 'info');
            }

            addLog('Orchestrator', 'Mission erfolgreich abgeschlossen.', 'success');
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: "Das Projekt wurde erfolgreich erstellt. Das 'Brain' ist aktualisiert und der Code implementiert.", timestamp: Date.now(), agent: 'orchestrator' }]);

        } catch (error: any) {
            addLog('System', `Kritischer Fehler: ${error.message}`, 'error');
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: `Fehler: ${error.message}`, timestamp: Date.now() }]);
        } finally {
            setIsProcessing(false);
            setCurrentAgent(null);
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
                <div className="relative">
                    <textarea 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if(e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if(input.trim() && !isProcessing) {
                                    orchestrate(input);
                                    setInput('');
                                }
                            }
                        }}
                        placeholder="Beschreibe deine App-Idee..."
                        className="w-full bg-[#020408] border border-slate-700 rounded-xl p-4 pr-12 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-none h-24 text-sm transition-all"
                    />
                    <button 
                        onClick={() => {
                            if(input.trim() && !isProcessing) {
                                orchestrate(input);
                                setInput('');
                            }
                        }}
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
    return (
        <div className="grid grid-cols-3 gap-2">
             <button onClick={() => setActiveModal('supabase')} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-all group">
                <Database size={16} className="group-hover:scale-110 transition-transform" />
                <span className="text-[9px]">DB Config</span>
             </button>
             <button onClick={() => setActiveModal('docs')} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all group">
                <BookOpen size={16} className="group-hover:scale-110 transition-transform" />
                <span className="text-[9px]">Brain</span>
             </button>
             <button className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-purple-400 transition-all group">
                <Download size={16} className="group-hover:scale-110 transition-transform" />
                <span className="text-[9px]">Export</span>
             </button>
        </div>
    );
};

const ModalManager = () => {
    const { activeModal } = useProject();
    if (activeModal === 'supabase') return <SupabaseModal />;
    if (activeModal === 'docs') return <DocumentationModal />;
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
