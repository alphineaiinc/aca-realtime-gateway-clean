# Stage 2 continuous restricted observation — draft acceptance contract

Stage 1 accepted: run 45679254603, job 139435067386; configuration 03657983152f969ce221a92c4d5a498ca03387aa; Manager 6678909c7e9e60c08b0bc56c150e9031900a3984. Control #153 disabled after one-shot. Preserve both revisions and 44-task baseline.

## Reuse and boundaries
Reuse observeOnce, fixed GitHub GET transport, pre/post stop checks and four false authorization flags. No provider, database, authenticated delivery, durable recovery, artifact download or engineering dispatch. Existing durable observation store remains excluded because external I/O can roll back retry admission (LL-DB-001). Do not treat pinned historical CI as current project-wide status. Governance summary is not configured.

## Scheduling decision
GitHub scheduled workflows run from the default branch; main currently has only CI, safe coding queue and Phase 2 notification workflows. Do not merge a scheduler or change main to activate it. A ChatGPT monitoring automation is not execution of the Manager. Evaluate a separately authorized default-branch scheduler or existing zero-cost isolated host; verify actual trigger support, effective read-only permissions and no extra spend before selecting. No automatic retries or persistent activation authorized by this draft.

## Acceptance requirements
- Independent review of exact scheduler and runtime revisions, bounded cadence/window and owner activation approval.
- Fresh exact-revision CI and actual scheduler execution evidence, no overlapping runs, no replay on rerun, bounded timeout; distinguish concurrency exclusion from durable deduplication.
- Control #153 stays blocked and disabled until separate activation; body edits only, verify actual workflow side effects. Stop before and after each observation, suppress output on stop; in-flight GET may finish.
- Exact repository/product/issue and independently accepted observation revision; explicit handling of stale evidence, no claim of current CI from historical SHA.
- Logs only, all authorization flags false, no privileged notifications or writes. Verify at least two scheduled observations and disabled scheduled tick; no claim of persistent operation before evidence.
- CAD $0, no merge, deployment, credentials, signing or dispatch. Consult LL-CTRL-001, LL-ACT-001, LL-DB-001 and OLR-011/012 before implementation.
