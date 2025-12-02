/**
 * NeXifyAI Builder - Supabase Schema Types
 * TypeScript-Definitionen für alle Datenbank-Tabellen
 */

export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  revelot_customer_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  files: any; // JSONB - FileNode[]
  supabase_config?: {
    url: string;
    anonKey: string;
  };
  system_prompt?: string;
  created_at: string;
  updated_at: string;
}

export interface BrainEntry {
  id: string;
  project_id: string;
  user_id: string;
  content: string;
  embedding?: number[]; // Vector als Array
  metadata: {
    source?: string;
    agent?: string;
    tags?: string[];
    [key: string]: any;
  };
  entry_type: 'concept' | 'design' | 'decision' | 'documentation' | 'marketing';
  created_at: string;
  updated_at: string;
}

export interface AgentLog {
  id: string;
  project_id?: string;
  user_id: string;
  agent_type: string;
  message: string;
  log_type: 'info' | 'success' | 'warning' | 'error' | 'agent';
  metadata: {
    [key: string]: any;
  };
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  revelot_subscription_id?: string;
  tier: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  current_period_start?: string;
  current_period_end?: string;
  created_at: string;
  updated_at: string;
}

