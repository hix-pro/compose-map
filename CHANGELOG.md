# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-10-29

### Added
- Compare mode: paste a previous and a proposed Compose file to see services added, removed, or changed, along with findings introduced, resolved, or re-graded. The comparison reuses the same parser and rule engine as the main view.
- Field-level deltas for image, build, command, ports, volumes, environment, `env_file`, `depends_on`, networks, healthchecks, restart policy, and privilege settings.
- Secret-looking environment values are redacted in the comparison, matching the main inspector.
- `docker compose config` output is accepted, so the comparison can use the exact configuration Docker would run.
- Short and long port/volume syntax are compared semantically, so equivalent entries do not show as changes.

## [0.1.1] - 2026-10-28

### Added
- Initial public release.

### Fixed
- Markdown reports escape service names in the findings scope, so a name like `pipe|name` can no longer break the findings list or its code span.
- Duplicate `depends_on:` entries no longer produce duplicate graph edges, repeated Mermaid arrows, or colliding React keys.
- Mermaid labels escape `<` and `>`, so service names render as text instead of being swallowed as HTML.
