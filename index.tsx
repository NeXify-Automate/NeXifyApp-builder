
import React, { useState, useRef, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  Send, Loader2, PanelLeftClose, PanelLeftOpen, Code, Play, FileCode, Terminal, Settings,
  Menu, X, ChevronRight, ChevronDown, ChevronLeft, Layout, RefreshCw, Box, Monitor, Cloud,
  Check, ShieldCheck, Sparkles, Bot, BrainCircuit, Zap, PenTool, Palette, Wrench, BookOpen,
  Plus, Trash2, FolderOpen, Rocket, ExternalLink, CheckCircle2, AlertCircle, FolderPlus,
  Cpu, Activity, Database, Key, Eye, EyeOff, Edit2, PlayCircle, HelpCircle, Pause, Square, 
  Play as PlayIcon, Download, Upload, FileJson, MessageSquareQuote, Layers, Briefcase, Image as ImageIcon, Lightbulb
} from 'lucide-react';

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
  images?: string[]; // Base64 images
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

type AgentStep = 'idle' | 'optimizing' | 'planning' | 'designing' | 'database' | 'coding' | 'reviewing' | 'fixing';

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface TerminalLog {
  id: string;
  timestamp: number;
  source: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

type AIFileAction = {
  type: 'CREATE_FILE' | 'UPDATE_FILE' | 'DELETE_FILE';
  path: string;
  content?: string;
};

// --- Pure Utility Functions (Hoisted) ---

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

const updatePathsRecursive = (node: FileNode, oldPrefix: string, newPrefix: string, targetPath: string, newName: string): FileNode => {
  const updatedNode = { ...node, path: node.path.replace(oldPrefix, newPrefix) };
  if (node.type === 'file') {
      if (node.path === targetPath) updatedNode.name = newName;
  } else if (node.type === 'folder') {
      if (node.path === targetPath) updatedNode.name = newName;
      if (updatedNode.children) {
          updatedNode.children = updatedNode.children.map(child => updatePathsRecursive(child, oldPrefix, newPrefix, targetPath, newName));
      }
  }
  return updatedNode;
};

const updateTreePaths = (nodes: FileNode[], path: string, newPath: string, newName: string): FileNode[] => {
   return nodes.map(node => {
       if (node.path === path || node.path.startsWith(path + '/')) {
           return updatePathsRecursive(node, path, newPath, path, newName);
       }
       if (node.children) {
           return { ...node, children: updateTreePaths(node.children, path, newPath, newName) };
       }
       return node;
   });
};

// --- Custom Hooks ---

function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const storedValue = window.localStorage.getItem(key);
      return storedValue ? JSON.parse(storedValue) : defaultValue;
    } catch (error) {
      console.error(error);
      return defaultValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  return [state, setState];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

// --- Project Context ---

interface ProjectContextType {
  project: Project;
  updateFileContent: (path: string, content: string) => void;
  createNode: (path: string, type: 'file' | 'folder', content?: string) => FileNode | null;
  deleteNode: (path: string) => void;
  renameNode: (path: string, newName: string) => void;
  toggleFolder: (path: string) => void;
  updateSupabaseConfig: (config: SupabaseConfig) => void;
  openFiles: FileNode[];
  activeFile: FileNode | null;
  handleFileSelect: (file: FileNode) => void;
  handleFileClose: (file: FileNode) => void;
  modifiedFiles: Set<string>;
  saveStatus: 'saved' | 'saving';
  logs: TerminalLog[];
  addLog: (source: string, message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  setActiveModal: (modal: 'none' | 'settings' | 'docs' | 'supabase') => void;
  showNotification: (msg: string, type: 'success' | 'error' | 'info') => void;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  exportProject: () => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within a ProjectProvider');
  return context;
};

const ProjectProvider = ({ project: initialProject, setProjects, children, setActiveModal, showNotification }) => {
  const [project, setProject] = useState(initialProject);
  const [openFiles, setOpenFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [logs, setLogs] = useState<TerminalLog[]>([]);

  const debouncedProjectFiles = useDebounce(project.files, 1500);

  // Sync internal state with persistent state when switching projects
  useEffect(() => {
    setProject(initialProject);
    setOpenFiles([]);
    setActiveFile(null);
    setLogs([]);
  }, [initialProject.id]);

  // Auto-save effect
  useEffect(() => {
    if (modifiedFiles.size > 0) {
      setSaveStatus('saving');
      const timer = setTimeout(() => {
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, files: debouncedProjectFiles, updatedAt: Date.now() } : p));
        setModifiedFiles(new Set());
        setSaveStatus('saved');
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setSaveStatus('saved');
    }
  }, [debouncedProjectFiles, modifiedFiles.size, project.id, setProjects]);
  
  const addLog = useCallback((source: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substring(2), timestamp: Date.now(), source, message, type }]);
  }, []);

  const updateFileContent = useCallback((path: string, content: string) => {
    setProject(p => ({...p, files: updateNodeByPath(p.files, path, node => ({...node, content}))}));
    setActiveFile(prev => prev?.path === path ? { ...prev, content } : prev);
    setModifiedFiles(prev => new Set(prev).add(path));
  }, []);
  
  const updateSupabaseConfig = useCallback((config: SupabaseConfig) => {
      setProject(p => ({ ...p, supabaseConfig: config }));
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, supabaseConfig: config } : p));
  }, [project.id, setProjects]);

  const handleFileSelect = useCallback((file: FileNode) => {
    setProject(currentProject => {
        const fullFile = findNodeByPath(currentProject.files, file.path);
        if(fullFile && fullFile.type === 'file'){
          setOpenFiles(prev => {
              if (!prev.some(f => f.path === fullFile.path)) return [...prev, fullFile];
              return prev;
          });
          setActiveFile(fullFile);
        }
        return currentProject;
    });
  }, []);
  
  const handleFileClose = useCallback((fileToClose: FileNode) => {
    setOpenFiles(prev => {
        const newOpenFiles = prev.filter(f => f.path !== fileToClose.path);
        if (activeFile?.path === fileToClose.path) {
          setActiveFile(newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null);
        }
        return newOpenFiles;
    });
  }, [activeFile]);
  
  const createNode = useCallback((parentPath: string, type: 'file' | 'folder', content: string = '') : FileNode | null => {
      let newName = type === 'file' ? 'neue-datei.tsx' : 'neuer-ordner';
      let targetPath = parentPath;

      // Handle creation at specific path vs root/parent
      if (parentPath.includes('.')) { 
          const parts = parentPath.split('/');
          newName = parts.pop()!;
          targetPath = parts.join('/');
      }

      let newPath = targetPath ? `${targetPath}/${newName}` : newName;
      
      const newNode: FileNode = { name: newName, path: newPath, type, children: type === 'folder' ? [] : undefined, content: type === 'file' ? content : undefined };
      
      setProject(p => {
          const filesWithFolders = ensureFolderExists(p.files, targetPath.split('/').filter(Boolean), '');
          return { ...p, files: addNodeToTarget(filesWithFolders, targetPath, newNode) };
      });

      if(newNode.type === 'file') {
          setTimeout(() => handleFileSelect(newNode), 50);
      }
      return newNode;
  }, [handleFileSelect]);

  const deleteNode = useCallback((path: string) => {
      setProject(p => ({...p, files: removeNodeRecursive(p.files, path)}));
      handleFileClose({path} as FileNode);
      addLog('System', `Datei gelöscht: ${path}`, 'info');
  }, [addLog, handleFileClose]);
  
  const renameNode = useCallback((path: string, newName: string) => {
      setProject(currentProject => {
          const nodeToRename = findNodeByPath(currentProject.files, path);
          if (!nodeToRename) return currentProject;

          const oldPathParts = path.split('/');
          const parentPath = oldPathParts.slice(0, -1).join('/');
          const newPath = parentPath ? `${parentPath}/${newName}` : newName;

          return { ...currentProject, files: updateTreePaths(currentProject.files, path, newPath, newName) };
      });
      handleFileClose({path} as FileNode);
      showNotification(`Umbenannt in ${newName}`, 'success');
  }, [handleFileClose, showNotification]);

  const toggleFolder = useCallback((path: string) => {
      setProject(p => ({...p, files: updateNodeByPath(p.files, path, node => ({...node, isOpen: !node.isOpen}))}));
  }, []);

  const exportProject = useCallback(() => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${project.name.replace(/\s+/g, '_')}_nexify.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showNotification('Projekt exportiert!', 'success');
  }, [project, showNotification]);

  // Initial file open logic
  useEffect(() => {
      if(openFiles.length === 0 && initialProject.files.length > 0) {
          const findFirstFile = (nodes: FileNode[]): FileNode | null => {
              for (const node of nodes) {
                  if (node.type === 'file') return node;
                  if (node.children) {
                      const found = findFirstFile(node.children);
                      if (found) return found;
                  }
              }
              return null;
          };
          const first = findFirstFile(initialProject.files);
          if(first) handleFileSelect(first);
      }
  }, [initialProject.id]); 

  // Memoize the context value
  const value = useMemo(() => ({
    project,
    updateFileContent,
    createNode,
    deleteNode,
    renameNode,
    toggleFolder,
    updateSupabaseConfig,
    openFiles,
    activeFile,
    handleFileSelect,
    handleFileClose,
    modifiedFiles,
    saveStatus,
    logs,
    addLog,
    setActiveModal, 
    showNotification, 
    setProjects,
    exportProject
  }), [
    project, 
    openFiles, 
    activeFile, 
    modifiedFiles, 
    saveStatus, 
    logs, 
    updateFileContent, 
    createNode, 
    deleteNode, 
    renameNode, 
    toggleFolder, 
    updateSupabaseConfig, 
    handleFileSelect, 
    handleFileClose, 
    addLog, 
    setActiveModal, 
    showNotification, 
    setProjects,
    exportProject
  ]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};


