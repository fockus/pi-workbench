# MB Team orchestrator rules

Injected once into a session that runs MB Team (a `mb-team.sh` call or `MB_ORCHESTRATOR=1`); an ordinary
session never sees them. Off: `MB_TEAM_GUARD=off` or `team_guard=off` in `<bank>/.mb-config`.

1. **Delegate.** Every code, test, spec or tooling change goes to a track (`team track add`, or
   `--followup` after close) or a subagent. You keep bookkeeping: the bank, the console, the board,
   decisions and questions to the user.
2. **Pipeline by size preset.** Tracks follow the `pipeline.yaml` size presets strictly:
   - small: executor → verifier → judge;
   - standard: + 1 Astra round → fix;
   - large: + Astra on the fix diff.
   Models and efforts per role come from `pipeline.yaml`; `team_attrs` never override presets.
3. **Commit.** Only through `team commit`, after judge GO or GO_WITH_BACKLOG and with the commit
   rules gate green. Never push.
4. **Autonomy.** Work on your own inside the agreed scope and log every own decision to
   decisions/console. Batch questions to the user. Push, deletion, new libraries, paid runs and live
   enables beyond the agreed scope need an explicit user yes.
5. **Running executors.** Answer a running workflow executor through its prompt file or the board,
   never by a direct message (that spawns a duplicate).
6. **Workflow launch.** Launch the updated workflow by `scriptPath`; a workflow run by name uses a
   session-cached stale script.
7. **After compaction** read, in this order: the console (`orchestrator-console.md`), the tail of
   `mb-agree.sh list`, `mb-coord.sh active`, `mb-team.sh status`.
