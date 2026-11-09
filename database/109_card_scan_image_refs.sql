-- Imagens dos cartões fora do banco: o arquivo enviado e a imagem de revisão
-- passam a ficar no armazenamento de objetos ("provedor:chave"). As colunas
-- bytea continuam para os registros antigos e para quem não configurou storage.
ALTER TABLE card_scans ADD COLUMN IF NOT EXISTS image_ref text;
ALTER TABLE card_scans ADD COLUMN IF NOT EXISTS review_image_ref text;
