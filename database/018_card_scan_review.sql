ALTER TABLE card_scans
  ADD COLUMN IF NOT EXISTS review_image_data bytea;

COMMENT ON COLUMN card_scans.review_image_data IS
  'Imagem PNG normalizada da página, mantida para conferência humana e reprocessamento.';
