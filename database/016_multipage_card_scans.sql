ALTER TABLE card_scans
  ADD COLUMN parent_scan_id uuid REFERENCES card_scans(id) ON DELETE CASCADE,
  ADD COLUMN source_page integer NOT NULL DEFAULT 1 CHECK (source_page >= 1),
  ADD COLUMN source_pages integer NOT NULL DEFAULT 1 CHECK (source_pages >= source_page);

CREATE INDEX card_scans_parent_idx
  ON card_scans (parent_scan_id, source_page);

COMMENT ON COLUMN card_scans.parent_scan_id IS
  'Upload PDF original; as demais páginas são resultados filhos independentes.';
