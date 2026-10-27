# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-10-28

### Added
- Initial public release.

### Fixed
- Markdown reports escape service names in the findings scope, so a name like `pipe|name` can no longer break the findings list or its code span.
- Duplicate `depends_on:` entries no longer produce duplicate graph edges, repeated Mermaid arrows, or colliding React keys.
- Mermaid labels escape `<` and `>`, so service names render as text instead of being swallowed as HTML.
