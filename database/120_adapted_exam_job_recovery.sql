-- Geração da prova adaptada pela IA: registra quando o job começou e quantas
-- vezes foi tentado. Um job interrompido por reinício do servidor volta para a
-- fila; após três tentativas falha com motivo. Aditiva.
ALTER TABLE render_jobs
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
