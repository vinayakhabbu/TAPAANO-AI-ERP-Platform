# BMAD in Tapaano

BMAD Method is installed for Codex at project scope. It supplies planning,
implementation and review workflows for this existing ERP. It does not change
application behavior or establish production acceptance.

## Installation and provenance

The 29 upstream skills in `.agents/skills/` are committed, so a normal clone
already contains them. Open Codex at the repository root; start a fresh session
if newly installed skills are not yet listed. Use `$` or `/skills` in Codex to
select a skill. In other hosts, use their available skill selector.

- Source: [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD).
- Verified upstream revision: [`0a00053409731db811f2595ceb521dff9dde9a19`](https://github.com/bmad-code-org/BMAD-METHOD/tree/0a00053409731db811f2595ceb521dff9dde9a19).
- Installed module version: `6.13.0-next` (upstream's current prerelease).
- Installed on: 2026-09-16, using the official Skills CLI route:
  `npx skills add bmad-code-org/BMAD-METHOD --agent codex --skill '*' --yes`.
- All 260 installed skill files were checked against that revision's Git blob
  hashes. `skills-lock.json` records Skills CLI source and content hashes;
  the committed files and repository commit preserve the exact installation.
- Upstream [MIT license](docs/third-party/BMAD-LICENSE.txt) and
  [trademark notice](docs/third-party/BMAD-TRADEMARK.md) accompany the vendored files.
  Tapaano's own license remains in `LICENSE`.

Use Node 22, npm, Git and [uv](https://docs.astral.sh/uv/). BMAD's Python scripts
require Python 3.11 or later. BMAD is developer tooling, not an application npm
dependency. Its files and planning artifacts are excluded from Docker builds.

## Start work

| Need | Invoke in Codex |
| --- | --- |
| Setup, help or next workflow | `$bmad` |
| A clear, session-sized change | `$bmad-build` |
| Several sessions of related work | `$bmad-spec`, request Story Breakdown, then `$bmad-build` per story |
| Significant technical decisions | `$bmad-architecture` |
| Additional code review | `$bmad-code-review` |
| Human acceptance walkthrough | `$bmad-walkthrough` |
| Refresh repository instructions | `$bmad-project-context` |

Example starting prompt:

```text
$bmad-spec
Define a bounded production-pilot acceptance milestone for Tapaano.
Read AGENTS.md, docs/README.md, FINANCE_DELIVERY_STATUS.md and
PRODUCTION_READINESS.md first. Verify current code and environment evidence.
Separate remaining code changes from provider configuration and finance,
security and operations acceptance. Preserve supported accounting boundaries.
Produce acceptance criteria and an ordered Story Breakdown. Do not mark
live configuration or production acceptance complete from synthetic tests.
```

The example is a starting prompt, not a completed specification or accepted
backlog. Existing finance capabilities are documented in the domain guides;
do not restart the ERP as a greenfield project. Small changes can go directly
to Build without running every planning workflow.

## Project files

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Concise project rules loaded by Codex |
| `docs/README.md` | Index of existing finance, security and operating guides |
| `.agents/skills/` | Unmodified upstream workflows and their assets |
| `skills-lock.json` | Skills CLI installation metadata |
| `_bmad/config.toml` | Shared project name and artifact locations |
| `_bmad/scripts/` | Shared runtime materialized by official setup |
| `_bmad/custom/` | Optional supported team overrides; personal `*.user.toml` files are ignored |
| `_bmad-output/specs/` | Specs and story lists created by Spec |
| `_bmad-output/planning-artifacts/` | Planning documents created by planning workflows |
| `_bmad-output/implementation-artifacts/` | Build records, reviews and sprint evidence |

Commit useful, sanitized artifacts with the changes they describe. Never put
passwords, session tokens, invitation links, provider secrets or customer
financial records into prompts saved here, working logs or screenshots.

## Setup, health checks and upgrades

Initial setup has already run. To inspect/repair an existing checkout, ask:

```text
$bmad Run bmad doctor for this project.
```

For a new project runtime, ask `$bmad` to run `bmad setup`. The underlying
official setup commands, run from the repository root, are:

```bash
uv run --no-cache .agents/skills/bmad/scripts/setup.py --project-root . --skill .agents/skills/bmad --list-config-questions
uv run --no-cache .agents/skills/bmad/scripts/setup.py --project-root . --skill .agents/skills/bmad
```

If the question list is nonempty, let the hub collect those answers before
running setup. The installed revision has no unanswered module questions.
Setup preserves existing shared answers. Personal overrides belong in ignored
`_bmad/config.user.toml` or `_bmad/custom/*.user.toml` files.

If a restricted environment has no writable temporary directory, set `TMPDIR`
to an existing writable scratch directory before running uv. Do not change the
upstream scripts to work around the environment.

For upgrades, first ask `$bmad` to run `bmad update`; that command only checks
versions. Review the proposed upstream change before running
`npx skills update --project`. Then run `bmad doctor`, review the skill/lock/runtime
diff, refresh this provenance record, and validate in a PR. Do not silently
upgrade workflows during unrelated financial changes.

BMAD reviews supplement Tapaano's existing CI and release gates. Follow
`CONTRIBUTING.md`, `.github/workflows/ci.yml`, `.github/workflows/security.yml`
and `PRODUCTION_READINESS.md`; workflow completion alone is not release approval.
