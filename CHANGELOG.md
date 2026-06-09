# Changelog

All notable changes to the Verdant Quick Log Playwright smoke CI harness are
documented in this file.

## Unreleased

### Changed

- Aligned the Quick Log Playwright smoke workflow triggers from `main` to
  `verdant-grow-diary`, matching the Lovable sync / default branch.
  - `workflow_dispatch` remains available for manual runs.
  - Artifact retention remains 30 days.
  - No app runtime behavior changed.
