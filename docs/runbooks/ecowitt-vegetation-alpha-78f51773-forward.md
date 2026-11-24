# EcoWitt forward to tent `78f51773-c576-4891-a9aa-240ed532337a`

Setup only. Matthew approves and runs each production step himself. This document does not apply SQL, mint a token, or change a gateway.

Key every step on the tent id `78f51773-c576-4891-a9aa-240ed532337a`. Some notes call that id "Vegetation Alpha (5x3)" and a different 4x2 tent is also called Vegetation Alpha. Do not select a tent by name.

This replaces the Nov 6 Flower-only target `eec6f7b3-b745-44ad-bab2-ed4ad79f88f5`. Do not write that Flower row as part of this forward.

Channels unconfirmed until read from the gateway. Do not copy channel numbers from the Nov 6 or Nov 2 receipts.

## 1. Confirm channels

In the WS View / EcoWitt app, open this gateway's sensor list and read the channel number next to each display name:

- Vegetation Alpha (air, temp/RH) → integer 1–8
- Soil Alpha (soil moisture) → integer 1–8

Record those two numbers with the date and the screen they came from. Stop if either name is missing.

## 2. `hardware_config.ecowitt` (Matthew applies SQL)

The shape consumed by `parseEligibleTents` in `supabase/functions/ecowitt-ingest/index.ts` and `tentChannels` in `supabase/functions/ecowitt-custom-upload/index.ts` is `air_channels`, `soil_channels`, and `passkey_fingerprint` (`ewfp_` + 24 hex).

On a machine that is not logging the shell history you care about, pass the raw passkey only through `ECOWITT_PASSKEY` or stdin. The script has no channel defaults.

```bash
ECOWITT_PASSKEY="$(cat)" bun scripts/prepare-ecowitt-vegetation-alpha-forward.ts \
  --air <air-channel> \
  --soil <soil-channel>
```

Stdout is JSON: tent id, channel arrays, `passkey_fingerprint`, and one `UPDATE` scoped with `WHERE id = '78f51773-c576-4891-a9aa-240ed532337a'`. The raw passkey is not in that output. Review the statement. It merges those three keys onto `hardware_config.ecowitt` for that id only, so running it again with the same values is idempotent.

Apply it only after your approval, in the SQL editor you already use for production. Expect one returned row. If the row count is not 1, roll the transaction back.

## 3. Credential the gateway path uses

The gateway customized-upload path uses a **claim token**, not a bridge token.

- Claim token: 32–128 hex characters. Created by the RPC `create_ecowitt_custom_upload_claim` with `p_tent_id = 78f51773-c576-4891-a9aa-240ed532337a` (`src/lib/ecowittCustomUploadClaimService.ts`). The plaintext `upload_token` is returned once. At rest, `ecowitt_custom_upload_claims` stores `token_sha256`.
- Bridge token (`vbt_…`): minted by `supabase/functions/mint-bridge-token` and stored as `bridge_tokens.token_hash` (SHA-256). That token is `Authorization: Bearer` for `sensor-ingest-webhook` and `ecowitt-ingest`. It is the wrong secret for the path below. Do not mint one for this forward, and do not paste a `vbt_` value into the gateway path.

Mint the claim from a signed-in session that owns the tent, after approval. Copy the plaintext once into the gateway UI. Do not put it in git, GitHub, or a log. Revoke with `revoke_ecowitt_custom_upload_claim` if it leaks.

## 4. Gateway (Matthew, on the device)

From `src/constants/ecowittCustomUploadCopy.ts`:

- Upload mode: Customized
- Protocol: Ecowitt
- Port: 80
- Path: `ew/<claim token>` (no leading slash)

`cloudflare/ecowitt-plain-http-ingest.ts` plans `POST /ew/<token>` and would forward to `{edgeBase}/ecowitt-custom-upload/ew/<token>`. This repository does not define the public hostname. Use the host the station card shows at apply time. Until then the placeholder is:

`http://<PUBLIC_INGEST_HOST>/ew/<claim token>`

## 5. Check the first readings

After the gateway posts, read `sensor_readings` for both ids. New rows should use `tent_id = 78f51773-c576-4891-a9aa-240ed532337a` and `raw_payload.ingest_path = ecowitt_custom_upload`. A new row on `eec6f7b3-b745-44ad-bab2-ed4ad79f88f5` means the forward is still aimed at Flower: stop, revoke the new claim, and put the gateway upload back.

## 6. Rollback

1. On the gateway, disable customized upload or point it back at the previous server and path.
2. Revoke the claim with `revoke_ecowitt_custom_upload_claim`.
3. If the config write should be undone, restore the previous `hardware_config` value for `78f51773-c576-4891-a9aa-240ed532337a` from the backup taken before the `UPDATE`. Do not edit the Flower row as a substitute.

Gate: no production writes until Matthew approves each step (config, token, device). Channels unconfirmed until read from gateway.
