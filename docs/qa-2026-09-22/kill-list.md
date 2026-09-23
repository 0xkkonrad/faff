# Faff QA pre-flight

Target: 85ed1badf10fba2ac735915d460a4e2ee692da4a in isolated detached worktree /workspaces/sandbox/worktrees/faff-qa-20260922.
Production website source: origin/master 057766359c39f825e4e006d94a738267c8b32f14.
Scope: Faff timer, plans, history, persistence, backup, concurrency, PWA updates/offline, mobile and desktop accessibility, runtime performance, maintainability. Exclude unrelated website content, accounts/cloud sync, redesign, guaranteed locked-phone alarms.
Lenses: model/storage correctness; browser UX/accessibility; runtime performance/PWA/code quality.
Kill-list: none found. README product behavior is recorded without a named dated human approval and cannot close findings by itself. No conflicting product sources found.
Scoping inconsistencies: shared website checkout is stale and has unrelated uncommitted work; deploy through an isolated worktree based on remote master. Standalone source push does not deploy the site. Claude Workflow and requested Opus models unavailable; use the provided Codex agents for independent review and verification.
Verification: independent refutation pass, root hand reproduction of all medium/high findings. Review agents are read-only; root owns changes. Persist findings and verdicts in repo docs.

Additional source: website docs/faff.md. Its claim that static/faff is the source predates the standalone repository and conflicts with the newer standalone README. Resolve release mechanics from actual remote source equality (verified byte-for-byte) and the standalone release instructions; update website docs in this release.
settles: daily plan, ratings, offline scope and design · ruling: preserve documented 30-minute sessions, local storage and Butter design · by: unnamed, undated · source: website docs/faff.md · grade: RECORDED
No RULING-grade decisions found.
