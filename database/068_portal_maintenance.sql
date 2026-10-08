ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS maintenance_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE portal_settings ADD COLUMN IF NOT EXISTS maintenance_message text NOT NULL DEFAULT 'Estamos realizando melhorias no UfaProva. Volte em breve.';
