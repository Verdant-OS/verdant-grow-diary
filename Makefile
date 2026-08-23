# Supabase CLI workflows for the Lovable Cloud backend.
#
# Usage:
#   make help              # list targets
#   make link              # link local repo to this Cloud project
#   make pull              # pull remote schema into supabase/migrations
#   make types             # regenerate src/integrations/supabase/types.ts
#   make verify            # run the seed verifier script
#   make diff              # show local-vs-remote schema differences
#
# Requirements:
#   - supabase CLI installed (brew install supabase/tap/supabase)
#   - SUPABASE_DB_PASSWORD exported (or supplied interactively)
#   - For verify: SUPABASE_SERVICE_ROLE_KEY and USER_ID exported

PROJECT_REF       ?= knkwiiywfkbqznbxwqfh
SUPABASE_URL      ?= https://$(PROJECT_REF).supabase.co
TYPES_OUT         ?= src/integrations/supabase/types.ts
MIGRATION_NAME    ?= new_migration
REPLAY_OUTPUT     ?=
SUPABASE_REPLAY_WORKDIR ?=

.PHONY: help check-cli check-replay-workdir check-replay-cleanup-workdir prepare-replay login init link pull push \
        types types-local diff functions-serve functions-deploy start stop reset verify \
        db-url status

help:
	@echo "Supabase workflows (project ref: $(PROJECT_REF))"
	@echo ""
	@awk 'BEGIN { FS = ":.*?## " } /^[a-zA-Z_-]+:.*?## / { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

check-cli: ## Verify supabase CLI is installed
	@command -v supabase >/dev/null 2>&1 || { \
		echo "supabase CLI not found. Install: brew install supabase/tap/supabase"; \
		exit 1; \
	}
	@supabase --version

check-replay-workdir: ## Fail unless SUPABASE_REPLAY_WORKDIR is a prepared disposable project
	@test -n "$(SUPABASE_REPLAY_WORKDIR)" || { \
		echo "SUPABASE_REPLAY_WORKDIR is required. Run make prepare-replay REPLAY_OUTPUT=<new-temp-child> first."; \
		exit 2; \
	}
	node scripts/prepare-local-supabase-replay.mjs \
		--verify-workdir="$(SUPABASE_REPLAY_WORKDIR)" --json >/dev/null

check-replay-cleanup-workdir: ## Bound a prepared workdir for cleanup after source advances
	@test -n "$(SUPABASE_REPLAY_WORKDIR)" || { \
		echo "SUPABASE_REPLAY_WORKDIR is required for cleanup."; \
		exit 2; \
	}
	node scripts/prepare-local-supabase-replay.mjs \
		--verify-cleanup-workdir="$(SUPABASE_REPLAY_WORKDIR)" --json >/dev/null

prepare-replay: check-cli ## Build a new SHA-pinned disposable replay project at REPLAY_OUTPUT
	@test -n "$(REPLAY_OUTPUT)" || { \
		echo "REPLAY_OUTPUT must be a new child path under an OS temporary directory."; \
		exit 2; \
	}
	node scripts/prepare-local-supabase-replay.mjs --output="$(REPLAY_OUTPUT)" --json
	@echo "Prepared. Export SUPABASE_REPLAY_WORKDIR=$(REPLAY_OUTPUT) before start/status/reset/stop."

login: check-cli ## Log in to Supabase (opens browser)
	supabase login

init: check-cli ## Initialize supabase/ folder (skip if already present)
	@if [ -f supabase/config.toml ]; then \
		echo "supabase/config.toml already exists — skipping init."; \
	else \
		supabase init; \
	fi

link: check-cli ## Link local repo to this Cloud project
	supabase link --project-ref $(PROJECT_REF)

status: check-cli check-replay-workdir ## Show the prepared local Supabase stack status
	@if supabase status --workdir "$(SUPABASE_REPLAY_WORKDIR)" >/dev/null 2>&1; then \
		echo "Prepared local Supabase stack is running."; \
	else \
		echo "Local Supabase status failed; credential-bearing output was suppressed."; \
		exit 1; \
	fi

start: check-cli check-replay-workdir ## Start the prepared local Supabase stack
	@if supabase start --workdir "$(SUPABASE_REPLAY_WORKDIR)" >/dev/null 2>&1; then \
		echo "Prepared local Supabase stack started."; \
	else \
		echo "Local Supabase failed to start; credential-bearing output was suppressed."; \
		if ! supabase stop --workdir "$(SUPABASE_REPLAY_WORKDIR)" --no-backup >/dev/null 2>&1; then \
			echo "Partial-start cleanup also failed; the prepared workdir was preserved."; \
		fi; \
		exit 1; \
	fi

stop: check-cli check-replay-cleanup-workdir ## Stop a bounded prepared local Supabase stack
	@if supabase stop --workdir "$(SUPABASE_REPLAY_WORKDIR)" --no-backup >/dev/null 2>&1; then \
		echo "Prepared local Supabase stack stopped."; \
	else \
		echo "Local Supabase cleanup failed; credential-bearing output was suppressed."; \
		exit 1; \
	fi

pull: check-cli ## Pull remote schema into supabase/migrations
	supabase db pull

push: check-cli ## Push local migrations to remote (use with caution)
	@echo "About to push migrations to $(PROJECT_REF). Ctrl-C to abort."
	@sleep 3
	supabase db push

diff: check-cli ## Show schema diff between local and remote
	supabase db diff --linked

new-migration: check-cli ## Create a new empty migration: make new-migration MIGRATION_NAME=add_foo
	supabase migration new $(MIGRATION_NAME)

types: check-cli ## Regenerate TypeScript types from remote schema
	@echo "Generating types for $(PROJECT_REF) -> $(TYPES_OUT)"
	supabase gen types typescript --project-id $(PROJECT_REF) > $(TYPES_OUT)
	@echo "Wrote $(TYPES_OUT)"

types-local: check-cli ## Generate types from local Supabase instance
	supabase gen types typescript --local > $(TYPES_OUT)

functions-serve: check-cli ## Serve edge functions locally with .env.local
	supabase functions serve --env-file .env.local

functions-deploy: check-cli ## Deploy all edge functions (Lovable does this automatically)
	supabase functions deploy

reset: check-cli check-replay-workdir ## Reset the prepared local DB (destructive — local only)
	supabase db reset --workdir "$(SUPABASE_REPLAY_WORKDIR)" --local

db-url: ## Print the remote database URL template
	@echo "postgresql://postgres:<DB_PASSWORD>@db.$(PROJECT_REF).supabase.co:5432/postgres"

verify: ## Run the seed verifier script
	@test -n "$$SUPABASE_SERVICE_ROLE_KEY" || { echo "SUPABASE_SERVICE_ROLE_KEY is required"; exit 1; }
	@test -n "$$USER_ID" || { echo "USER_ID is required"; exit 1; }
	SUPABASE_URL=$(SUPABASE_URL) npx tsx scripts/verify-seed.ts
