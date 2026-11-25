export const meta = {
  name: 'mb-team-track',
  description: 'Run MB Team tracks through their size pipeline: executor → verifier (with the commit rules gate) → cross-model review rounds per the track pipeline → fix (triages the findings itself) → judge, with team.json, board and console bookkeeping at every milestone',
  whenToUse: 'Driving /mb team tracks; args = the JSON printed by `mb-team.sh workflow-args --tracks A,B` (per track you may set start: execute|verify|fix|fix-review|judge, blocking = the previous judge blocking items, fixes, notes, reviewFile)',
  phases: [
    { title: 'Execute', detail: 'track agent, TDD, track prompt' },
    { title: 'Verify', detail: 'plan-verifier over the DoD plus the team commit rules gate' },
    { title: 'Review', detail: 'external reviewer, review_rounds from the track pipeline; later rounds on the fix diff only; a large track gets one more on its last fix diff' },
    { title: 'Fix', detail: 'track agent: triages findings under the brief severity scale, failing test first' },
    { title: 'Judge', detail: 'mb-judge: GO / GO_WITH_BACKLOG / NO_GO; a re-judge sees only the fix diff and its previous blocking items' },
  ],
}

// Every path, model and effort comes from args (mb_team_workflow.py); a workflow script cannot read files.
const A = args
// sha256 of this file with this line's value blanked (scripts/mb_team_script_sha.py; --refresh rewrites it).
const SCRIPT_SHA = 'f658b256f01a01e3cf4536a1e9be34c33e8c3e3bf980646ebf9f5f1467c52e62'
const STARTS = ['execute', 'verify', 'fix', 'fix-review', 'judge']
const q = (p) => (/^[\w@%+=:,./-]+$/.test(p) ? p : "'" + p.replace(/'/g, "'\\''") + "'")
const book = (t, status, note, summary) =>
  `${A.team} track set ${t.id}${status ? ' --status ' + status : ''} --note "${note}"${summary ? ' --summary-file ' + q(summary) : ''}`
// A planned track that starts past execute had its work done outside this run: the first stage books
// dispatched → returned before its own status, or the status machine refuses that status.
const catchUp = (t) => {
  if (t.status !== 'planned' || t.start === 'execute' || t.caughtUp) return ''
  t.caughtUp = true
  return `${book(t, 'dispatched', `work done before this run (start ${t.start})`)} && ${book(t, 'returned', 'ready for ' + t.start)} && `
}
const rdir = (t) => `${A.bank}/reports/${A.topic}/${t.id}-review`
// Files of one run are prefixed with its run id (workflow-args) and start mode, so a later run never overwrites earlier evidence.
const stem = (t) => `${rdir(t)}/${A.run}-${t.start}`
const gate = (t) => `${A.gate} ${t.id}`
const opts = (label, phase, role, schema) => {
  const o = { label, phase, schema }
  if (role.agent) o.agentType = role.agent
  if (role.model) o.model = role.model
  if (role.effort) o.effort = role.effort
  return o
}
const numbered = (items) => items.map((x, i) => `   ${i + 1}. ${x}`).join('\n')

const RULES = `Repository ${A.tree}; work only there. Team brief (binding: rules, contract, severity scale, test commands): ${A.brief}.
Never commit, push, change permissions or configuration, read secrets (.env*), or touch protected paths; no network or paid model calls in tests.
Bookkeeping commands below are mandatory; run them exactly — they update team.json, the COORDINATION board and the orchestrator console.`
const TRACK_DIFF = `the track's changes vs HEAD (git diff HEAD -- <the track globs> — staged changes too, plus each new untracked file via git diff --no-index /dev/null <file>; no caches or build output)`
const GATE = (t) => `the team commit rules gate, exactly: ${gate(t)}
   It is the check \`team commit\` runs (SRP size limit including tests, the project's rules_gate lint, the track's globs and contract, open HANDOVER/BLOCKED entries for the track).`

const LIST = { type: 'array', items: { type: 'string' } }
const STATUS = { type: 'object', properties: { status: { type: 'string' }, summary: { type: 'string' } }, required: ['status', 'summary'] }
const FIX = { type: 'object', properties: { status: { type: 'string' }, summary: { type: 'string' }, kept: LIST, rejected: LIST }, required: ['status', 'summary', 'kept', 'rejected'] }
const VERIFY = { type: 'object', properties: { pass: { type: 'boolean' }, issues: LIST }, required: ['pass', 'issues'] }
const REVIEW = { type: 'object', properties: { verdict: { type: 'string' }, file: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string' }, where: { type: 'string' }, text: { type: 'string' } }, required: ['severity', 'text'] } } }, required: ['verdict', 'file', 'findings'] }
const JUDGE = { type: 'object', properties: { decision: { type: 'string' }, rationale: { type: 'string' }, blocking: LIST, backlog: LIST, commit_paths: LIST, orchestrator_checks: LIST }, required: ['decision', 'rationale', 'blocking', 'backlog', 'commit_paths', 'orchestrator_checks'] }

const execute = (t) => agent(`${RULES}

You are the executor of MB Team track ${t.id}. Task and DoD: ${t.prompt} (read it and the brief first).
1. Run: ${book(t, 'dispatched', 'executor started')}
2. Do the task with TDD: a failing test first for every behaviour, then the code. Keep the diff minimal and inside the track's globs (${(t.files || []).join(', ') || 'see the prompt'}).
3. Run the track's tests, the linter on changed files, and any contract the prompt names.
4. Write your report to ${t.report}: Files · Tests (red → green with output) · Remaining · Questions · Follow-ups, last line STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED.
5. Run: ${book(t, 'returned', '<one-line result with test counts>', t.report)}
${t.notes ? 'Orchestrator notes: ' + t.notes : ''}
Return {status, summary}.`, opts(`exec:${t.id}`, 'Execute', t, STATUS))

const verify = (t) => agent(`${RULES}

You are the plan-verifier for MB Team track ${t.id}. Run first: ${catchUp(t)}${book(t, 'verifying', 'verifier started')}
1. Check every DoD line in ${t.prompt} against the real code and tests in the working tree (git diff vs HEAD plus new files), run the named tests yourself, and read the executor report ${t.report}. Do not edit files.
2. Run ${GATE(t)}
   A non-zero exit fails this stage: put every line it reports into issues.
3. Run: ${book(t, '', 'verifier <PASS|FAIL>: <one line>')}
Return {pass, issues} — issues are concrete unmet DoD items, regressions and rules-gate lines.`, opts(`verify:${t.id}`, 'Verify', t.verifier, VERIFY))

// diff: null → a round over the whole track diff; a path → a round over that fix diff only.
const review = (t, round, max, diff, prev) => {
  const s = `${stem(t)}-round${round}`
  const cmd = A.review.command.replace('{prompt}', q(`${s}.prompt.md`)).replace('{out}', q(`${s}.out.md`))
  return agent(`${RULES}

You run the cross-model review, round ${round} of at most ${max}, for MB Team track ${t.id}. Run first: ${catchUp(t)}${book(t, 'reviewing', `external review r${round} started`)}
1. ${diff ? `This round reviews ONLY the fix diff ${diff}: copy it to ${s}.diff (mkdir -p ${rdir(t)}); do not rebuild or widen it.` : `Build ${TRACK_DIFF} into ${s}.diff (mkdir -p ${rdir(t)}).`}
2. Write ${s}.prompt.md from the template ${A.review.template}, filling it from ${t.prompt}, ${t.report} and the brief${diff ? `; use the template's fix-diff shape${prev ? `, the previous findings are in ${prev} and the report's Fix section says which were kept or rejected` : ''}` : ''}.
3. Run exactly, in the background, and wait for it to finish (it can take 10–30 minutes):
   cd ${q(A.tree)} && ${cmd}
   Never change the model or the command. If the reviewer CLI is missing or unauthenticated, return verdict SKIPPED with the reason — loudly, never a silent pass.
4. The real verdict is the LAST "VERDICT:" block of ${s}.out.md.
5. Run: ${book(t, '', `external review r${round}: <verdict> <counts>`)}
Return {verdict, file, findings} — file is the output path.`, opts(`review-r${round}:${t.id}`, 'Review', t.wrapper, REVIEW))
}

// triage: review findings are triaged here; verifier issues and judge blocking items are all fixed.
const fix = (t, items, tag, triage, src) => {
  const out = `${stem(t)}-${tag}`
  return agent(`${RULES}

You are the executor fixing MB Team track ${t.id} (task: ${t.prompt}; your earlier report: ${t.report}${src ? '; review output: ' + src : ''}).
1. Run: ${catchUp(t)}${book(t, 'fixing', `fixing ${items.length} item(s)`)}
2. Before editing, save ${TRACK_DIFF} into ${out}.base.diff (mkdir -p ${rdir(t)}).
3. ${triage ? `Triage every finding first under the brief's severity scale: verify it against the code it cites; keep it only when it is real (blocker/major = a realistic scenario) or a cheap one-line item; reject the rest with a reason (backlog material). Then, for each kept finding` : 'For each item (all must be fixed)'}: a failing test first, then the smallest fix. Items:
${numbered(items)}
4. Run the track's tests, the linter on changed files, and any contract the prompt names.
5. Write ONLY your changes into ${out}.diff: rebuild HEAD + ${out}.base.diff in a scratch copy (git archive HEAD <paths> | tar -x; git apply), then diff -u that copy against the working tree for the changed files.
6. Append a "Fix ${t.start}-${tag}" section to ${t.report}: per item kept | rejected + reason, red → green per kept item, what was not covered; keep a last STATUS line.
7. Run: ${book(t, 'returned', 'fixes done: <kept>/<rejected> counts', t.report)}
Return {status, summary, kept, rejected} — each item as given plus a short reason.`, opts(`fix:${t.id}`, 'Fix', t.fix, FIX))
}

// ctx: {unreviewed: the last fix diff no reviewer saw, or null; fixDiffs; blocking: the previous judge blocking items;
// size; reviewRounds: the track's review_rounds; reviews: the verdicts of the rounds that ran}.
const judge = (t, ctx) => {
  const rejudge = ctx.blocking.length > 0 && ctx.fixDiffs.length > 0
  const scope = rejudge
    ? `This is a re-judge after a fix. Look ONLY at the fix diff(s) ${ctx.fixDiffs.join(', ')} and whether each of your previous blocking items is resolved:
${numbered(ctx.blocking)}
Do not re-review the rest of the track: it was judged before. A new problem counts only when the fix diff introduces it.`
    : `Task and DoD ${t.prompt}, executor report ${t.report}, ${ctx.reviewRounds === 0
      ? `no external review ran for size ${ctx.size} (review_rounds 0) and none is required: judge on the DoD, the tests, the rules gate and the report; never ask for review evidence.`
      : `review evidence of this run in ${stem(t)}-* (rounds ran: ${ctx.reviews.join(', ') || 'none'}; verdict blocks are at the END of each .out.md). Check that what was reviewed matches the working tree and that rejected or backlog items are really minor under the brief's scale.`}${ctx.unreviewed ? `
The fix ${ctx.unreviewed} is unreviewed (no review round follows it): review that hunk yourself with the same severity scale.` : ''}`
  return agent(`${RULES}

You are the final judge for MB Team track ${t.id}. Run first: ${catchUp(t)}${A.team} verdict --tracks ${t.id} --begin && ${book(t, '', 'judge started')}
${scope}
Verify yourself: run the track's tests and named contracts and the linter on changed files, then ${GATE(t)}
   A non-zero exit is NO_GO with its lines in blocking — the commit would refuse this track.
Give the exact commit path list for this track (no caches, nothing owned by other tracks); a needed file outside the track's globs stays in the list and goes to orchestrator_checks as "widen: track set ${t.id} --add-files <paths>". List in orchestrator_checks every check only the orchestrator may run before the commit (for example a read-only look at live user state the tracks may not touch); empty when none.
Then record your decision, which binds it to the current diff and to your commit path list (\`team commit\` refuses without it; widening the track with exactly those paths keeps it valid), and book it:
   ${A.team} verdict --tracks ${t.id} --decision <GO|GO_WITH_BACKLOG|NO_GO> --paths <your commit_paths, comma-separated, tree-relative> && ${book(t, 'done', 'judge <decision>: <one line>')}
   (GO → done; GO_WITH_BACKLOG → --status done_with_concerns; NO_GO, or a track already finished → drop --status.)
Return {decision, rationale, blocking, backlog, commit_paths, orchestrator_checks}.`, opts(`judge:${t.id}`, 'Judge', t.judge, JUDGE))
}

const finding = (f) => `${f.severity}${f.where ? ' ' + f.where : ''}: ${f.text}`

// The full stage results live in the run's journal.jsonl; the return value stays short for the notification.
async function runTrack(t) {
  if (!STARTS.includes(t.start)) return { id: t.id, decision: 'BAD_ARGS', blocking: [`start '${t.start}' not in ${STARTS.join('|')}`] }
  const blocking = t.blocking || []
  const fixDiffs = []
  const reviews = []
  let unreviewed = null
  // A fix that changed code yields its diff path; one that kept nothing yields null. A blocked or silent
  // fix sets fixBlocked: the track stops there, it never reaches a review or the judge.
  let fixBlocked = null
  const doFix = async (items, triage, src) => {
    const tag = `fix${fixDiffs.length + 1}`
    const r = await fix(t, items, tag, triage, src)
    if (!r || /BLOCKED/.test(r.status)) fixBlocked = r ? r.summary : 'fix returned nothing'
    if (fixBlocked || (triage && !(r.kept || []).length)) return null
    fixDiffs.push(`${stem(t)}-${tag}.diff`)
    return fixDiffs[fixDiffs.length - 1]
  }
  let capped = false // the last allowed round ended in a fix: nothing reviewed it yet
  let lastFile = null
  const reviewRounds = async (max, firstDiff) => {
    let diff = firstDiff
    let prev = null
    for (let round = 1; round <= max; round++) {
      const rv = await review(t, round, max, diff, prev)
      reviews.push(rv ? rv.verdict : 'NONE')
      if (rv && !/SKIPPED/.test(rv.verdict)) unreviewed = null
      if (!rv || /SKIPPED/.test(rv.verdict) || !rv.findings.length) break
      const fd = await doFix(rv.findings.map(finding), true, rv.file)
      if (!fd) break
      unreviewed = fd
      if (/APPROVED/.test(rv.verdict)) break // minor findings only: no extra round, the judge reviews the fix
      diff = fd
      prev = rv.file
      lastFile = rv.file
      capped = round === max
    }
  }
  // Large tracks only (AGR-102): one more round on exactly the last fix diff; blocker/major findings get ONE fix, minor ones stay for the judge.
  const lastRound = async () => {
    const rv = await review(t, reviews.length + 1, t.review_rounds + 1, unreviewed, lastFile)
    reviews.push(rv ? rv.verdict : 'NONE')
    if (!rv || /SKIPPED/.test(rv.verdict)) return
    unreviewed = null
    const hard = rv.findings.filter((f) => /^(blocker|major)$/i.test(f.severity))
    if (hard.length) unreviewed = await doFix(hard.map(finding), true, rv.file)
  }
  if (t.start === 'execute') {
    const ex = await execute(t)
    if (!ex || /BLOCKED/.test(ex.status)) return { id: t.id, decision: 'BLOCKED', blocking: [ex ? ex.summary : 'executor returned nothing'] }
  }
  if (t.start === 'execute' || t.start === 'verify') {
    if (t.verifier) {
      const v = await verify(t)
      if (v && !v.pass && v.issues.length) await doFix(v.issues, false)
    }
    if (!fixBlocked) await reviewRounds(t.review_rounds || 0, null)
  } else if (t.start === 'fix' || t.start === 'fix-review') {
    const fd = await doFix(t.fixes && t.fixes.length ? t.fixes : blocking, false, t.reviewFile)
    unreviewed = fd
    if (fd && t.start === 'fix-review') await reviewRounds(t.review_rounds || 0, fd)
  }
  if (!fixBlocked && t.size === 'large' && capped && unreviewed) await lastRound()
  if (fixBlocked) return { id: t.id, decision: 'BLOCKED', blocking: [fixBlocked], reviews }
  const j = await judge(t, { unreviewed, fixDiffs, blocking, size: t.size, reviewRounds: t.review_rounds || 0, reviews }) || { decision: 'NO_VERDICT', blocking: [], backlog: [], commit_paths: [], orchestrator_checks: [] }
  log(`${t.id}: judge ${j.decision}`)
  return { id: t.id, decision: j.decision, commit_paths: j.commit_paths, blocking: j.blocking, backlog: j.backlog,
    orchestrator_checks: j.orchestrator_checks, reviews, unreviewed_fix: unreviewed !== null }
}

// A stale cached script (Workflow runs the copy from session start) spawns nothing.
if (A.script_sha !== SCRIPT_SHA) {
  const why = `args.script_sha ${A.script_sha || '<none>'} != script ${SCRIPT_SHA}: relaunch the current workflow`
  return A.tracks.map((t) => ({ id: t.id, decision: 'STALE_SCRIPT', blocking: [why] }))
}

// At most team.max_parallel tracks at once; results keep the order of args.tracks.
const results = []
let next = 0
const worker = async () => {
  while (next < A.tracks.length) {
    const i = next++
    results[i] = await runTrack(A.tracks[i])
  }
}
const width = Math.max(1, Math.min(A.max_parallel || A.tracks.length, A.tracks.length))
await parallel(Array.from({ length: width }, () => worker))
return results
