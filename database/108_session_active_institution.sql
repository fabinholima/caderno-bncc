-- Instituição ativa da sessão: quem participa de mais de uma instituição
-- escolhe em qual está trabalhando. NULL = primeira em que é administrador.
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS active_institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL;