// --- Mock Data & Templates ---

// Voreingestellte Supabase Keys für One-Click Start
const DEFAULT_SUPABASE_URL = "https://twjssiysjhnxjqilmwlq.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_YcXRDy6Zpdcda43SzQgj-w_Tz0P5RI4";

const buildFileTreeWithPaths = (nodes: any[], pathPrefix = ''): FileNode[] => {
    return nodes.map(node => {
        const currentPath = pathPrefix ? `${pathPrefix}/${node.name}` : node.name;
        const newNode: FileNode = { ...node, path: currentPath };
        if (node.children) {
            newNode.children = buildFileTreeWithPaths(node.children, currentPath);
        }
        return newNode;
    });
};

const INITIAL_FILES_TEMPLATE_RAW = [
  { name: 'src', type: 'folder', isOpen: true, children: [
      { name: 'brain', type: 'folder', isOpen: true, children: [
          { name: 'read_me.md', type: 'file', content: '# NeXify Brain\n\nDieser Ordner enthält das zentrale Wissen des Projekts.\nAgenten speichern hier Konzepte, Design-Systeme und Strategien.\n\n- concept.md: Business Plan & Features\n- marketing.md: Zielgruppen & Strategie\n- design.json: Farben, Fonts, Assets' }
      ]},
      { name: 'App.tsx', type: 'file', content: `import React, { useState, useEffect } from "react";
import { Rocket, Sparkles, Database, CheckCircle2 } from "lucide-react";
import { supabase } from "./lib/supabase";

export default function App() {
  const [dbStatus, setDbStatus] = useState<string>("Prüfe Verbindung...");

  useEffect(() => {
    async function checkConnection() {
      try {
        const { error } = await supabase.from('random_check').select('*').limit(1);
        if (error && error.code === 'PGRST116') setDbStatus("Verbunden (Keine Tabellen)");
        else setDbStatus("Verbunden & Bereit");
      } catch (e) {
        setDbStatus("Bereit (Client Init)");
      }
    }
    checkConnection();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white font-sans p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-lg text-center relative overflow-hidden transition-all duration-500 hover:shadow-blue-500/10 hover:border-slate-700 hover:scale-[1.01]">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
        <div className="flex justify-center mb-6">
           <div className="bg-blue-500/10 p-4 rounded-full ring-1 ring-blue-500/30 animate-pulse">
              <Rocket size={48} className="text-blue-500" />
           </div>
        </div>
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent mb-4 tracking-tight animate-fade-in">NeXifyAI Ready</h1>
        <p className="text-slate-400 mb-8 leading-relaxed">
          Dein autonomes <span className="text-slate-200 font-medium">KI-Team</span> steht bereit.
          <br/>
          <span className="text-xs uppercase tracking-widest text-slate-500 mt-2 block">Prompt Expert • CPO • Creative Director • Architect</span>
        </p>
        <div className="grid grid-cols-2 gap-4 text-left bg-slate-950/50 p-4 rounded-xl border border-slate-800 mb-6 transition-colors hover:bg-slate-950/80">
           <div className="flex items-center gap-2 text-sm text-slate-300"><Sparkles size={14} className="text-yellow-400"/> Brain Active</div>
           <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium"><Database size={14} /> {dbStatus}</div>
        </div>
      </div>
    </div>
  );
}` },
      { name: 'index.css', type: 'file', content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;' },
      { name: 'lib', type: 'folder', isOpen: true, children: [
        { name: 'supabase.ts', type: 'file', content: `import { createClient } from '@supabase/supabase-js';

// Die Keys werden automatisch durch NeXify injected
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '${DEFAULT_SUPABASE_URL}';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '${DEFAULT_SUPABASE_KEY}';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);` }
      ]}
    ]
  },
  { name: 'package.json', type: 'file', content: '{\n  "name": "nexify-project",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0",\n    "lucide-react": "^0.263.1",\n    "tailwindcss": "^3.4.1",\n    "@supabase/supabase-js": "^2.39.0",\n    "date-fns": "^2.30.0"\n  }\n}' },
  { name: 'index.html', type: 'file', content: '<!DOCTYPE html><html><head><meta charset="UTF-8" /><link href="/src/index.css" rel="stylesheet"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>' },
];
const INITIAL_FILES_TEMPLATE = buildFileTreeWithPaths(INITIAL_FILES_TEMPLATE_RAW);

const DEFAULT_SYSTEM_PROMPT = `Du bist NeXify, ein Elite Full-Stack KI-Entwickler-Team.
Du agierst mit der Logik und Präzision eines Senior Architect (Niveau: Claude 3.5 Sonnet / Opus).

DEINE ROLLE:
Du bist der Lead Architect und Senior Coder. Du planst und implementierst Web-Apps autonom basierend auf dem 'src/brain' Konzept.

WICHTIG - KNOWLEDGE MANAGEMENT:
1. Prüfe IMMER zuerst den Ordner 'src/brain/' auf existierende Konzepte, Marketing-Pläne und Design-Systeme.
2. Halte dich exakt an die dort definierten Farben, Fonts und Zielgruppen-Ansprachen.
3. Wenn du Supabase nutzt, erstelle 'supabase/schema.sql' für das DB-Layout.

REGELN FÜR DIE AUSGABE:
1. Antworte IMMER als valides JSON-Objekt mit einem "actions" Array.
2. Code-Blöcke müssen vollständig sein. KEINE Platzhalter.
3. Formatiere deine Antwort so:
\`\`\`json
{
  "thought": "Erklärung deines Plans...",
  "actions": [
    { "type": "CREATE_FILE", "path": "src/components/Header.tsx", "content": "..." },
    { "type": "UPDATE_FILE", "path": "src/App.tsx", "content": "..." }
  ]
}
\`\`\`
`;

// --- Helper & Utility Components ---

const LoadingDots = () => (
  <div className="flex space-x-1 items-center h-4">
    <div className="w-1.5 h-1.5 bg-bolt-secondary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
    <div className="w-1.5 h-1.5 bg-bolt-secondary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
    <div className="w-1.5 h-1.5 bg-bolt-secondary rounded-full animate-bounce"></div>
  </div>
);

const ToastContainer = ({ notifications, removeNotification }: { notifications: Notification[], removeNotification: (id: string) => void }) => (
  <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
    {notifications.map(n => (
      <div 
        key={n.id} 
        className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border animate-slide-up duration-300 ${
          n.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
          n.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
          'bg-bolt-dark border-bolt-border text-white'
        }`}
      >
        {n.type === 'success' && <CheckCircle2 size={18} />}
        {n.type === 'error' && <AlertCircle size={18} />}
        {n.type === 'info' && <Box size={18} />}
        <span className="text-sm font-medium">{n.message}</span>
        <button onClick={() => removeNotification(n.id)} className="ml-2 opacity-50 hover:opacity-100 transition-opacity"><X size={14}/></button>
      </div>
    ))}
  </div>
);

// --- Core App Structure ---

const NeXifyBuilder = () => {
  const [view, setView] = useState<'dashboard' | 'workspace'>('dashboard');
  const [projects, setProjects] = usePersistentState<Project[]>('nexify-projects', []);
  const [currentProjectId, setCurrentProjectId] = usePersistentState<string | null>('nexify-current-project', null);
  const [activeModal, setActiveModal] = useState<'none' | 'settings' | 'docs' | 'supabase'>('none');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  const createProject = (name: string) => {
    const newProject: Project = {
      id: Math.random().toString(36).substring(2, 9),
      name: name || 'Unbenanntes Projekt',
      files: JSON.parse(JSON.stringify(INITIAL_FILES_TEMPLATE)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      supabaseConfig: {
          url: DEFAULT_SUPABASE_URL,
          anonKey: DEFAULT_SUPABASE_KEY
      }
    };
    setProjects(prev => [...prev, newProject]);
    setCurrentProjectId(newProject.id);
    setView('workspace');
    showNotification(`Projekt "${newProject.name}" erstellt`, 'success');
  };

  const currentProject = useMemo(() => projects.find(p => p.id === currentProjectId), [projects, currentProjectId]);

  useEffect(() => {
    if(currentProjectId && currentProject) {
      setView('workspace');
    } else {
      setView('dashboard');
    }
  }, [currentProjectId, currentProject]);

  return (
    <>
      <ToastContainer notifications={notifications} removeNotification={(id) => setNotifications(p => p.filter(n => n.id !== id))} />
      
      {view === 'dashboard' ? (
        <DashboardView 
          projects={projects}
          setProjects={setProjects}
          createProject={createProject}
          setCurrentProjectId={setCurrentProjectId}
          showNotification={showNotification}
          setActiveModal={setActiveModal}
        />
      ) : currentProject ? (
        <ProjectProvider 
          project={currentProject} 
          setProjects={setProjects}
          setActiveModal={setActiveModal}
          showNotification={showNotification}
        >
          <WorkspaceView 
            onExitWorkspace={() => setCurrentProjectId(null)}
          />
           <SettingsModal 
            activeModal={activeModal}
            setActiveModal={setActiveModal}
            project={currentProject}
            setProjects={setProjects}
            showNotification={showNotification}
          />
          <SupabaseModal 
            activeModal={activeModal}
            setActiveModal={setActiveModal}
            project={currentProject}
            showNotification={showNotification}
          />
          <DocumentationModal activeModal={activeModal} setActiveModal={setActiveModal} />
        </ProjectProvider>
      ) : null }
    </>
  );
};

// --- Dashboard View ---
const DashboardView = ({ projects, setProjects, createProject, setCurrentProjectId, showNotification, setActiveModal }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const PROJECTS_PER_PAGE = 9;
  
  const displayedProjects = useMemo(() => {
    return projects
      .sort((a,b) => b.updatedAt - a.updatedAt)
      .slice((currentPage - 1) * PROJECTS_PER_PAGE, currentPage * PROJECTS_PER_PAGE);
  }, [projects, currentPage]);

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Möchtest du dieses Projekt wirklich unwiderruflich löschen?')) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    showNotification('Projekt gelöscht', 'info');
  };

  const importProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const imported = JSON.parse(ev.target?.result as string);
                if (!imported.id || !imported.files) throw new Error('Ungültiges Format');
                const newProject = { ...imported, id: Math.random().toString(36).substring(2, 9), name: imported.name + ' (Import)', createdAt: Date.now(), updatedAt: Date.now() };
                setProjects(prev => [newProject, ...prev]);
                showNotification('Projekt importiert', 'success');
            } catch (err) {
                showNotification('Fehler beim Importieren', 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
  };

    return (
      <div className="min-h-screen bg-bolt-bg text-white overflow-y-auto font-sans">
        <div className="relative border-b border-bolt-border bg-gradient-to-b from-bolt-dark to-bolt-bg py-24 px-4 overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <div className="absolute top-10 left-10 w-64 h-64 bg-bolt-accent rounded-full filter blur-[100px] animate-pulse-slow"></div>
              <div className="absolute bottom-10 right-10 w-64 h-64 bg-purple-600 rounded-full filter blur-[100px] animate-pulse-slow"></div>
           </div>
           
           <div className="max-w-4xl mx-auto text-center relative z-10 animate-fade-in">
              <div className="flex justify-center mb-6">
                <span className="bg-bolt-border/50 text-bolt-accent px-4 py-1.5 rounded-full text-sm font-medium border border-bolt-border flex items-center gap-2 shadow-lg backdrop-blur-sm animate-pulse-slow">
                   <Sparkles size={14} /> NeXifyAI Builder v4.0 Enterprise
                </span>
              </div>
              <div className="bg-gradient-to-r from-gray-200 via-gray-400 to-gray-200 h-16 w-full max-w-lg mx-auto rounded-t-lg flex items-center justify-center mb-2 shadow-2xl">
                 <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-blue-600 to-blue-900 tracking-tighter uppercase">Builder</h1>
              </div>
              <p className="text-xl text-bolt-secondary mb-10 max-w-2xl mx-auto leading-relaxed mt-4">
                Das autonome KI-Entwicklungsteam mit integriertem <span className="text-purple-400 font-semibold">CPO</span>, <span className="text-emerald-400 font-semibold">Brain-Management</span> und <span className="text-pink-400 font-semibold">Design-Studio</span>.
              </p>
              
              <div className="flex justify-center gap-4">
                 <button 
                   onClick={() => createProject(`Projekt ${projects.length + 1}`)}
                   className="flex items-center gap-2 bg-bolt-accent hover:bg-blue-600 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-blue-500/25 active:scale-95 text-white"
                 >
                   <Rocket size={20} /> Projekt starten
                 </button>
                 <button 
                   onClick={importProject}
                   className="flex items-center gap-2 bg-bolt-dark hover:bg-bolt-border px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 shadow-lg border border-bolt-border text-white active:scale-95"
                 >
                   <Upload size={20} /> Importieren
                 </button>
              </div>
           </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-16">
          {projects.length === 0 ? (
            <div className="border-2 border-dashed border-bolt-border rounded-xl p-12 text-center opacity-50 max-w-md mx-auto relative group transition-all duration-500 hover:opacity-100">
                <div className="absolute inset-0 bg-bolt-accent/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl duration-500"></div>
                <div className="bg-bolt-dark p-6 rounded-xl border border-bolt-border inline-block mb-4 shadow-2xl relative z-10 pointer-events-none select-none">
                     <div className="flex items-center justify-between mb-2">
                        <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-red-500"/><div className="w-2 h-2 rounded-full bg-yellow-500"/><div className="w-2 h-2 rounded-full bg-green-500"/></div>
                     </div>
                     <div className="bg-bolt-bg p-4 rounded-lg w-48 h-24 flex items-center justify-center">
                         <Code size={32} className="text-bolt-accent" />
                     </div>
                     <div className="mt-2 text-left">
                        <div className="h-2 w-24 bg-bolt-border rounded mb-1"></div>
                        <div className="h-2 w-16 bg-bolt-border rounded"></div>
                        <div className="flex items-center gap-1 mt-3 text-[10px] text-green-500"><CheckCircle2 size={10}/> Supabase Ready</div>
                     </div>
                </div>
                <h3 className="text-lg font-bold text-white relative z-10">Bereit zum Coden?</h3>
                <p className="text-xs text-bolt-secondary relative z-10 mt-1">Starte ein neues Projekt oben.</p>
            </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedProjects.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => setCurrentProjectId(p.id)}
                    className="bg-bolt-dark border border-bolt-border rounded-xl p-6 transition-all duration-300 cursor-pointer group relative shadow-md hover:shadow-2xl hover:shadow-bolt-accent/10 hover:-translate-y-1 hover:border-bolt-accent/50"
                  >
                     <div className="flex justify-between items-start mb-4">
                       <div className="p-3 bg-bolt-bg rounded-lg border border-bolt-border group-hover:border-bolt-accent/30 transition-colors duration-300 shadow-sm group-hover:shadow-md group-hover:shadow-bolt-accent/5">
                         <Code size={24} className="text-bolt-accent transition-transform duration-300 group-hover:scale-110" />
                       </div>
                       <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                         <button onClick={(e) => deleteProject(p.id, e)} className="p-2 hover:bg-red-500/10 rounded-md text-red-500 transition-colors active:scale-90"><Trash2 size={16} /></button>
                       </div>
                     </div>
                     <h3 className="text-lg font-bold mb-2 text-white group-hover:text-bolt-accent transition-colors duration-200 truncate">{p.name}</h3>
                     <div className="flex items-center gap-4 text-xs text-bolt-secondary mb-4">
                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-bolt-bg rounded border border-bolt-border/50 group-hover:border-bolt-accent/20 transition-colors"><Monitor size={10}/> Web App</span>
                        {p.supabaseConfig?.url && <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-950/30 text-emerald-500 rounded border border-emerald-500/20"><Database size={10}/> Backend</span>}
                     </div>
                     <div className="pt-4 border-t border-bolt-border/50 text-xs text-gray-500 flex justify-between items-center">
                       <span>Aktualisiert: {new Date(p.updatedAt).toLocaleDateString()}</span>
                       <ChevronRight size={14} className="text-bolt-accent opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300"/>
                     </div>
                  </div>
                ))}
             </div>
          )}
        </div>
      </div>
    );
};

// --- Workspace Components ---

const WorkspaceHeader = ({ onExitWorkspace, agentStep, isPaused, handlePause, handleResume, handleStop }) => {
    const { project, saveStatus, setActiveModal, exportProject } = useProject();
    
    return (
        <header className="h-14 border-b border-bolt-border flex items-center justify-between px-4 bg-bolt-bg shrink-0 z-20 shadow-sm relative">
            <div className="flex items-center space-x-3 cursor-pointer group" onClick={onExitWorkspace}>
              <div className="p-1.5 bg-bolt-accent/10 rounded-lg group-hover:bg-bolt-accent/20 transition-all duration-200 border border-bolt-accent/20 group-active:scale-95">
                 <Box className="w-5 h-5 text-bolt-accent" />
              </div>
              <div className="flex flex-col">
                 <span className="font-bold text-white tracking-tight leading-none group-hover:text-bolt-accent transition-colors duration-200">NeXifyAI</span>
                 <span className="text-xs text-bolt-secondary leading-none mt-1 group-hover:text-bolt-accent/80 transition-colors duration-200">Dashboard</span>
              </div>
              <div className="h-6 w-px bg-bolt-border mx-2"></div>
              <span className="text-sm font-medium text-white hidden md:inline">{project.name}</span>
            </div>
            
            <div className="flex-1 flex justify-center items-center gap-4 overflow-x-auto no-scrollbar mx-4">
                 {/* Agent Status Display */}
                 <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono transition-all duration-300 border shadow-sm whitespace-nowrap ${
                     isPaused 
                        ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-500 animate-pulse'
                        : agentStep !== 'idle' 
                            ? 'bg-bolt-accent/20 border-bolt-accent/50 text-bolt-accent shadow-[0_0_15px_rgba(59,130,246,0.3)] scale-105' 
                            : 'bg-bolt-dark border-bolt-border text-bolt-secondary'
                 }`}>
                    {agentStep === 'idle' && <div className="w-2 h-2 bg-gray-500 rounded-full"></div>}
                    
                    {isPaused && <><Pause size={12} fill="currentColor"/> <span>PAUSIERT</span></>}
                    
                    {!isPaused && agentStep === 'optimizing' && <><MessageSquareQuote size={12} className="animate-pulse"/> <span>Prompt Expert...</span></>}
                    {!isPaused && agentStep === 'planning' && <><Briefcase size={12} className="animate-pulse text-indigo-400"/> <span className="text-indigo-400">CPO: Planung...</span></>}
                    {!isPaused && agentStep === 'designing' && <><Palette size={12} className="animate-pulse text-pink-400"/> <span className="text-pink-400">Creative Director...</span></>}
                    {!isPaused && agentStep === 'database' && <><Database size={12} className="animate-pulse text-emerald-400"/> <span className="text-emerald-400">DB Architect...</span></>}
                    {!isPaused && agentStep === 'coding' && <><Code size={12} className="animate-spin"/> <span>Architect Coder...</span></>}
                    {!isPaused && agentStep === 'reviewing' && <><ShieldCheck size={12} className="animate-pulse"/> <span>Reviewer...</span></>}
                    {!isPaused && agentStep === 'fixing' && <><Wrench size={12} className="animate-pulse"/> <span>Fixer...</span></>}
                    {!isPaused && agentStep === 'idle' && <span>Bereit</span>}
                 </div>
                 
                 {/* Controls */}
                 {agentStep !== 'idle' && (
                    <div className="flex items-center gap-1 bg-bolt-dark border border-bolt-border rounded-lg p-0.5 animate-zoom-in duration-200">
                        {isPaused ? (
                            <button onClick={handleResume} className="p-1 hover:bg-green-500/20 text-green-400 rounded transition-colors duration-200 active:scale-90" title="Fortsetzen">
                                <PlayIcon size={14} fill="currentColor"/>
                            </button>
                        ) : (
                            <button onClick={handlePause} className="p-1 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors duration-200 active:scale-90" title="Pausieren">
                                <Pause size={14} fill="currentColor"/>
                            </button>
                        )}
                        <div className="w-px h-3 bg-bolt-border mx-1"></div>
                        <button onClick={handleStop} className="p-1 hover:bg-red-500/20 text-red-400 rounded transition-colors duration-200 active:scale-90" title="Abbrechen">
                            <Square size={14} fill="currentColor"/>
                        </button>
                    </div>
                 )}

                 {/* Global Save Status Indicator */}
                 <div className="hidden lg:flex items-center gap-2 text-xs font-medium transition-colors ml-4 border-l border-bolt-border pl-4">
                    {saveStatus === 'saving' ? (
                       <span className="text-bolt-accent flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> Speichern...</span>
                    ) : (
                       <span className="text-green-500 flex items-center gap-1 animate-fade-in"><Check size={12} /> Gespeichert</span>
                    )}
                 </div>
            </div>

            <div className="flex items-center space-x-3">
              <button onClick={exportProject} className="text-bolt-secondary hover:text-white p-2 hover:bg-bolt-border rounded-lg transition-all duration-200 active:scale-95 hover:bg-white/5" title="Code exportieren (JSON)">
                <Download size={18} />
              </button>
              <button onClick={() => setActiveModal('supabase')} className={`p-2 rounded-lg transition-all duration-200 active:scale-95 flex items-center gap-2 text-xs font-medium ${project.supabaseConfig?.url ? 'text-emerald-400 bg-emerald-950/30 border border-emerald-500/30' : 'text-bolt-secondary hover:bg-white/5'}`}>
                 <Database size={16} /> <span className="hidden lg:inline">{project.supabaseConfig?.url ? 'Backend Verbunden' : 'Backend verbinden'}</span>
              </button>
              <button onClick={() => setActiveModal('settings')} className="text-bolt-secondary hover:text-white p-2 hover:bg-bolt-border rounded-lg transition-all duration-200 active:scale-95 hover:bg-white/5">
                <Settings size={18} />
              </button>
            </div>
        </header>
    );
};

const ChatPanel = ({ messages, input, setInput, handleSendMessage, agentStep }) => {
    const chatEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, agentStep]);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
    };
    
    // Filter internal agent chatter, show only relevant final output or user messages
    const displayMessages = useMemo(() => {
        return messages.filter(m => m.role === 'user' || m.agent === 'coder' || m.agent === 'fixer' || m.agent === 'prompt_expert' || m.agent === 'planner' || m.agent === 'creative');
    }, [messages]);

    return (
        <div className="w-[400px] flex flex-col border-r border-bolt-border bg-bolt-bg shrink-0 shadow-xl z-10">
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {displayMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full opacity-30 text-center select-none animate-fade-in">
                    <Bot size={48} className="mb-4 text-bolt-accent" />
                    <p className="text-sm">Beschreibe deine App-Idee.</p>
                    <p className="text-xs mt-2">Das NeXify Team (CPO, Designer, Coder) übernimmt.</p>
                </div>
            )}
            {displayMessages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-slide-up`}>
                <div className={`max-w-[95%] rounded-2xl p-4 relative shadow-sm transition-all duration-200 ${
                    msg.role === 'user' ? 'bg-bolt-accent text-white rounded-br-sm shadow-blue-500/10' : 
                    msg.agent === 'prompt_expert' ? 'bg-purple-900/20 border border-purple-500/30 text-purple-200' :
                    msg.agent === 'planner' ? 'bg-indigo-900/20 border border-indigo-500/30 text-indigo-200' :
                    msg.agent === 'creative' ? 'bg-pink-900/20 border border-pink-500/30 text-pink-200' :
                    'bg-bolt-dark border border-bolt-border text-bolt-text rounded-bl-sm'
                }`}>
                   {msg.agent && (
                      <div className="absolute -top-3 -left-2 bg-bolt-bg border border-bolt-border p-1 rounded-full shadow-md z-10 flex items-center gap-1 pr-2">
                          {msg.agent === 'prompt_expert' ? <MessageSquareQuote size={10} className="text-purple-400" /> : 
                           msg.agent === 'planner' ? <Briefcase size={10} className="text-indigo-400" /> :
                           msg.agent === 'creative' ? <Palette size={10} className="text-pink-400" /> :
                           <Bot size={10} className="text-bolt-accent" />}
                          <span className={`text-[9px] uppercase font-bold tracking-wider ${
                              msg.agent === 'prompt_expert' ? 'text-purple-400' : 
                              msg.agent === 'planner' ? 'text-indigo-400' :
                              msg.agent === 'creative' ? 'text-pink-400' :
                              'text-bolt-secondary'
                          }`}>
                              {msg.agent === 'fixer' ? 'Fixer Agent' : 
                               msg.agent === 'prompt_expert' ? 'Prompt Expert' : 
                               msg.agent === 'planner' ? 'CPO (Planning)' : 
                               msg.agent === 'creative' ? 'Creative Director' :
                               'Dev Team'}
                          </span>
                      </div>
                  )}
                  {msg.role === 'user' ? (
                      <div className="text-sm">{msg.content}</div>
                  ) : (
                      <div className="text-xs">
                         {/* Image Rendering */}
                         {msg.images && msg.images.length > 0 && (
                             <div className="mb-3 grid grid-cols-2 gap-2">
                                 {msg.images.map((img, idx) => (
                                     <img key={idx} src={`data:image/png;base64,${img}`} alt="Generated Asset" className="rounded-lg border border-bolt-border shadow-lg" />
                                 ))}
                             </div>
                         )}

                         {/* Text Content */}
                         {msg.content.includes('"thought"') ? (
                             <div className="italic mb-2 text-bolt-secondary border-b border-bolt-border/30 pb-2">
                                 "{JSON.parse(msg.content.match(/\{[\s\S]*\}/)?.[0] || '{}').thought || 'Code generiert.'}"
                             </div>
                         ) : (
                             <div className={`mb-1 ${msg.agent === 'planner' ? 'italic' : ''}`}>{msg.content}</div>
                         )}
                         
                         {!msg.content.includes('"thought"') && msg.agent !== 'prompt_expert' && msg.agent !== 'planner' && msg.agent !== 'creative' && (
                             <div className="flex items-center gap-2 text-green-400 font-mono bg-green-900/10 p-2 rounded border border-green-900/30">
                                <CheckCircle2 size={12} /> Änderungen angewendet
                             </div>
                         )}
                      </div>
                  )}
                </div>
              </div>
            ))}
            {agentStep !== 'idle' && <div className="px-2 animate-fade-in"><LoadingDots /></div>}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 border-t border-bolt-border bg-bolt-bg">
            <div className="relative bg-bolt-dark rounded-xl border border-bolt-border focus-within:border-bolt-accent focus-within:ring-1 focus-within:ring-bolt-accent transition-all duration-200 shadow-inner group">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Was möchtest du bauen? (z.B. Coffee Shop App)"
                className="w-full bg-transparent text-sm text-white p-3 outline-none resize-none max-h-32 min-h-[50px]"
                rows={1}
              />
              <button 
                onClick={handleSendMessage} 
                disabled={agentStep !== 'idle' || !input.trim()}
                className={`absolute right-2 bottom-2 p-1.5 rounded-lg text-white transition-all duration-200 active:scale-90 disabled:bg-bolt-border disabled:text-gray-500 bg-bolt-accent hover:bg-blue-600 shadow-lg`}
              >
                {agentStep !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
    );
};

const FileExplorer = React.memo(() => {
    const { project, activeFile, handleFileSelect, toggleFolder, createNode, deleteNode, renameNode } = useProject();
    const [contextMenu, setContextMenu] = useState<{x: number, y: number, path: string, type: 'file' | 'folder'} | null>(null);
    const [editingNode, setEditingNode] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const handleContextMenu = (e: React.MouseEvent, path: string, type: 'file' | 'folder') => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, path, type });
    };

    // Global click listener to close context menu
    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    const startRename = (path: string, currentName: string) => {
        setEditingNode(path);
        setEditName(currentName);
        setContextMenu(null);
    };

    const submitRename = () => {
        if(editingNode && editName) {
            renameNode(editingNode, editName);
        }
        setEditingNode(null);
    };

    const FileTreeItem = React.memo(({ item, depth = 0 }: { item: FileNode, depth?: number }) => {
        const isActive = activeFile?.path === item.path;
        const isEditing = editingNode === item.path;
        const isBrain = item.name === 'brain' && depth === 1; // Assuming src/brain

        return (
            <div>
                <div 
                    className={`flex items-center py-1 px-2 cursor-pointer text-sm transition-all duration-200 ease-in-out select-none rounded border border-transparent ${isActive ? 'bg-bolt-accent/10 text-bolt-accent border-bolt-accent/20' : 'text-bolt-secondary hover:text-white hover:bg-white/5'} ${isBrain ? 'text-indigo-400 hover:text-indigo-300' : ''}`}
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    onClick={() => !isEditing && (item.type === 'folder' ? toggleFolder(item.path) : handleFileSelect(item))}
                    onContextMenu={(e) => handleContextMenu(e, item.path, item.type)}
                >
                    <span className="mr-1.5 opacity-70">
                    {item.type === 'folder' ? (
                        <ChevronRight size={14} className={`transition-transform duration-200 ${item.isOpen ? 'rotate-90 text-white' : ''}`} />
                    ) : (
                        <FileCode size={14} />
                    )}
                    </span>
                    {isEditing ? (
                        <input 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={submitRename}
                            onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                            className="bg-bolt-dark border border-bolt-accent rounded px-1 text-white w-full outline-none text-xs"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className={`truncate ${isBrain ? 'font-bold' : ''}`}>{item.name}</span>
                    )}
                    {isBrain && <BrainCircuit size={12} className="ml-auto opacity-50" />}
                </div>
                {item.type === 'folder' && item.isOpen && item.children && item.children.map((child) => (
                    <FileTreeItem key={child.path} item={child} depth={depth + 1} />
                ))}
            </div>
        );
    });

    return (
        <div className="w-60 border-r border-bolt-border bg-bolt-bg flex flex-col shrink-0 overflow-y-auto relative select-none">
            <div className="p-2 text-[10px] font-bold text-bolt-secondary uppercase tracking-widest border-b border-bolt-border/50 flex items-center justify-between">
                <span className="flex items-center gap-2"><FolderOpen size={12} /> Explorer</span>
                <div className="flex items-center">
                    <button onClick={() => createNode('', 'file')} className="p-1 hover:bg-bolt-border rounded text-bolt-secondary hover:text-white transition-colors active:scale-95" title="Neue Datei"><Plus size={12} /></button>
                    <button onClick={() => createNode('', 'folder')} className="p-1 hover:bg-bolt-border rounded text-bolt-secondary hover:text-white transition-colors active:scale-95" title="Neuer Ordner"><FolderPlus size={12} /></button>
                </div>
            </div>
            <div className="p-1 space-y-0.5">
                {project.files.map((file) => <FileTreeItem key={file.path} item={file} />)}
            </div>
            
            {contextMenu && (
                <div className="fixed z-50 bg-bolt-dark border border-bolt-border rounded-lg shadow-xl py-1 w-48 backdrop-blur-md animate-zoom-in" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    {contextMenu.type === 'folder' && (
                        <>
                            <button onClick={() => createNode(contextMenu.path, 'file')} className="w-full text-left px-4 py-2 text-sm text-bolt-secondary hover:text-white hover:bg-bolt-accent/20 flex items-center gap-2 transition-colors"><Plus size={14} /> Neue Datei hier</button>
                            <button onClick={() => createNode(contextMenu.path, 'folder')} className="w-full text-left px-4 py-2 text-sm text-bolt-secondary hover:text-white hover:bg-bolt-accent/20 flex items-center gap-2 transition-colors"><FolderPlus size={14} /> Neuer Ordner hier</button>
                            <div className="h-px bg-bolt-border my-1"></div>
                        </>
                    )}
                    <button onClick={() => startRename(contextMenu.path, contextMenu.path.split('/').pop()!)} className="w-full text-left px-4 py-2 text-sm text-bolt-secondary hover:text-white hover:bg-bolt-accent/20 flex items-center gap-2 transition-colors"><Edit2 size={14} /> Umbenennen</button>
                    <button onClick={() => deleteNode(contextMenu.path)} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"><Trash2 size={14} /> Löschen</button>
                </div>
            )}
        </div>
    );
});

const EditorTabs = React.memo(() => {
  const { openFiles, activeFile, handleFileSelect, handleFileClose } = useProject();
  return (
    <div className="flex items-center h-full overflow-x-auto no-scrollbar">
        {openFiles.map(file => (
            <div 
                key={file.path}
                onClick={() => handleFileSelect(file)}
                className={`flex items-center h-full px-3 border-r border-bolt-border cursor-pointer text-xs group min-w-[100px] max-w-[200px] transition-all duration-200 relative ${activeFile?.path === file.path ? 'bg-bolt-dark text-white border-t-2 border-t-bolt-accent shadow-inner' : 'text-bolt-secondary hover:bg-bolt-dark/50 bg-bolt-bg'}`}
            >
                <FileCode size={12} className={`mr-2 transition-colors duration-200 ${activeFile?.path === file.path ? 'text-bolt-accent' : 'opacity-50'}`} />
                <span className="truncate flex-1">{file.name}</span>
                <button 
                    onClick={(e) => { e.stopPropagation(); handleFileClose(file); }}
                    className="ml-2 p-0.5 rounded-md hover:bg-bolt-border text-bolt-secondary hover:text-white opacity-0 group-hover:opacity-100 transition-all duration-200 active:scale-90"
                >
                    <X size={10} />
                </button>
            </div>
        ))}
    </div>
  )
});

const EditorPanel = React.memo(() => {
  const { activeFile, updateFileContent } = useProject();
  const [localContent, setLocalContent] = useState('');

  // Sync local content when file changes
  useEffect(() => {
    if (activeFile) {
      setLocalContent(activeFile.content || '');
    }
  }, [activeFile?.path, activeFile?.content]);

  // Debounce updates to global state
  const debouncedUpdate = useDebounce(localContent, 500);

  useEffect(() => {
    if (activeFile && debouncedUpdate !== activeFile.content) {
      updateFileContent(activeFile.path, debouncedUpdate);
    }
  }, [debouncedUpdate, activeFile, updateFileContent]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalContent(e.target.value);
  }, []);

  return (
    <div className="flex-1 relative bg-[#0d1117] flex flex-col animate-fade-in duration-300">
        {activeFile ? (
            <textarea
                key={activeFile.path}
                className="flex-1 w-full bg-transparent text-gray-300 p-6 font-mono text-sm outline-none resize-none leading-relaxed"
                value={localContent}
                onChange={handleChange}
                spellCheck={false}
                autoFocus
            />
        ) : <div className="m-auto text-bolt-secondary text-sm flex flex-col items-center gap-4 opacity-50 select-none animate-zoom-in"><FileCode size={48}/><span>Wähle eine Datei zum Bearbeiten</span></div>}
    </div>
  )
});

// --- In-Memory Bundler for Preview ---
const generatePreviewUrl = (files: FileNode[], supabaseConfig?: SupabaseConfig): string => {
    // Flatten files
    const allFiles: {path: string, content: string}[] = [];
    const traverse = (nodes: FileNode[]) => {
        nodes.forEach(n => {
            if(n.type === 'file' && n.content) allFiles.push({path: n.path, content: n.content});
            if(n.children) traverse(n.children);
        });
    };
    traverse(files);

    const appFile = allFiles.find(f => f.path.endsWith('App.tsx') || f.path.endsWith('App.js'));
    const indexHtml = allFiles.find(f => f.path === 'index.html')?.content || '<div id="root"></div>';

    const sortedFiles = allFiles.filter(f => f !== appFile && f.path !== 'index.html' && f.path !== 'package.json')
                                .sort((a,b) => b.path.length - a.path.length);

    let scriptContent = `
        window.process = { env: { NODE_ENV: 'development' } };
        // Inject Supabase Env Vars if present
        window.import = { 
           meta: { 
             env: { 
               VITE_SUPABASE_URL: "${supabaseConfig?.url || ''}",
               VITE_SUPABASE_ANON_KEY: "${supabaseConfig?.anonKey || ''}"
             } 
           } 
        };
        
        window.exports = {}; 
    `;

    // Helper to transform code
    const transformCode = (code: string, filePath: string) => {
        let trans = code;
        
        // Remove comments to prevent regex matching inside comments
        trans = trans.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');

        // 1. Handle "lucide-react" imports
        trans = trans.replace(/import\s+\{(.*?)\}\s+from\s+['"]lucide-react['"];?/g, 'const { $1 } = window.LucideReact;');
        
        // 2. Handle React imports
        trans = trans.replace(/import\s+React.*?from\s+['"]react['"];?/g, '');
        trans = trans.replace(/import\s+\{(.*?)\}\s+from\s+['"]react['"];?/g, 'const { $1 } = React;');
        
        // 3. Handle Supabase imports (Inject global CDN client)
        // More robust regex to handle various import styles
        trans = trans.replace(/import\s+.*?from\s+['"]@supabase\/supabase-js['"];?/g, 'const { createClient } = window.supabase;');
        
        // Handle date-fns
        trans = trans.replace(/import\s+\{(.*?)\}\s+from\s+['"]date-fns['"];?/g, 'const { $1 } = window.dateFns;');

        // 4. Handle Local Imports
        trans = trans.replace(/import\s+(\w+)\s+from\s+['"]\.\/.*?['"];?/g, 'const $1 = window.$1;');
        trans = trans.replace(/import\s+(\w+)\s+from\s+['"]\.\.\/.*?['"];?/g, 'const $1 = window.$1;');
        trans = trans.replace(/import\s+\{\s*(\w+)\s*\}\s+from\s+['"]\.\.\/.*?['"];?/g, 'const { $1 } = window;');

        // 5. Handle Exports
        trans = trans.replace(/export\s+default\s+function\s+(\w+)/g, 'window.$1 = function $1');
        trans = trans.replace(/export\s+default\s+(\w+);?/g, 'window.$1 = $1;');
        trans = trans.replace(/export\s+const\s+(\w+)/g, 'window.$1');

        return trans;
    };

    sortedFiles.forEach(f => {
        if(f.path.startsWith('src/') && !f.path.endsWith('.css') && !f.path.endsWith('.json') && !f.path.endsWith('.md')) {
            scriptContent += `\n// File: ${f.path}\ntry {\n${transformCode(f.content, f.path)}\n} catch(e) { console.error("Error loading ${f.path}", e); }\n`;
        }
    });

    if(appFile) {
        scriptContent += `\n// File: App.tsx\n${transformCode(appFile.content, 'App.tsx')}\n`;
    }

    const finalHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/lucide-react@latest/dist/lucide-react.js"></script>
        <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
        <script src="https://unpkg.com/date-fns@2.30.0/cdn.min.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <style>body { background-color: #fff; margin: 0; } #root { min-height: 100vh; }</style>
      </head>
      <body>
        ${indexHtml.replace('<script type="module" src="/src/main.tsx"></script>', '')}
        <script type="text/babel" data-presets="react">
          const { useState, useEffect, useRef, useMemo, useCallback } = React;
          window.LucideReact = lucide;
          window.dateFns = dateFns;
          window.supabase = window.supabase || { createClient: () => console.warn('Supabase not init') };
          
          try {
            ${scriptContent}
            
            const root = ReactDOM.createRoot(document.getElementById('root'));
            if (window.App) {
              root.render(<React.StrictMode><window.App /></React.StrictMode>);
            } else {
              document.body.innerHTML = '<div style="color:white;background:#ef4444;padding:20px;font-family:sans-serif;">Error: App component not found. Ensure "export default function App" exists in src/App.tsx</div>';
            }
          } catch(err) {
            document.body.innerHTML = '<div style="color:white;background:#ef4444;padding:20px;font-family:sans-serif;">Runtime Error: ' + err.message + '</div>';
            console.error(err);
          }
        </script>
      </body>
      </html>`;

    return URL.createObjectURL(new Blob([finalHtml], { type: 'text/html' }));
};

const PreviewPanel = React.memo(() => {
    const { project, saveStatus } = useProject();
    const [previewUrl, setPreviewUrl] = useState('');
    const [key, setKey] = useState(0);

    useEffect(() => {
        // Only regenerate preview if saved
        if (saveStatus === 'saved') {
            const url = generatePreviewUrl(project.files, project.supabaseConfig);
            setPreviewUrl(url);
            setKey(k => k + 1); // Force iframe reload
            return () => URL.revokeObjectURL(url);
        }
    }, [project.files, saveStatus, project.supabaseConfig]);

    return (
        <div className="w-full h-full bg-white relative animate-fade-in">
             <iframe key={key} src={previewUrl} className="w-full h-full border-none" title="App Preview" sandbox="allow-scripts allow-same-origin" />
        </div>
    );
});

const TerminalPanel = React.memo(({ open, setOpen }: { open: boolean, setOpen: (o: boolean) => void }) => {
    const { logs } = useProject();
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs, open]);

    return (
        <div className={`${open ? 'h-48' : 'h-8'} border-t border-bolt-border bg-bolt-dark flex flex-col transition-all duration-300 shadow-[0_-5px_15px_rgba(0,0,0,0.3)] z-20`}>
             <div className="h-8 flex items-center justify-between px-4 cursor-pointer hover:bg-bolt-border/30 transition-colors duration-200 border-b border-bolt-border/50 bg-bolt-bg" onClick={() => setOpen(!open)}>
               <div className="flex items-center gap-2 text-xs font-bold text-bolt-secondary uppercase tracking-wider"><Terminal size={12} /> Terminal Output</div>
               <div className="flex items-center gap-4">
                  <div className="text-[10px] text-bolt-secondary hidden sm:block">Agent Logs & System Build</div>
                  <ChevronDown size={14} className={`transition-transform duration-300 text-bolt-secondary ${open ? '' : 'rotate-180'}`} />
               </div>
             </div>
             {open && (
                 <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
                     {logs.length === 0 && <div className="text-gray-600 italic">Keine Logs vorhanden...</div>}
                     {logs.map(log => (
                         <div key={log.id} className="flex gap-3 animate-fade-in">
                             <span className="text-gray-600">[{new Date(log.timestamp).toLocaleTimeString().split(' ')[0]}]</span>
                             <span className={`font-bold w-28 shrink-0 truncate ${
                               log.source === 'Reviewer' ? 'text-purple-400' : 
                               log.source === 'Fixer' ? 'text-yellow-400' : 
                               log.source === 'DB Architect' ? 'text-emerald-400' : 
                               log.source === 'Prompt Expert' ? 'text-pink-400' : 
                               log.source === 'CPO' ? 'text-indigo-400' :
                               log.source === 'Creative' ? 'text-pink-500' :
                               log.source === 'Error' ? 'text-red-500' : 'text-blue-400'
                             }`}>{log.source}:</span>
                             <span className={`${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-300'}`}>{log.message}</span>
                         </div>
                     ))}
                 </div>
             )}
        </div>
    );
});

