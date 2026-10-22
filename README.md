# Attest — Skill Verification Platform (POC)

An automated skill assessment and verification backend designed to evaluate software engineering proficiency through hands-on coding exams, sandboxed Judge0 grading, and manager review.

---

##  Scope & Objectives

The Proof of Concept (POC) covers **Tier 1 skills** (Node.js, React, Python Scripting) at **Proficiency Level 2**:
* **Manager-governed exam workflow**: Requests must be approved by the candidate's manager before an exam is generated.
* **Question Bank & Dynamic Exam Generation**: Exams are built dynamically with matching proficiency questions.
* **Interactive Code Testing**: Candidates can run custom code and sample inputs in real time.
* **Automated Sandboxed Grading**: Submissions are graded asynchronously via [Judge0](https://judge0.com/) across visible and hidden test suites.
* **Audit Trail**: Every state transition and exam action is recorded in an immutable event log.

---

##  Attempt Lifecycle & State Machine

Exams follow a strict, one-way state machine enforced by [`attemptStateMachine.ts`](file:///src/attempts/attemptStateMachine.ts):

```
REQUESTED ──► APPROVED ──► CREATED ──► IN_PROGRESS ──► SUBMITTED ──► GRADED ──► DECIDED
```

| From State | To State | Allowed Actor | Trigger & Business Logic |
| :--- | :--- | :--- | :--- |
| `REQUESTED` | `APPROVED` | **Manager** | Manager approves the employee's request. |
| `APPROVED` | `CREATED` | **Server** | Server selects questions from the question bank and sets the deadline. |
| `CREATED` | `IN_PROGRESS` | **Employee** | Candidate opens the exam; starts the exam timer. |
| `CREATED` | `SUBMITTED` | **Server** | Deadline passes without the exam being opened (records `NOT_STARTED` event). |
| `IN_PROGRESS` | `SUBMITTED` | **Employee** | Candidate completes and submits their code. |
| `IN_PROGRESS` | `SUBMITTED` | **Server** | Deadline passes while the candidate is taking the exam. |
| `SUBMITTED` | `GRADED` | **Server** | Background grading worker completes Judge0 evaluation and produces the score. |
| `GRADED` | `DECIDED` | **Manager** | Manager reviews report and issues an `APPROVED` or `REJECTED` decision with reason. |

*Note: Once marked `DECIDED`, an attempt is final and can never be modified.*

---

##  Grading & Test Visibility Model

Each question contains test cases divided into three distinct visibility tiers:

* **Visible Tests (`VISIBLE`)**: Displayed to the candidate in the editor to test their code interactively with sample inputs and outputs.
* **Hidden Set A (`HIDDEN_A`)**: Used for official scoring. Pass/fail results are evaluated by the background worker and aggregated into the final percentage score.
* **Hidden Set B (`HIDDEN_B`)**: Integrity test cases used internally to evaluate grader accuracy and detect test-suite leaks. Not shown in the candidate UI.

---

##  Project Structure

```
src/
├── app.ts                         # Express server entry point & route registration
│
├── auth/                          # JWT Authentication
│   ├── auth.controller.ts         # Login & Register handlers
│   ├── auth.middleware.ts         # 'verify' middleware checking Bearer token
│   ├── auth.routes.ts             # /auth routes
│   └── auth.types.ts              # Token & Request payload definitions
│
├── attempts/                      # Attempt Lifecycle & Management
│   ├── attemptStateMachine.ts     # State machine transition rules & audit logging
│   ├── attempts.controller.ts     # Request creation, approvals, question assignment
│   ├── attempts.routes.ts         # /attempts routes
│   └── attempts.schema.ts         # Input validation schemas (Zod)
│
├── grading/                       # Execution Sandbox & Automated Grading
│   ├── judge0Client.ts            # Judge0 API HTTP client (submitCode & waitForSubmissionResult)
│   ├── evaluateResult.ts          # Evaluator: normalizes stdout and checks expectedOutput
│   ├── gradingWorker.ts           # Background worker: executes test cases & computes score
│   ├── grading.controller.ts      # Endpoints: runCode, saveDraft, submitAttempt, getReport
│   └── grading.routes.ts          # /grading routes
│
├── decisions/                     # Manager Final Decision (Placeholder)
│   ├── decisions.routes.ts        
│   └── decisions.service.ts       
│
└── lib/                           # Shared Utilities
    ├── prisma.ts                  # Prisma Client instance
    ├── env.ts                     # Environment variable validation
    └── constants.ts               # Timing constants (exam window durations)
```

---

##  API Reference

All protected endpoints require an `Authorization: Bearer <token>` header obtained from `/auth/login`.

### 1. Authentication
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Public | Register a new Employee. Body: `{ employeeName }` |
| `POST` | `/auth/login` | Public | Login with Employee ID. Body: `{ employeeId }` |

### 2. Attempts Management
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/attempts` | Employee | Request an exam. Body: `{ skillId, proficiencyLevel }` |
| `GET` | `/attempts/employee` | Employee | List all exam attempts requested by the current employee. |
| `GET` | `/attempts/manager` | Manager | List pending exam requests from reporting team members. |
| `GET` | `/attempts/:attemptId/attempt` | Protected | View details of a specific attempt. |
| `POST` | `/attempts/:attemptId/approve` | Manager | Approve request and trigger exam question generation. |

### 3. Code Execution & Grading
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/grading/:attemptId/questions/:questionId/run` | Employee | Run code interactively with sample `stdin` on Judge0. |
| `PUT` | `/grading/:attemptId/questions/:questionId/draft` | Employee | Autosave candidate code as a draft (`isDraft: true`). |
| `POST` | `/grading/:attemptId/submit` | Employee | Submit attempt, convert drafts to final, and queue grading. |
| `GET` | `/grading/:attemptId/report` | Protected | View the grading report, score, and completion timestamp. |

---

##  Database Model (PostgreSQL + Prisma)

* **`Employee`**: Candidate or manager account with self-referential `managedById` relation.
* **`Skill`**: Skills available for verification (e.g. Node.js, React, Python).
* **`Question`**: Question bank items categorized by skill and proficiency level (`SCRATCH` or `DEBUG`).
* **`TestCase`**: Test inputs, expected outputs, and visibility flags (`VISIBLE`, `HIDDEN_A`, `HIDDEN_B`).
* **`Attempt`**: Candidate exam instance tracking status, timing (`startTime`, `deadline`), and manager decision.
* **`AttemptQuestion`**: Questions assigned to a specific attempt with display position.
* **`Submission`**: Draft and final code submissions for an attempt question.
* **`GradingReport`**: Overall grading outcome, including `totalTestCases`, `passedTestCases`, and final `score`.
* **`AttemptEvent`**: Immutable append-only audit trail logging state transitions and integrity events.

---

##  Getting Started

### Prerequisites
* **Node.js**: v20 or higher
* **PostgreSQL**: Running instance
* **Judge0 API**: Self-hosted or hosted sandbox instance

### 1. Environment Setup
Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/attest_db?schema=public"
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRY="3600"

# Judge0 configuration
JUDGE0_BASE_URL="http://localhost:2358"
JUDGE0_LANGUAGE_ID="71" # e.g. 71 for Python (3.8.1), 63 for JavaScript (Node.js)
```

### 2. Install Dependencies & Setup Database
```bash
npm install
npx prisma migrate dev
npm run seed
```

### 3. Start the Server
```bash
npx tsx src/app.ts
```
The server runs by default on `http://localhost:3000`.

### 4. Run Tests
```bash
npm test
```
Runs the Vitest test suite covering the state machine, Judge0 client, result evaluator, and grading worker.
