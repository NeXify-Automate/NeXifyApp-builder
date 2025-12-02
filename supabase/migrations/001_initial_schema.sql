-- NeXifyAI Builder - Initial Database Schema
-- Mit strikter Mandantentrennung (RLS)

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgvector Extension für Vektor-Store
CREATE EXTENSION IF NOT EXISTS "vector";

-- Users Table (erweitert für NeXifyAI)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  revelot_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  supabase_config JSONB,
  system_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Project Brain (RAG-System) - Vektor-Store
CREATE TABLE IF NOT EXISTS project_brain (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI/Gemini Embedding Dimension
  metadata JSONB DEFAULT '{}'::jsonb,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('concept', 'design', 'decision', 'documentation', 'marketing')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Logs für Monitoring
CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  message TEXT NOT NULL,
  log_type TEXT NOT NULL CHECK (log_type IN ('info', 'success', 'warning', 'error', 'agent')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions (REVELOT Business)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revelot_subscription_id TEXT UNIQUE,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'enterprise')),
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes für Performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_project_brain_project_id ON project_brain(project_id);
CREATE INDEX IF NOT EXISTS idx_project_brain_user_id ON project_brain(user_id);
CREATE INDEX IF NOT EXISTS idx_project_brain_entry_type ON project_brain(entry_type);
CREATE INDEX IF NOT EXISTS idx_agent_logs_project_id ON agent_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_user_id ON agent_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

-- Vector Index für semantische Suche
CREATE INDEX IF NOT EXISTS idx_project_brain_embedding ON project_brain 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Row Level Security (RLS) Policies

-- Enable RLS für alle Tabellen
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_brain ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Projects: Users können nur ihre eigenen Projekte sehen/bearbeiten
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- Project Brain: Users können nur Brain-Einträge ihrer Projekte sehen
CREATE POLICY "Users can view own project brain" ON project_brain
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own project brain entries" ON project_brain
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own project brain entries" ON project_brain
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own project brain entries" ON project_brain
  FOR DELETE USING (auth.uid() = user_id);

-- Agent Logs: Users können nur ihre eigenen Logs sehen
CREATE POLICY "Users can view own agent logs" ON agent_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own agent logs" ON agent_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Subscriptions: Users können nur ihre eigenen Subscriptions sehen
CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions" ON subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- Functions für automatische Timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers für updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_brain_updated_at BEFORE UPDATE ON project_brain
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

