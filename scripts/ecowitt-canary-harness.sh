#!/usr/bin/env bash
# EcoWitt manual-canary harness.
#
# Runs the three canary POSTs (main, duplicate replay, malformed) against the
# deployed `ecowitt-ingest` edge function and prints a redacted pass/fail
# matrix. Secret values are NEVER echoed. Raw response bodies are scrubbed
# before display.
#
# Required env:
#   SUPABASE_PROJECT_REF       e.g. abcd1234
#   ECOWITT_BRIDGE_TOKEN       vbt_... (Verdant bridge token)
#   ECOWITT_TEST_PASSKEY       real test PASSKEY for the canary tent
#   ECOWITT_TEST_MAC           real test MAC for the canary tent
#
# Optional env:
#   ECOWITT_ENDPOINT           override full URL
#   ECOWITT_RUN_SQL=1          run psql verification (needs PG* or SUPABASE_DB_URL)
#
# Exit code is 0 only if every preflight + POST + leak check passes.

set -u
set -o pipefail

PASS_COUNT=0
FAIL_COUNT=0
FAIL_NOTES=()

pass() { printf "  [PASS] %s\n" "$1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { printf "  [FAIL] %s\n" "$1"; FAIL_COUNT=$((FAIL_COUNT + 1)); FAIL_NOTES+=("$1"); }

# ---------- preflight ----------
echo "=== Preflight ==="
need_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    fail "env $name is required"
    return 1
  fi
  pass "env $name present (redacted)"
}
need_env SUPABASE_PROJECT_REF || true
need_env ECOWITT_BRIDGE_TOKEN  || true
need_env ECOWITT_TEST_PASSKEY  || true
need_env ECOWITT_TEST_MAC      || true

if [ $FAIL_COUNT -gt 0 ]; then
  echo
  echo "Preflight failed. Aborting before any network call."
  exit 1
fi

ENDPOINT="${ECOWITT_ENDPOINT:-https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/ecowitt-ingest}"
pass "endpoint resolved: $ENDPOINT"

# Redact helper — scrubs known secrets from any text before display.
redact() {
  python3 - "$ECOWITT_TEST_PASSKEY" "$ECOWITT_TEST_MAC" "$ECOWITT_BRIDGE_TOKEN" <<'PY'
import sys, re
text = sys.stdin.read()
for needle in sys.argv[1:]:
    if needle:
        text = text.replace(needle, "[REDACTED]")
# Belt-and-braces: also redact obvious echoes by key name.
text = re.sub(r'("?(?:passkey|PASSKEY|mac|MAC|api[_-]?key|application[_-]?key|token|auth)"?\s*[:=]\s*)"[^"]*"',
              r'\1"[REDACTED]"', text)
sys.stdout.write(text)
PY
}

contains_secret() {
  # Returns 0 if the file contains any raw secret.
  local f="$1"
  for needle in "$ECOWITT_TEST_PASSKEY" "$ECOWITT_TEST_MAC" "$ECOWITT_BRIDGE_TOKEN"; do
    [ -n "$needle" ] || continue
    if grep -F -q -- "$needle" "$f"; then
      return 0
    fi
  done
  return 1
}

