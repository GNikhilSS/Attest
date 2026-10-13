# Skill Verification POC: Implementation Plan

Oct 12, 2026 · @NikhilTricon

## Scope

The POC covers Tier 1 skills (Node.js, React, Python Scripting) at Level 2. Each exam is coding or debugging in a live editor.

In scope: manager-approved exam start, exam creation, event capture, submission, background grading, integrity report, manager decision.

Out of scope: heartbeat and away-time tracking, webcam proctoring, Tier 2 and 3 skills, retake cooldowns beyond a fixed rule, and any auto-approval.

## Attempt lifecycle

States: `requested` → `approved` → `created` → `in_progress` → `submitted` → `graded` → `decided`.

| From | To | Actor | Trigger |
| --- | --- | --- | --- |
| REQUESTED | APPROVED | manager | Manager approves the request |
| APPROVED | CREATED | server | Approval builds the exam |
| CREATED | IN\_PROGRESS | employee | Employee opens the exam |
| CREATED | SUBMITTED | server | Deadline passes and the exam was never opened. Records a `NOT_STARTED` event. |
| IN\_PROGRESS | SUBMITTED | employee | Employee submits |
| IN\_PROGRESS | SUBMITTED | server | Deadline passes while the exam is open |
| SUBMITTED | GRADED | server | Grading completes. Runs inline for the POC. |
| GRADED | DECIDED | manager | Manager approves or rejects |

All transitions run through one function that rejects invalid moves. Every transition writes an event row. Decided attempts are never edited.

## Data model

| Model | Key fields |
| --- | --- |
| `Employee` | name, managedById (self-relation: manager and reports) |
| `Skill` | skillName (unique) |
| `Question` | skillId, proficiencyLevel, questionType (SCRATCH or DEBUG), questionContent, starterCode (optional) |
| `TestCase` | questionId, input, expectedOutput, visibility (VISIBLE, HIDDEN\_A, HIDDEN\_B) |
| `Attempt` | employeeId, approvedById (optional until approved), skillId, proficiencyLevel, status, startTime, deadline |
| `AttemptQuestion` | attemptId + questionId (composite primary key), position (unique per attempt) |
| `Submission` | attemptId + questionId (references AttemptQuestion), submittedAnswer, isCorrect (optional until graded), submittedAt. Every submit adds a row. |
| `AttemptEvent` | attemptId, type, serverTime (set by server), payload (JSON) |

`Attempt` rows and `AttemptEvent` rows are never updated for past states. `Submission` rows are never edited or deleted, so grading always sees the full history.

## Exam flow

1. Employee requests a skill at a level. The request is stored as `requested`.
2. Manager approves. The attempt becomes `approved`.
3. The server builds the exam from the question bank for that skill and level, and marks it `created`.
4. Employee opens the exam. The editor loads the question with two visible tests and starts logging events.
5. Employee submits, or the deadline passes. The attempt becomes `submitted` and grading is queued.
6. A background job runs the visible and hidden tests, stores results, computes the integrity summary, and writes the report.
7. The attempt becomes `graded`. The manager is notified and opens the report.
8. Manager approves or rejects with a reason. The attempt becomes `decided`.

## Grading and integrity

- **Visible tests:** the candidate sees pass or fail for each of the two tests. Test code is never sent to the client.
- **Hidden set A:** shown to the candidate only as pass or fail counts. Used for the score.
- **Hidden set B:** kept only for us. Used to check the grader and detect leaked tests. Not shown to anyone in the product.
- **Grading runs in Judge0** inside a background job. The worker stores each test result with its set name.
- **Integrity signals** are logged as events: tab switches, copy, paste, fullscreen exits, and editor activity. Similarity across attempts is computed in the same job.
- **AI-use signal** is stored as evidence. It is never a pass or fail verdict.

The manager sees the score, test breakdown, time taken, events, similarity, and the AI-use evidence, and makes the final decision.

## Build order

1. Prisma schema for the tables above, with migrations.
2. Attempt state machine: one transition function, with tests for every invalid move.
3. Express API: request, approve, create exam, open, submit.
4. Exam UI: one question, a live editor, visible test results, event logging.
5. Grading worker: Judge0 runs, results stored, report written.
6. Manager portal: approval queue, report view, decision.
7. Judge0 on a self-hosted VM, with no outbound network from the sandbox.

Steps 1 and 2 come first because every other step depends on them.

## Open decisions

- [ ] Who owns hidden set B, and who writes and reviews the question bank?
- [ ] Should the manager be notified by email when a report is ready, or by a portal badge?
- [ ] Can an attempt be created without an approval? Current position: no.
- [ ] Retake wait: 14 days, proposed. Confirm per skill and level.
- [ ] Heartbeat and away-time tracking: deferred until after the POC.
