-- Imagens dos temas de redação guardadas uma vez só, pelo hash do conteúdo.
-- Antes, cada texto motivador, cada cópia de tema e cada aplicação (no
-- prompt_snapshot) carregava a imagem inteira em base64. Agora todos guardam
-- só o sha256; os bytes ficam aqui ou no armazenamento de objetos (storage_ref).
CREATE TABLE essay_images (
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg')),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  data bytea,
  storage_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, sha256),
  CHECK (data IS NOT NULL OR storage_ref IS NOT NULL)
);

ALTER TABLE essay_motivating_texts
  ADD COLUMN image_sha256 text CHECK (image_sha256 ~ '^[0-9a-f]{64}$');

-- Converte uma data URL em linha de essay_images e devolve o hash.
CREATE FUNCTION pg_temp.essay_image_ref(institution uuid, value text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  contents bytea := decode(substring(value from ',(.*)$'), 'base64');
  digest text := encode(sha256(contents), 'hex');
BEGIN
  INSERT INTO essay_images (institution_id, sha256, mime_type, byte_size, data)
  VALUES (institution, digest, substring(value from '^data:(image/(png|jpeg));'),
          length(contents), contents)
  ON CONFLICT DO NOTHING;
  RETURN digest;
END $$;

-- Blocos de conteúdo: {"type":"image","dataUrl":...} vira {"type":"image","image":<sha256>}.
CREATE FUNCTION pg_temp.essay_image_blocks(institution uuid, blocks jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(
           CASE WHEN block->>'type' = 'image' AND coalesce(block->>'dataUrl', '') <> ''
                THEN (block - 'dataUrl')
                     || jsonb_build_object('image', pg_temp.essay_image_ref(institution, block->>'dataUrl'))
                ELSE block END
           ORDER BY position), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(blocks, '[]'::jsonb)) WITH ORDINALITY AS item(block, position)
$$;

UPDATE essay_motivating_texts t
   SET image_sha256 = CASE WHEN t.image_data_url <> ''
                           THEN pg_temp.essay_image_ref(p.institution_id, t.image_data_url) END,
       content = pg_temp.essay_image_blocks(p.institution_id, t.content)
  FROM essay_prompts p
 WHERE p.id = t.prompt_id;

-- Aplicações já registradas: o mesmo nos textos congelados do snapshot.
UPDATE essay_applications a
   SET prompt_snapshot = jsonb_set(a.prompt_snapshot, '{motivatingTexts}', (
         SELECT coalesce(jsonb_agg(
                  (item - 'imageDataUrl')
                  || jsonb_build_object(
                       'content', pg_temp.essay_image_blocks(a.institution_id, item->'content'),
                       'imageSha256', CASE WHEN coalesce(item->>'imageDataUrl', '') <> ''
                                           THEN pg_temp.essay_image_ref(a.institution_id, item->>'imageDataUrl') END)
                  ORDER BY position), '[]'::jsonb)
           FROM jsonb_array_elements(a.prompt_snapshot->'motivatingTexts') WITH ORDINALITY AS t(item, position)))
 WHERE jsonb_typeof(a.prompt_snapshot->'motivatingTexts') = 'array';

ALTER TABLE essay_motivating_texts DROP COLUMN image_data_url;
