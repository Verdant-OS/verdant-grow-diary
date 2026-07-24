# Ecowitt bridge `config validate` fixtures

Frozen env fixtures used by CI to prove the `config validate` subcommand's
error codes and JSON envelope stay stable across refactors.

- `passing/` — envs that must exit `0` with `{"event":"config_ok",…}`.
  The canonical passing fixture is `examples/ecowitt-bridge/.env.example`,
  loaded directly by the CI runner.
- `failing/*.env` — one env per stable error code. The runner asserts
  exit `2`, `event=config_error`, and the expected `code=…` value.

Never add real tent UUIDs, bridge tokens, or ingest URLs to these files.

Runner: `scripts/ci-ecowitt-config-validate-contract.mjs`
Workflow: `.github/workflows/ecowitt-config-validate-contract.yml`
