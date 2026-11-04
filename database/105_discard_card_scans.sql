-- Cartões sem aluno identificado (QR ilegível, PDF inválido) podem ser
-- descartados da fila. A linha é mantida para que um reenvio do aplicativo
-- com o mesmo identificador não volte a enfileirar a foto.
ALTER TABLE card_scans DROP CONSTRAINT card_scans_status_check;
ALTER TABLE card_scans ADD CONSTRAINT card_scans_status_check
  CHECK (status IN ('queued','processing','completed','review','failed','discarded'));
ALTER TABLE card_scans
  ADD COLUMN IF NOT EXISTS discarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS discarded_by uuid REFERENCES users(id);
