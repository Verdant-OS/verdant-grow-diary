ALTER TABLE public.tents
  ADD COLUMN IF NOT EXISTS hardware_config jsonb;

COMMENT ON COLUMN public.tents.hardware_config IS
  'Optional per-tent hardware mapping. Example shape: {"ecowitt": {"passkey_fingerprint": "ewfp_...", "air_channels": [1,2], "soil_channels": [3,4]}}. Raw EcoWitt PASSKEY/MAC must NEVER be stored here — only the fingerprint computed by src/lib/ecowittPasskeyFingerprint.ts.';

CREATE INDEX IF NOT EXISTS idx_tents_ecowitt_fingerprint
  ON public.tents ((hardware_config #>> '{ecowitt,passkey_fingerprint}'))
  WHERE hardware_config ? 'ecowitt';