/**
 * NeXifyAI Builder - File Utilities
 * Hilfsfunktionen für Datei-Operationen
 */

import type { FileNode } from '../types';

/**
 * Erstellt einen FileNode mit spezifischem Pfad
 */
export function createFileNode(path: string, content: string = ''): FileNode {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  
  return {
    name,
    path,
    type: 'file',
    content
  };
}

/**
 * Erstellt einen FolderNode mit spezifischem Pfad
 */
export function createFolderNode(path: string): FileNode {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  
  return {
    name,
    path,
    type: 'folder',
    children: [],
    isOpen: true
  };
}