post() {
  local label="$1" dateutc="$2" temp1f="$3"
  local body_file http_code
  body_file="$(mktemp)"
  http_code=$(curl -sS -o "$body_file" -w "%{http_code}" -X POST "$ENDPOINT" \
    -H "Authorization: Bearer ${ECOWITT_BRIDGE_TOKEN}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "PASSKEY=${ECOWITT_TEST_PASSKEY}" \
    --data-urlencode "MAC=${ECOWITT_TEST_MAC}" \
    --data-urlencode "api_key=SHOULD_NOT_PERSIST" \
    --data-urlencode "application_key=SHOULD_NOT_PERSIST" \
    --data-urlencode "token=SHOULD_NOT_PERSIST" \
    --data-urlencode "user_id=99999" \
    --data-urlencode "dateutc=${dateutc}" \
    --data-urlencode "temp1f=${temp1f}" \
    --data-urlencode "humidity1=48" \
    --data-urlencode "soilmoisture1=42" \
    --data-urlencode "temp9f=81.0" \
    --data-urlencode "humidity9=50" \
    --data-urlencode "soilmoisture9=55" \
    || echo "000")

  printf "  HTTP %s  (%s)\n" "$http_code" "$label"
  printf "  body : "
  redact < "$body_file"
  printf "\n"

  if [ "$http_code" = "200" ]; then
    pass "$label HTTP 200"
  else
    fail "$label HTTP=$http_code"
  fi

  if contains_secret "$body_file"; then
    fail "$label response body LEAKED a raw secret"
  else
    pass "$label response body has no raw PASSKEY/MAC/token"
  fi
  rm -f "$body_file"
}

# ---------- POST 1: main canary ----------
echo
echo "=== POST 1/3: main canary (dateutc=2026-06-04 21:00:00) ==="
post "main"      "2026-06-04 21:00:00" "79.2"

# ---------- POST 2: duplicate replay ----------
echo
echo "=== POST 2/3: duplicate replay (identical to POST 1) ==="
post "duplicate" "2026-06-04 21:00:00" "79.2"

# ---------- POST 3: malformed temperature ----------
echo
echo "=== POST 3/3: malformed temperature canary (dateutc=2026-06-04 21:05:00) ==="
post "malformed" "2026-06-04 21:05:00" "abc"

# ---------- SQL expectations ----------
echo
echo "=== SQL expectations ==="
SQL=$(cat <<'SQL'
-- Pre-POST (run BEFORE the harness): selected canary tent must have
--   air_channels = [1], soil_channels = [1], passkey_fingerprint = 'ewfp_...'
-- and channel 9 must be ABSENT from both arrays.

-- Main canary count: expect exactly 4 rows (temperature_c, humidity_pct,
-- soil_moisture_pct, vpd_kpa) all at 2026-06-04 21:00:00+00.
SELECT metric, COUNT(*) AS n
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND captured_at = '2026-06-04 21:00:00+00'
GROUP BY metric ORDER BY metric;

-- Malformed canary count: expect exactly 2 rows (humidity_pct, soil_moisture_pct).
-- NO temperature_c, NO vpd_kpa.
SELECT metric, COUNT(*) AS n
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND captured_at = '2026-06-04 21:05:00+00'
GROUP BY metric ORDER BY metric;

-- Channel 9 must produce 0 rows (unmapped negative-control).
SELECT COUNT(*) AS channel_9_rows
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND raw_payload->>'channel' = '9';

-- Leak scan: expect 0.
SELECT COUNT(*) AS leaks
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND raw_payload::text ~* '(passkey|"mac"|api[_-]?key|application[_-]?key|token|auth|service_role|"user_id")';

-- Null captured_at guard: expect 0.
SELECT COUNT(*) AS null_captured_at_rows
FROM public.sensor_readings
WHERE source = 'ecowitt' AND captured_at IS NULL;

-- timestamp_source: every main-canary row must be 'ecowitt_dateutc'.
SELECT metric, raw_payload->>'timestamp_source' AS ts_src
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND captured_at = '2026-06-04 21:00:00+00'
ORDER BY metric;
SQL
)

if [ "${ECOWITT_RUN_SQL:-0}" = "1" ] && command -v psql >/dev/null 2>&1; then
  echo "Running SQL via psql..."
  printf "%s\n" "$SQL" | psql -v ON_ERROR_STOP=1 ${SUPABASE_DB_URL:+"$SUPABASE_DB_URL"} || fail "psql verification raised an error"
else
  echo "SQL not auto-run. Execute these in the Supabase SQL editor or via psql:"
  echo
  printf "%s\n" "$SQL"
fi

# ---------- summary ----------
echo
echo "=== Pass/fail matrix ==="
printf "  passed: %d\n  failed: %d\n" "$PASS_COUNT" "$FAIL_COUNT"
if [ $FAIL_COUNT -gt 0 ]; then
  echo "  failures:"
  for n in "${FAIL_NOTES[@]}"; do printf "    - %s\n" "$n"; done
  exit 1
fi
echo "  All harness checks passed. SQL expectations still require manual grading."
exit 0
