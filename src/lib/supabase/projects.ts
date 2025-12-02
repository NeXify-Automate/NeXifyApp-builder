/**
 * NeXifyAI Builder - Projekt-Persistierung
 * Auto-Save und Sync mit Supabase
 */

import { supabase } from './client';
import type { Project } from './schema';
import type { FileNode } from '../../types';

export interface ProjectData {
  name: string;
  description?: string;
  files: FileNode[];
  supabaseConfig?: {
    url: string;
    anonKey: string;
  };
  systemPrompt?: string;
}

/**
 * Speichert ein Projekt in Supabase
 */
export async function saveProject(
  projectData: ProjectData,
  userId: string
): Promise<Project | null> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: projectData.name,
        description: projectData.description,
        files: projectData.files,
        supabase_config: projectData.supabaseConfig,
        system_prompt: projectData.systemPrompt
      })
      .select()
      .single();

    if (error) {
      console.error('Fehler beim Speichern des Projekts:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Speichern des Projekts:', error);
    return null;
  }
}

/**
 * Aktualisiert ein bestehendes Projekt
 */
export async function updateProject(
  projectId: string,
  projectData: Partial<ProjectData>
): Promise<Project | null> {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (projectData.name) updateData.name = projectData.name;
    if (projectData.description !== undefined) updateData.description = projectData.description;
    if (projectData.files) updateData.files = projectData.files;
    if (projectData.supabaseConfig) updateData.supabase_config = projectData.supabaseConfig;
    if (projectData.systemPrompt !== undefined) updateData.system_prompt = projectData.systemPrompt;

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Fehler beim Aktualisieren des Projekts:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Projekts:', error);
    return null;
  }
}

/**
 * Lädt alle Projekte eines Users
 */
export async function loadUserProjects(userId: string): Promise<Project[]> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Fehler beim Laden der Projekte:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Fehler beim Laden der Projekte:', error);
    return [];
  }
}

/**
 * Lädt ein spezifisches Projekt
 */
export async function loadProject(projectId: string): Promise<Project | null> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      console.error('Fehler beim Laden des Projekts:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Laden des Projekts:', error);
    return null;
  }
}

/**
 * Löscht ein Projekt
 */
export async function deleteProject(projectId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Fehler beim Löschen des Projekts:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Fehler beim Löschen des Projekts:', error);
    return false;
  }
}

/**
 * Auto-Save: Speichert Projekt automatisch nach Änderungen
 */
let autoSaveTimeout: NodeJS.Timeout | null = null;

export function autoSaveProject(
  projectId: string | null,
  projectData: Partial<ProjectData>,
  userId: string,
  delay: number = 2000
): void {
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }

  autoSaveTimeout = setTimeout(async () => {
    if (projectId) {
      await updateProject(projectId, projectData);
    } else {
      await saveProject(projectData as ProjectData, userId);
    }
  }, delay);
}

