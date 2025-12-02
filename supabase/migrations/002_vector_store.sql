-- NeXifyAI Builder - Vector Store Functions
-- SQL-Funktionen für semantische Suche im Brain

-- Erstelle project_brain Tabelle für RAG-System (falls nicht vorhanden)
CREATE TABLE IF NOT EXISTS project_brain (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  entry_type TEXT NOT NULL, -- 'concept', 'design', 'decision', 'code'
  embedding vector(1536), -- OpenAI/Gemini Embedding
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE project_brain ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own brain entries" ON project_brain
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own brain entries" ON project_brain
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable pgvector Extension (für Vektor-Suche)
CREATE EXTENSION IF NOT EXISTS vector;

-- Function für semantische Suche (Cosine Similarity)
CREATE OR REPLACE FUNCTION match_brain_entries(
  project_id UUID,
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  user_id UUID,
  content TEXT,
  metadata JSONB,
  entry_type TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pb.id,
    pb.project_id,
    pb.user_id,
    pb.content,
    pb.metadata,
    pb.entry_type,
    pb.created_at,
    1 - (pb.embedding <=> query_embedding) AS similarity
  FROM project_brain pb
  WHERE 
    pb.project_id = match_brain_entries.project_id
    AND pb.embedding IS NOT NULL
    AND 1 - (pb.embedding <=> query_embedding) > match_threshold
  ORDER BY pb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Index für bessere Performance bei Vektor-Suche
CREATE INDEX IF NOT EXISTS idx_project_brain_embedding_cosine 
ON project_brain 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Function für Text-basierte Suche (Fallback)
CREATE OR REPLACE FUNCTION search_brain_text(
  project_id UUID,
  search_query TEXT,
  limit_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  user_id UUID,
  content TEXT,
  metadata JSONB,
  entry_type TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pb.id,
    pb.project_id,
    pb.user_id,
    pb.content,
    pb.metadata,
    pb.entry_type,
    pb.created_at
  FROM project_brain pb
  WHERE 
    pb.project_id = search_brain_text.project_id
    AND (
      pb.content ILIKE '%' || search_query || '%'
      OR pb.metadata::text ILIKE '%' || search_query || '%'
    )
  ORDER BY pb.created_at DESC
  LIMIT limit_count;
END;
$$;

