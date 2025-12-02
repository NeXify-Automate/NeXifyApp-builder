/**
 * NeXifyAI Builder - Authentifizierung & Mandantentrennung
 * User-Management mit Supabase Auth
 */

import { supabase } from './client';
import type { User } from './schema';

/**
 * Meldet einen User an
 */
export async function signIn(email: string, password: string): Promise<{ user: any; error: any }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    return { user: data.user, error };
  } catch (error) {
    console.error('Fehler beim Anmelden:', error);
    return { user: null, error };
  }
}

/**
 * Registriert einen neuen User
 */
export async function signUp(email: string, password: string, fullName?: string): Promise<{ user: any; error: any }> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    return { user: data.user, error };
  } catch (error) {
    console.error('Fehler bei der Registrierung:', error);
    return { user: null, error };
  }
}

/**
 * Meldet den aktuellen User ab
 */
export async function signOut(): Promise<{ error: any }> {
  try {
    const { error } = await supabase.auth.signOut();
    return { error };
  } catch (error) {
    console.error('Fehler beim Abmelden:', error);
    return { error };
  }
}

/**
 * Gibt den aktuellen User zurück
 */
export async function getCurrentUser(): Promise<any | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.error('Fehler beim Laden des Users:', error);
      return null;
    }
    return user;
  } catch (error) {
    console.error('Fehler beim Laden des Users:', error);
    return null;
  }
}

/**
 * Aktualisiert User-Profil
 */
export async function updateUserProfile(userId: string, updates: Partial<User>): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId);

    return { error };
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Profils:', error);
    return { error };
  }
}

/**
 * Prüft ob User eingeloggt ist
 */
export function isAuthenticated(): boolean {
  const { data: { session } } = supabase.auth.getSession();
  return !!session;
}

/**
 * Auth State Listener
 */
export function onAuthStateChange(callback: (user: any) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });

  return () => {
    subscription.unsubscribe();
  };
}