const Workbench = () => {
    const [sidebarOpen, setSidebarOpen] = usePersistentState('ui-sidebarOpen', true);
    const [termOpen, setTermOpen] = usePersistentState('ui-termOpen', true);
    const [activeTab, setActiveTab] = useState<'code' | 'preview'>('preview');

    return (
        <div className="flex-1 flex flex-col bg-bolt-dark min-w-0">
            <div className="h-10 border-b border-bolt-border flex items-center px-2 bg-bolt-bg justify-between shrink-0 shadow-sm z-10">
                <div className="flex items-center h-full gap-2">
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 hover:bg-bolt-border rounded-md text-bolt-secondary transition-colors duration-200 active:scale-95" title={sidebarOpen ? "Explorer schließen" : "Explorer öffnen"}>
                        {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                    </button>
                    <div className="h-4 w-px bg-bolt-border mx-1"></div>
                    <EditorTabs />
                </div>
                <div className="flex items-center gap-2 pr-2">
                     <button className="flex items-center gap-1 text-[10px] bg-green-600/20 text-green-400 px-2 py-1 rounded border border-green-600/30 hover:bg-green-600/30 transition-all duration-200 active:scale-95" onClick={() => window.open(URL.createObjectURL(new Blob(['Deployment Simulated'], {type:'text/plain'})), '_blank')}>
                        <Layout size={12} /> Live Vorschau
                     </button>
                    <div className="flex items-center bg-bolt-dark p-0.5 rounded-lg border border-bolt-border h-7 shadow-inner">
                        <button onClick={() => setActiveTab('code')} className={`flex gap-1.5 px-3 h-full rounded-md text-[10px] font-medium items-center transition-all duration-200 active:scale-95 ${activeTab === 'code' ? 'bg-bolt-bg text-white shadow-sm border border-bolt-border/50' : 'text-bolt-secondary hover:text-white'}`}>
                            <Code size={12} /> Code
                        </button>
                        <button onClick={() => setActiveTab('preview')} className={`flex gap-1.5 px-3 h-full rounded-md text-[10px] font-medium items-center transition-all duration-200 active:scale-95 ${activeTab === 'preview' ? 'bg-bolt-bg text-white shadow-sm border border-bolt-border/50' : 'text-bolt-secondary hover:text-white'}`}>
                            <Play size={12} /> Vorschau
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex-1 flex overflow-hidden">
                {sidebarOpen && <FileExplorer />}
                <div className="flex-1 relative flex flex-col min-w-0">
                    {activeTab === 'code' ? <EditorPanel /> : <PreviewPanel />}
                </div>
            </div>
            <TerminalPanel open={termOpen} setOpen={setTermOpen} />
        </div>
    );
};

const WorkspaceView = ({ onExitWorkspace }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [agentStep, setAgentStep] = useState<AgentStep>('idle');
  const [isPaused, setIsPaused] = useState(false);
  const aiRef = useRef<GoogleGenAI | null>(null);
  
  // Control refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const pauseResolverRef = useRef<(() => void) | null>(null);
  const isPausedRef = useRef(false);
  
  const { project, updateFileContent, createNode, deleteNode, showNotification, addLog } = useProject();

  useEffect(() => {
    if (process.env.API_KEY) {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
  }, []);

  const addMessage = (role: 'user' | 'model', content: string, agent?: AgentType, images?: string[]): string => {
    const id = Math.random().toString(36).substring(2, 9);
    setMessages(prev => [...prev, { id, role, content, timestamp: Date.now(), agent, images }]);
    return id;
  };

  // --- Control Functions ---
  const handlePause = useCallback(() => {
      setIsPaused(true);
      isPausedRef.current = true;
      addLog('System', 'Pausiert durch Benutzer.', 'warning');
  }, [addLog]);

  const handleResume = useCallback(() => {
      if (pauseResolverRef.current) {
          pauseResolverRef.current();
          pauseResolverRef.current = null;
      }
      setIsPaused(false);
      isPausedRef.current = false;
      addLog('System', 'Fortgesetzt.', 'info');
  }, [addLog]);

  const handleStop = useCallback(() => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
      }
      if (pauseResolverRef.current) {
          pauseResolverRef.current();
      }
      setIsPaused(false);
      isPausedRef.current = false;
      setAgentStep('idle');
      addLog('System', 'Abgebrochen durch Benutzer.', 'error');
  }, [addLog]);

  const checkControlFlow = async () => {
      if (abortControllerRef.current?.signal.aborted) {
          throw new Error('Cancelled');
      }
      if (isPausedRef.current) {
          await new Promise<void>(resolve => {
              pauseResolverRef.current = resolve;
          });
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error('Cancelled');
          }
      }
  };

  // --- THE AI AGENT LOOP (UPDATED V4.0) ---
  const handleSendMessage = async () => {
    const userMsg = input.trim();
    if (!userMsg || !aiRef.current) return;
    
    setInput('');
    addMessage('user', userMsg);
    
    // Reset control state
    abortControllerRef.current = new AbortController();
    isPausedRef.current = false;
    setIsPaused(false);
    
    // Prepare context
    const filesForContext = JSON.stringify(project.files.map(f => ({path: f.path, content: f.content})).slice(0, 20));
    
    try {
      // 0. PROMPT EXPERT (Phase 0)
      setAgentStep('optimizing');
      await checkControlFlow();
      addLog('Prompt Expert', 'Optimiere User-Anfrage (Design, Farbe, Tech)...', 'info');

      const expertSystemPrompt = `Du bist ein erfahrener Prompt-Engineer und Product Owner. 
      Deine Aufgabe: Verwandle die User-Idee in eine präzise technische Spezifikation.
      
      REGELN:
      1. Ergänze fehlende Details (Farbpalette, Zielgruppe, Features).
      2. Berücksichtige Best Practices für React + Tailwind + Supabase.
      3. Antworte NUR mit dem optimierten Prompt in Textform.`;
      
      const expertResponse = await aiRef.current.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        config: { systemInstruction: expertSystemPrompt }
      });

      const optimizedPrompt = expertResponse.text || userMsg;
      addMessage('model', `Optimierter Plan: ${optimizedPrompt}`, 'prompt_expert');
      addLog('Prompt Expert', 'Prompt erfolgreich optimiert.', 'success');

      // 1. CPO / PLANNER AGENT (Phase 1 - The Brain)
      // Creates concept, marketing, design docs in src/brain
      setAgentStep('planning');
      await checkControlFlow();
      addLog('CPO', 'Erstelle Business-Konzept & Brain...', 'info');

      const plannerPrompt = `
        TASK: Du bist der Chief Product Officer (CPO). Erstelle die Projekt-Grundlagen im 'src/brain' Ordner.
        INPUT: ${optimizedPrompt}
        
        ERSTELLE FOLGENDE DATEIEN:
        1. src/brain/concept.md (Business Plan, Features, Monetarisierung)
        2. src/brain/marketing.md (Zielgruppe, Social Media Strategie, Blog-Ideen)
        3. src/brain/design.json (Farbpalette Hex-Codes, Fonts, UI-Stil)

        Antworte NUR als JSON Action Array.
      `;

      const plannerResponse = await aiRef.current.models.generateContent({
          model: 'gemini-3-pro-preview', // Smartest model for strategy
          contents: [{ role: 'user', parts: [{ text: plannerPrompt }] }],
          config: { systemInstruction: DEFAULT_SYSTEM_PROMPT }
      });

      const plannerText = plannerResponse.text || '';
      const plannerJsonMatch = plannerText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
      const plannerActions = JSON.parse(plannerJsonMatch ? (plannerJsonMatch[1] || plannerJsonMatch[2]) : '{"actions": []}').actions || [];
      
      // Apply Planner Actions immediately
      plannerActions.forEach((action: AIFileAction) => {
          if (action.type === 'CREATE_FILE' || action.type === 'UPDATE_FILE') {
             // Create folders if needed
              const parts = action.path.split('/');
              const folderPath = parts.slice(0, -1).join('/');
              createNode(folderPath, 'file', action.content);
              updateFileContent(action.path, action.content || '');
          }
      });
      addMessage('model', 'Business-Konzept & Brain erstellt.', 'planner');


      // 2. CREATIVE DIRECTOR / ASSET GEN (Phase 2)
      setAgentStep('designing');
      await checkControlFlow();
      addLog('Creative', 'Prüfe Asset-Bedarf & Generiere Bilder...', 'info');

      // Check if we need a logo or hero image
      const designDoc = plannerActions.find(a => a.path.includes('design.json'))?.content || '{}';
      let generatedImages: string[] = [];

      if (optimizedPrompt.toLowerCase().includes('logo') || optimizedPrompt.toLowerCase().includes('bild') || true) { // Always try to gen assets for polish
          const assetPrompt = `
             Erstelle ein Prompt für ein modernes App-Icon/Logo basierend auf diesem Design: ${designDoc}.
             Antworte nur mit dem englischen Prompt für die Bild-KI.
          `;
          const assetPromptRes = await aiRef.current.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: [{role: 'user', parts: [{text: assetPrompt}]}]
          });
          const imagePrompt = assetPromptRes.text;
          
          addLog('Creative', `Generiere Asset: ${imagePrompt.substring(0, 30)}...`, 'info');
          
          try {
              // Using 2.5 flash image for generation as per instructions "Generate images using gemini-2.5-flash-image"
              // Note: In strict Google GenAI SDK, generation is often via 'generateImages' on Imagen models OR multimodal generateContent on newer models.
              // We will try standard generateContent with response schema if supported, or fall back to 2.5 Flash logic.
              // INSTRUCTION: "Call generateContent to generate images with nano banana series models"
              
              const imgResponse = await aiRef.current.models.generateContent({
                  model: 'gemini-2.5-flash-image', 
                  contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
                  config: { responseMimeType: 'image/jpeg' } // Hinting for image output
              });

              // Iterate parts to find image
              if(imgResponse.candidates?.[0]?.content?.parts) {
                  for (const part of imgResponse.candidates[0].content.parts) {
                      if (part.inlineData && part.inlineData.data) {
                          generatedImages.push(part.inlineData.data);
                          addLog('Creative', 'Bild erfolgreich generiert.', 'success');
                      }
                  }
              }
              
              if(generatedImages.length > 0) {
                  addMessage('model', 'Design-Assets generiert.', 'creative', generatedImages);
              }

          } catch (e) {
              console.warn("Image gen failed or not supported in this env", e);
              addLog('Creative', 'Bild-Generierung übersprungen (API Limit/Mock).', 'warning');
          }
      }

      // 3. DETECT BACKEND NEEDS (DB ARCHITECT)
      let additionalInstructions = "";
      if(userMsg.toLowerCase().includes('datenbank') || userMsg.toLowerCase().includes('login') || userMsg.toLowerCase().includes('speicher') || userMsg.toLowerCase().includes('supabase') || optimizedPrompt.toLowerCase().includes('supabase')) {
          setAgentStep('database');
          await checkControlFlow();
          
          addLog('DB Architect', 'Analysiere Datenbank-Anforderungen...', 'info');
          await new Promise(r => setTimeout(r, 800)); // Simulate thinking
          
          await checkControlFlow();
          
          addLog('DB Architect', 'Supabase Strategie entwickelt.', 'success');
          addLog('DB Architect', 'Fordere Schema & Types an...', 'info');
          additionalInstructions = " HINWEIS (VOM DB ARCHITECT): Der Nutzer benötigt Backend-Funktionalität. Implementiere dies mit dem '@supabase/supabase-js' Client. Gehe davon aus, dass die Environment-Variablen VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY existieren. WICHTIG: Erstelle eine Datei 'supabase/schema.sql', die den SQL-Code zum Erstellen der notwendigen Tabellen enthält. UND: Erstelle 'src/types/database.ts' mit den TypeScript Interfaces.";
      }

      // 4. ARCHITECT / CODER PHASE
      setAgentStep('coding');
      await checkControlFlow();
      addLog('Orchestrator', 'Starte Coder Agent (Model: Gemini 3 Pro)...', 'info');
      
      const coderPrompt = `
        ORIGINAL TASK: ${userMsg}
        OPTIMIZED TASK: ${optimizedPrompt}
        BRAIN CONTEXT (Design/Concept): ${JSON.stringify(plannerActions.map(a => a.content).join('\n').substring(0, 2000))}
        EXISTING FILES: ${filesForContext}
        INSTRUCTIONS: Du bist der Lead Coder. Erstelle oder aktualisiere Dateien, um die Aufgabe zu lösen.${additionalInstructions}
        Nutze das 'src/brain' Wissen für Farben und Texte.
        Antworte NUR mit JSON format actions.
      `;

      // Check before API call
      await checkControlFlow();
      
      const coderResponse = await aiRef.current.models.generateContent({
          model: 'gemini-3-pro-preview', // Strongest Logic Model
          contents: [{ role: 'user', parts: [{ text: coderPrompt }] }],
          config: { systemInstruction: DEFAULT_SYSTEM_PROMPT }
      });
      
      const coderText = coderResponse.text || '';
      let currentActions: AIFileAction[] = [];
      
      try {
          const jsonMatch = coderText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
          const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[2]) : coderText;
          const parsed = JSON.parse(jsonStr);
          currentActions = parsed.actions || [];
          addLog('Coder', `${currentActions.length} Änderungen vorgeschlagen.`, 'info');
      } catch (e) {
          addLog('Coder', 'Fehler beim Generieren von JSON.', 'error');
          throw new Error('Coder JSON Invalid');
      }

      // --- SELF-HEALING LOOP ---
      let approved = false;
      let attempts = 0;
      const MAX_RETRIES = 2;

      while(attempts <= MAX_RETRIES && !approved) {
          // 5. REVIEWER PHASE (The Autonomous Quality Check)
          setAgentStep('reviewing');
          await checkControlFlow();
          
          const attemptLabel = attempts > 0 ? `(Versuch ${attempts + 1})` : '';
          addLog('Reviewer', `Prüfe Code ${attemptLabel}...`, 'info');
          
          const reviewPrompt = `
            REVIEW TASK: Prüfe die folgenden Datei-Änderungen streng auf:
            1. Syntax-Fehler (Schließe Klammern, Semikolons).
            2. Import-Fehler (z.B. falsche Pfade, nicht existierende Exports).
            3. VERBOTENE PAKETE: Es dürfen nur 'react', 'react-dom', 'lucide-react', 'date-fns', '@supabase/supabase-js' verwendet werden.
            4. COMPONENT REGELN: Jede Komponente muss 'export default' haben. Icons müssen von 'lucide-react' kommen.
            5. VOLLSTÄNDIGKEIT: Keine "// ...rest of code" Platzhalter. Der Code muss vollständig sein.
            
            PROPOSED ACTIONS: ${JSON.stringify(currentActions)}
            
            Antworte mit JSON:
            {
              "approved": boolean,
              "issues": string[], // Liste spezifischer Fehlermeldungen
            }
          `;
          
          await checkControlFlow();
          
          const reviewResponse = await aiRef.current.models.generateContent({
              model: 'gemini-2.5-flash', // Fast and strict
              contents: [{ role: 'user', parts: [{ text: reviewPrompt }] }]
          });

          const reviewText = reviewResponse.text || '';
          const reviewJsonMatch = reviewText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
          const reviewParsed = JSON.parse(reviewJsonMatch ? (reviewJsonMatch[1] || reviewJsonMatch[2]) : '{}');

          if (reviewParsed.approved) {
              addLog('Reviewer', 'Code genehmigt.', 'success');
              approved = true;
          } else {
              addLog('Reviewer', `Probleme gefunden: ${reviewParsed.issues?.join(', ')}`, 'warning');
              
              if (attempts < MAX_RETRIES) {
                  // 6