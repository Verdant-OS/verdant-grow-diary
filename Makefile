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

.PHONY: help check-cli login init link pull push types types-local diff \
        functions-serve functions-deploy reset verify db-url status

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

status: check-cli ## Show local Supabase stack status
	supabase status

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

reset: check-cli ## Reset local DB (destructive — local only)
	supabase db reset

db-url: ## Print the remote database URL template
	@echo "postgresql://postgres:<DB_PASSWORD>@db.$(PROJECT_REF).supabase.co:5432/postgres"

verify: ## Run the seed verifier script
	@test -n "$$SUPABASE_SERVICE_ROLE_KEY" || { echo "SUPABASE_SERVICE_ROLE_KEY is required"; exit 1; }
	@test -n "$$USER_ID" || { echo "USER_ID is required"; exit 1; }
	SUPABASE_URL=$(SUPABASE_URL) npx tsx scripts/verify-seed.ts
