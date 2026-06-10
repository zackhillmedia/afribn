BEGIN;

INSERT INTO roles (name, permissions)
VALUES
  ('Platform Administrator', ARRAY['*']),
  ('Intelligence Analyst', ARRAY['stories:review','reports:create','sources:read','ai:process']),
  ('Country Agent', ARRAY['tasks:read','tasks:submit','attachments:create']),
  ('Verification Officer', ARRAY['verification:approve','verification:reject','verification:request_more_info']),
  ('Enterprise Client', ARRAY['feed:read','alerts:manage','watchlists:manage','reports:download'])
ON CONFLICT (name) DO NOTHING;

INSERT INTO prompt_versions (name, version, prompt, schema, status)
VALUES (
  'intelligence_distillation',
  'v1',
  'Extract conservative structured intelligence from raw source material. Do not invent facts.',
  '{}',
  'active'
)
ON CONFLICT (name, version) DO NOTHING;

COMMIT;
