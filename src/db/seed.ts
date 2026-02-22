import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  approvals,
  codexRuns,
  projectMembers,
  projects,
  taskRevisions,
  tasks,
  users,
} from "./schema.js";

type SeedProject = {
  name: string;
  description: string;
  ownerEmail: string;
  memberEmails: string[];
};

const TASK_TOPICS = [
  "Authentication Hardening",
  "Onboarding UX Refresh",
  "API Error Mapping",
  "Deployment Rollback Plan",
  "Rate Limit Tuning",
  "Search Index Backfill",
  "Background Job Retry Rules",
  "Metrics Dashboard Pass",
  "Permission Model Audit",
  "Notification Routing",
] as const;

type TaskTopic = (typeof TASK_TOPICS)[number];

type PlannedTask = {
  key: string;
  seedKey: string;
  projectId: string;
  projectName: string;
  number: number;
  topic: TaskTopic;
  title: string;
  status: "draft" | "in_review" | "approved" | "building" | "done";
  authorId: string;
  currentRevision: number;
  body: string;
};

type RevisionSeed = {
  body: string;
  comment: string | null;
};

type CodeSampleLanguage = "ts" | "sql" | "bash" | "json";

type BuildContext = {
  revision: number;
  seedKey: string;
  topic: TaskTopic;
  taskNumber: number;
};

type CodeSample = {
  title: string;
  language: CodeSampleLanguage;
  render: (ctx: BuildContext) => string;
};

type TopicBlueprint = {
  domain: string;
  components: string[];
  contextStatements: string[];
  constraints: string[];
  goals: string[];
  nonGoals: string[];
  inScope: string[];
  outOfScope: string[];
  approachOptions: string[];
  implementationTracks: string[];
  dataChanges: string[];
  rolloutSteps: string[];
  observabilitySignals: string[];
  testScenarios: string[];
  risks: { risk: string; mitigation: string }[];
  acceptanceCriteria: string[];
  reviewFindings: string[];
  codeSamples: CodeSample[];
};

const REQUIRED_PLAN_HEADERS = [
  "## Summary",
  "## Problem & Context",
  "## Goals",
  "## Non-Goals",
  "## Scope",
  "## Proposed Approach",
  "## Implementation Plan",
  "## Data/State Changes",
  "## Rollout Plan",
  "## Observability",
  "## Test Plan",
  "## Risks & Mitigations",
  "## Acceptance Criteria",
] as const;

const REQUIRED_COMMENT_FIELDS = [
  "Concern:",
  "Rationale:",
  "Requested change:",
  "Acceptance checks:",
] as const;

const MIN_PLAN_CHARACTERS = 1800;

function hashValue(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickOne<T>(items: readonly T[], seedKey: string, salt: string): T {
  return items[hashValue(`${seedKey}:${salt}`) % items.length]!;
}

function pickMany<T>(
  items: readonly T[],
  count: number,
  seedKey: string,
  salt: string,
): T[] {
  if (count <= 0) return [];
  return items
    .map((item, index) => ({
      item,
      score: hashValue(`${seedKey}:${salt}:${index}`),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.min(count, items.length))
    .map((entry) => entry.item);
}

function seededNumber(
  seedKey: string,
  salt: string,
  min: number,
  max: number,
): number {
  const span = max - min + 1;
  return min + (hashValue(`${seedKey}:${salt}`) % span);
}

function shortToken(seedKey: string, salt: string): string {
  return hashValue(`${seedKey}:${salt}`).toString(36).slice(0, 6);
}

function titleCase(input: string): string {
  if (!input) return input;
  return input[0]!.toUpperCase() + input.slice(1);
}

function taskStatusFor(number: number): PlannedTask["status"] {
  const mod = number % 10;
  if (mod <= 2) return "draft";
  if (mod <= 4) return "in_review";
  if (mod <= 6) return "approved";
  if (mod <= 8) return "building";
  return "done";
}

function revisionProfile(revision: number): {
  summaryFocus: string;
  implementationFocus: string;
  rolloutFocus: string;
  validationFocus: string;
} {
  switch (revision) {
    case 1:
      return {
        summaryFocus:
          "This draft establishes a complete implementation backbone with clear owners and bounded scope.",
        implementationFocus:
          "define interfaces and primary migration boundaries",
        rolloutFocus:
          "prepare a safe initial flag path and minimal blast radius",
        validationFocus:
          "prove baseline behavior with deterministic integration checks",
      };
    case 2:
      return {
        summaryFocus:
          "This revision incorporates first-pass review feedback to tighten scope boundaries and dependency sequencing.",
        implementationFocus: "make ownership and handoff contracts explicit",
        rolloutFocus:
          "add stronger release checkpoints before external exposure",
        validationFocus:
          "expand regressions around edge transitions and authorization paths",
      };
    case 3:
      return {
        summaryFocus:
          "This revision hardens rollout and observability details so production failures are detected and contained quickly.",
        implementationFocus: "codify failure handling and rollback contracts",
        rolloutFocus:
          "stage rollout by risk tier with explicit stop conditions",
        validationFocus:
          "enforce scenario coverage for failure and recovery paths",
      };
    default:
      return {
        summaryFocus:
          "This revision finalizes launch gates with explicit go/no-go criteria and operational sign-off requirements.",
        implementationFocus:
          "lock launch contracts, ownership, and completion criteria",
        rolloutFocus:
          "run a gated release with documented rollback and communication playbooks",
        validationFocus:
          "require sign-off evidence from load, reliability, and correctness checks",
      };
  }
}

const TOPIC_BLUEPRINTS: Record<TaskTopic, TopicBlueprint> = {
  "Authentication Hardening": {
    domain: "session trust and identity boundaries",
    components: [
      "auth middleware",
      "token service",
      "risk engine",
      "session store",
    ],
    contextStatements: [
      "Recent incidents showed that stale sessions remain valid longer than expected when risk posture changes mid-request.",
      "The authentication stack currently mixes synchronous checks and deferred revocation, making outcomes inconsistent under load.",
      "Credential rotation and device trust updates are applied asymmetrically across API and websocket surfaces.",
    ],
    constraints: [
      "All user-facing APIs must keep p95 auth latency below 80ms.",
      "Session revocation must propagate to every edge worker within 30 seconds.",
      "MFA prompts cannot exceed one challenge per session unless risk score crosses threshold.",
      "Token schema changes must remain backward compatible for one deploy window.",
    ],
    goals: [
      "Eliminate inconsistent authorization outcomes during token refresh races.",
      "Improve security posture without increasing friction for low-risk sessions.",
      "Make revocation behavior deterministic across all execution paths.",
      "Publish clear ownership for auth incidents and rollback decisions.",
    ],
    nonGoals: [
      "Replacing the identity provider.",
      "Redesigning the login user interface.",
      "Introducing new billing or plan gates.",
    ],
    inScope: [
      "Risk-scored session verification pipeline.",
      "Revocation event fanout and edge cache invalidation.",
      "MFA escalation rules for high-risk transitions.",
      "Auth-specific dashboards and alert routing.",
    ],
    outOfScope: [
      "Passwordless onboarding experiments.",
      "Cross-organization role model redesign.",
      "Global identity federation migration.",
    ],
    approachOptions: [
      "Introduce a single auth decision object passed through middleware and downstream services.",
      "Apply write-through revocation updates with strict TTL invalidation for session caches.",
      "Gate high-risk operations behind an adaptive challenge flow with explicit timeout behavior.",
      "Add structured error categories for auth denials to support triage and replay.",
    ],
    implementationTracks: [
      "Define new token claims contract and migration adapters.",
      "Refactor middleware chain to consume a shared decision context.",
      "Implement replay-safe revocation broadcaster for edge workers.",
      "Add incident runbook references into alert payloads.",
    ],
    dataChanges: [
      "Add `session_risk_level` and `session_policy_version` fields to session metadata.",
      "Persist `revoked_at` and revocation source for audit trails.",
      "Store challenge outcomes with normalized denial reasons.",
    ],
    rolloutSteps: [
      "Enable strict checks for internal team accounts first.",
      "Gradually expand by tenant cohort with live denial rate monitoring.",
      "Require security on-call acknowledgement before full rollout.",
      "Freeze rollout automatically if denial spikes exceed configured guardrail.",
    ],
    observabilitySignals: [
      "Auth denial rate by reason and risk level.",
      "Session revocation propagation lag.",
      "Challenge completion and abandonment ratio.",
      "Edge cache stale-read count for revoked sessions.",
    ],
    testScenarios: [
      "Revocation race between concurrent API requests.",
      "Token refresh during privilege downgrade.",
      "Adaptive challenge fallback on provider timeout.",
      "Edge worker cold start with stale auth cache.",
      "Bulk revocation load test across multiple regions.",
    ],
    risks: [
      {
        risk: "False-positive risk escalation could increase unnecessary MFA prompts.",
        mitigation:
          "Require two independent risk signals before challenge escalation and monitor abandonment deltas.",
      },
      {
        risk: "Revocation fanout failure might leave privileged sessions active.",
        mitigation:
          "Add dead-letter replay with pager alerts when propagation SLA is breached.",
      },
      {
        risk: "Schema drift during token migration can break legacy consumers.",
        mitigation:
          "Ship dual-read adapters and enforce compatibility checks in CI.",
      },
    ],
    acceptanceCriteria: [
      "Revocation propagation p99 is below 30 seconds.",
      "MFA completion remains within 2% of current baseline for low-risk users.",
      "Auth denial errors are fully categorized and linked to runbook actions.",
      "Security and platform teams sign off on rollback rehearsal logs.",
    ],
    reviewFindings: [
      "Revocation SLA is not enforced in rollout guardrails",
      "MFA escalation thresholds are underspecified",
      "Fallback behavior for challenge provider outages is missing",
      "Audit logging fields need tighter contract definitions",
    ],
    codeSamples: [
      {
        title: "Adaptive session verification middleware",
        language: "ts",
        render: ({ revision, seedKey }) => {
          const strictness =
            seededNumber(seedKey, "strictness", 55, 78) + revision * 3;
          const ttl =
            seededNumber(seedKey, "ttl", 20, 45) - Math.min(revision, 3);
          return [
            'import { z } from "zod";',
            "",
            "const SessionInput = z.object({",
            "  userId: z.string().uuid(),",
            "  sessionId: z.string().uuid(),",
            "  riskScore: z.number().min(0).max(100),",
            "});",
            "",
            "export async function verifySession(raw: unknown) {",
            "  const input = SessionInput.parse(raw);",
            `  const challengeThreshold = ${strictness};`,
            `  const cacheTtlSeconds = ${Math.max(ttl, 10)};`,
            "  const shouldChallenge = input.riskScore >= challengeThreshold;",
            "",
            "  const decision = {",
            "    allow: !shouldChallenge,",
            "    requireChallenge: shouldChallenge,",
            `    policyVersion: \"auth-v${revision}\",`,
            "    cacheTtlSeconds,",
            "  };",
            "",
            "  return decision;",
            "}",
          ].join("\n");
        },
      },
      {
        title: "Risk policy snapshot",
        language: "json",
        render: ({ revision, seedKey }) => {
          const propagationSla = seededNumber(seedKey, "sla", 20, 35);
          return [
            "{",
            `  \"policyVersion\": \"auth-v${revision}\",`,
            `  \"revocationPropagationSlaSeconds\": ${propagationSla},`,
            '  "challengeRules": {',
            '    "highRiskAction": true,',
            `    \"stepUpThreshold\": ${65 + revision * 2}`,
            "  }",
            "}",
          ].join("\n");
        },
      },
    ],
  },
  "Onboarding UX Refresh": {
    domain: "activation funnel clarity and first-session completion",
    components: [
      "stepper UI",
      "onboarding state store",
      "template picker",
      "analytics events",
    ],
    contextStatements: [
      "Drop-off is concentrated between workspace setup and first actionable task creation.",
      "Onboarding messaging currently diverges between product surfaces and causes expectation mismatch.",
      "New users receive configuration prompts before understanding value, lowering completion rates.",
    ],
    constraints: [
      "Onboarding completion flow must remain under 90 seconds for median users.",
      "Copy updates require localization-ready key support.",
      "No additional backend round-trips can be added to first render path.",
      "Instrumentation events must preserve existing dashboard compatibility.",
    ],
    goals: [
      "Increase first-session activation completion with clearer progression.",
      "Reduce cognitive overhead by sequencing choices based on user intent.",
      "Align event taxonomy with growth analytics dashboards.",
      "Improve confidence by giving immediate preview of value.",
    ],
    nonGoals: [
      "Rewriting the design system.",
      "Changing account creation requirements.",
      "Launching net-new enterprise onboarding tracks.",
    ],
    inScope: [
      "Step order re-sequencing and progressive disclosure.",
      "Inline examples for first task creation.",
      "Event naming cleanup and instrumentation hardening.",
      "Guided defaults for workspace personalization.",
    ],
    outOfScope: [
      "Billing setup redesign.",
      "Mobile-native onboarding flow.",
      "Live concierge onboarding tooling.",
    ],
    approachOptions: [
      "Use intent-first branching to reduce irrelevant decisions in early steps.",
      "Introduce delayed advanced settings behind explicit reveal controls.",
      "Surface concrete examples before requesting configuration input.",
      "Emit consolidated onboarding state snapshots after each step.",
    ],
    implementationTracks: [
      "Refactor onboarding step contracts and transitions.",
      "Add deterministic event payload versioning.",
      "Implement experiment-safe copy and layout toggles.",
      "Ship analytics verification scripts for activation funnel.",
    ],
    dataChanges: [
      "Add `onboarding_path` and `onboarding_step_index` fields to analytics events.",
      "Track `first_value_moment_at` as nullable timestamp.",
      "Persist selected starter template for post-onboarding recommendations.",
    ],
    rolloutSteps: [
      "Launch for internal dogfood cohort first.",
      "Enable for new free workspaces in 10% increments.",
      "Compare completion and skip patterns against control cohort.",
      "Promote to full rollout after stable activation delta over seven days.",
    ],
    observabilitySignals: [
      "Step-by-step completion conversion.",
      "Time-to-first-task and time-to-first-share.",
      "Onboarding abandonment reason distribution.",
      "Client-side rendering stalls during onboarding sequence.",
    ],
    testScenarios: [
      "Resuming onboarding from saved draft state.",
      "Switching intent path mid-flow.",
      "Offline/online transition during onboarding step submit.",
      "Localization expansion for long-form copy strings.",
      "Experiment flag rollback with in-flight sessions.",
    ],
    risks: [
      {
        risk: "Over-personalization can fragment support playbooks.",
        mitigation: "Limit path variants and keep event taxonomy normalized.",
      },
      {
        risk: "Analytics drift can invalidate activation reporting.",
        mitigation: "Use versioned payload schemas and compare shadow metrics.",
      },
      {
        risk: "UI sequencing changes could regress accessibility flows.",
        mitigation:
          "Run keyboard and screen-reader smoke checks per step variant.",
      },
    ],
    acceptanceCriteria: [
      "Activation completion improves by at least 8% over baseline.",
      "Time-to-first-task decreases without increasing error rates.",
      "Instrumentation parity is confirmed for legacy and refreshed flows.",
      "Support team validates troubleshooting docs for new path logic.",
    ],
    reviewFindings: [
      "Step-level ownership and rollback path are unclear",
      "Experiment event schema does not include path version",
      "Accessibility checks are not explicitly gated",
      "Abandonment instrumentation lacks actionable granularity",
    ],
    codeSamples: [
      {
        title: "Onboarding path resolver",
        language: "ts",
        render: ({ revision, seedKey }) => {
          const maxStepTime = seededNumber(seedKey, "max-step", 15, 28);
          return [
            'type Intent = "ship_fast" | "integrate_tools" | "learn";',
            "",
            "export function buildOnboardingPath(intent: Intent) {",
            '  const common = ["welcome", "value_preview"];',
            "  const branch =",
            '    intent === "ship_fast"',
            '      ? ["create_task", "invite_collaborator"]',
            '      : intent === "integrate_tools"',
            '      ? ["connect_source", "create_task"]',
            '      : ["guided_template", "create_task"];',
            "",
            "  return {",
            '    steps: [...common, ...branch, "wrap_up"],',
            `    maxStepTimeSeconds: ${maxStepTime},`,
            `    schemaVersion: \"onboarding-v${revision}\",`,
            "  };",
            "}",
          ].join("\n");
        },
      },
      {
        title: "Activation event payload",
        language: "json",
        render: ({ revision, seedKey }) => {
          const cohort = seededNumber(seedKey, "cohort", 1, 10);
          return [
            "{",
            `  \"event\": \"onboarding.step.completed.v${revision}\",`,
            `  \"pathVersion\": \"path-${shortToken(seedKey, "path")}\",`,
            `  \"cohort\": ${cohort},`,
            '  "attributes": {',
            '    "step": "create_task",',
            '    "intent": "ship_fast"',
            "  }",
            "}",
          ].join("\n");
        },
      },
    ],
  },
  "API Error Mapping": {
    domain: "consistent platform-level error semantics",
    components: [
      "API gateway",
      "error mapper",
      "client SDK",
      "incident alerts",
    ],
    contextStatements: [
      "Equivalent failures currently surface with different HTTP statuses and payload shapes across services.",
      "Client retries are over-triggered because transient vs permanent errors are not differentiated consistently.",
      "Support workflows are slowed by opaque error codes that do not map to runbook actions.",
    ],
    constraints: [
      "Existing public error codes must remain supported for one deprecation cycle.",
      "Gateway response size must not grow more than 5%.",
      "Error mapping must remain deterministic under fallback paths.",
      "Runbook references should be attachable without leaking internal details.",
    ],
    goals: [
      "Provide stable and predictable error categories across endpoints.",
      "Improve retry correctness for SDK and integrations.",
      "Reduce support time by attaching actionable metadata.",
      "Expose explicit recoverability signals to clients.",
    ],
    nonGoals: [
      "Changing the transport protocol.",
      "Introducing custom client SDK generation.",
      "Rewriting domain-level validation logic.",
    ],
    inScope: [
      "Canonical platform error schema.",
      "Gateway-level mapping rules with trace context.",
      "Recoverability flags and retry hints.",
      "Runbook link enrichment on server logs.",
    ],
    outOfScope: [
      "Per-language SDK redesign.",
      "Cross-product support portal migration.",
      "Billing-domain error taxonomy refresh.",
    ],
    approachOptions: [
      "Map internal exceptions to canonical codes via a centralized registry.",
      "Attach retry policy hints based on error family and dependency source.",
      "Emit stable machine-readable fields and optional human-readable guidance.",
      "Version the response contract and preserve backward fields during transition.",
    ],
    implementationTracks: [
      "Define canonical error registry and migration matrix.",
      "Integrate mapper at gateway edge with fallback behavior.",
      "Update SDK retry strategy to consume recoverability hints.",
      "Add runbook and trace correlation checks in CI.",
    ],
    dataChanges: [
      "Add `error_family`, `recoverable`, and `runbook_id` fields to error payloads.",
      "Persist mapping overrides for legacy endpoints.",
      "Store mapper version in request telemetry for debugging.",
    ],
    rolloutSteps: [
      "Shadow-map responses in staging and compare to baseline codes.",
      "Enable new contract for internal clients first.",
      "Expose dual payload mode for external clients during migration.",
      "Cut over when mismatch rate and support incidents stay below thresholds.",
    ],
    observabilitySignals: [
      "Mismatch rate between legacy and canonical error mapping.",
      "Retry success ratio after recoverability hints.",
      "Unknown error code occurrences by endpoint.",
      "Support ticket categories tied to error payload parsing.",
    ],
    testScenarios: [
      "Gateway fallback when mapper registry is stale.",
      "Legacy client parsing with dual payload mode.",
      "Transient dependency outage with exponential retry hints.",
      "Validation failures with multilingual user-facing messages.",
      "Trace correlation across async handler boundaries.",
    ],
    risks: [
      {
        risk: "Incorrect recoverability flags may trigger retry storms.",
        mitigation:
          "Gate recoverability defaults behind endpoint-level validation and canary metrics.",
      },
      {
        risk: "Dual mode responses can diverge and confuse consumers.",
        mitigation: "Automate diff checks and freeze rollout on schema drift.",
      },
      {
        risk: "Legacy clients may hard-code status expectations.",
        mitigation: "Retain compatibility shims and publish migration windows.",
      },
    ],
    acceptanceCriteria: [
      "Canonical error mapping coverage reaches 100% of targeted endpoints.",
      "Retry success improves while retry volume remains stable.",
      "Unknown code rate remains below 0.1% after rollout.",
      "Support can route incidents using runbook metadata without manual triage.",
    ],
    reviewFindings: [
      "Recoverability semantics are not fully tied to endpoint ownership",
      "Legacy dual-mode migration lacks explicit sunset checkpoint",
      "Runbook metadata is not validated in CI",
      "Mapper fallback behavior is underspecified",
    ],
    codeSamples: [
      {
        title: "Canonical error mapper",
        language: "ts",
        render: ({ revision, seedKey }) => {
          const retryAfter = seededNumber(seedKey, "retry-after", 1, 8);
          return [
            'type ErrorFamily = "validation" | "dependency" | "auth" | "internal";',
            "",
            "const MAP: Record<ErrorFamily, { status: number; code: string; recoverable: boolean }> = {",
            '  validation: { status: 400, code: "E_INPUT", recoverable: false },',
            '  dependency: { status: 503, code: "E_DEPENDENCY", recoverable: true },',
            '  auth: { status: 401, code: "E_AUTH", recoverable: false },',
            '  internal: { status: 500, code: "E_INTERNAL", recoverable: false },',
            "};",
            "",
            "export function mapError(family: ErrorFamily, traceId: string) {",
            "  const base = MAP[family];",
            "  return {",
            "    ...base,",
            "    traceId,",
            `    mapperVersion: \"errors-v${revision}\",`,
            `    retryAfterSeconds: base.recoverable ? ${retryAfter} : null,`,
            "  };",
            "}",
          ].join("\n");
        },
      },
      {
        title: "Error payload contract sample",
        language: "json",
        render: ({ revision, seedKey }) => {
          return [
            "{",
            `  \"version\": \"errors-v${revision}\",`,
            `  \"runbookId\": \"rbk-${shortToken(seedKey, "runbook")}\",`,
            '  "error": {',
            '    "code": "E_DEPENDENCY",',
            '    "family": "dependency",',
            '    "recoverable": true',
            "  }",
            "}",
          ].join("\n");
        },
      },
    ],
  },
  "Deployment Rollback Plan": {
    domain: "safe deploy execution with rapid rollback",
    components: [
      "release pipeline",
      "health checks",
      "artifact store",
      "on-call playbook",
    ],
    contextStatements: [
      "Recent deploy failures required manual rollback steps that were too slow under customer impact.",
      "Rollback scripts differ across services and introduce operator guesswork during incidents.",
      "Health check signals are not weighted, causing false-positive deploy failures.",
    ],
    constraints: [
      "Rollback initiation must complete in under 3 minutes.",
      "Artifact retention policy must preserve last 5 successful releases.",
      "Deploy verification cannot require privileged shell access.",
      "Release gates must support both automated and human override paths.",
    ],
    goals: [
      "Reduce rollback time-to-stability during failed deploys.",
      "Standardize release and rollback controls across services.",
      "Improve confidence in progressive deployment validation.",
      "Document clear owner actions for incident execution.",
    ],
    nonGoals: [
      "Switching deployment vendor.",
      "Rewriting CI orchestration from scratch.",
      "Introducing multi-region active/active failover.",
    ],
    inScope: [
      "Automated rollback trigger matrix.",
      "Deploy-time health scoring and stop conditions.",
      "Runbook-linked incident logging.",
      "Release metadata capture for traceability.",
    ],
    outOfScope: [
      "Cross-cloud failover automation.",
      "Major infra topology redesign.",
      "Postmortem tooling replacement.",
    ],
    approachOptions: [
      "Gate progressive rollout with weighted health scores and hard stops.",
      "Treat rollback as first-class pipeline command with immutable artifact references.",
      "Record deploy phase outcomes as structured events for audit and replay.",
      "Integrate incident communication templates in rollback execution output.",
    ],
    implementationTracks: [
      "Create deploy state machine with explicit rollback transitions.",
      "Add canary health gate evaluator and confidence thresholds.",
      "Publish runbook links in deployment alerts and logs.",
      "Persist release metadata snapshots for post-incident analysis.",
    ],
    dataChanges: [
      "Store release candidate health scores by phase.",
      "Track rollback trigger cause and actor metadata.",
      "Persist artifact checksum and deployment window IDs.",
    ],
    rolloutSteps: [
      "Validate rollback command in staging with synthetic faults.",
      "Enable automated stop conditions for non-critical services first.",
      "Run incident drills with on-call rotation before production expansion.",
      "Require successful drill evidence prior to full adoption.",
    ],
    observabilitySignals: [
      "Rollback time-to-initiation and time-to-stability.",
      "Health score deltas between deployment phases.",
      "False-positive rollback trigger count.",
      "Pipeline state transition failures by service.",
    ],
    testScenarios: [
      "Canary failure triggered by latency regression.",
      "Failed rollback due to missing artifact integrity.",
      "Operator override during automated stop condition.",
      "Consecutive rollbacks across multiple services.",
      "Deployment resume after transient infrastructure outage.",
    ],
    risks: [
      {
        risk: "Overly sensitive health thresholds can halt healthy deploys.",
        mitigation:
          "Calibrate thresholds on historical baselines and monitor false-positive ratio.",
      },
      {
        risk: "Rollback command drift across services can break consistency.",
        mitigation:
          "Centralize rollback contract and validate via smoke scripts each release.",
      },
      {
        risk: "Incident pressure may bypass required runbook steps.",
        mitigation: "Embed mandatory checklist prompts into override flow.",
      },
    ],
    acceptanceCriteria: [
      "Rollback initiation median is below 2 minutes.",
      "All targeted services emit standardized deploy phase events.",
      "Incident drills pass with documented owner handoffs.",
      "False-positive rollback triggers remain under agreed SLO.",
    ],
    reviewFindings: [
      "Rollback trigger matrix lacks explicit override policy",
      "Release metadata persistence is missing retention constraints",
      "Health gate thresholds are not tied to historical baseline",
      "On-call drill evidence is not part of launch gate",
    ],
    codeSamples: [
      {
        title: "Rollback script skeleton",
        language: "bash",
        render: ({ revision, seedKey }) => {
          const maxMinutes = seededNumber(seedKey, "rollback-min", 2, 4);
          return [
            "#!/usr/bin/env bash",
            "set -euo pipefail",
            "",
            "SERVICE=${1:?service required}",
            "TARGET_RELEASE=${2:?release id required}",
            `MAX_MINUTES=${maxMinutes}`,
            "",
            'echo "[rollback] stopping canary for ${SERVICE}"',
            './scripts/deployctl pause --service "${SERVICE}"',
            './scripts/deployctl rollback --service "${SERVICE}" --release "${TARGET_RELEASE}"',
            './scripts/deployctl verify --service "${SERVICE}" --timeout "${MAX_MINUTES}m"',
            `echo \"rollback complete (policy v${revision})\"`,
          ].join("\n");
        },
      },
      {
        title: "Canary health evaluator",
        language: "ts",
        render: ({ revision, seedKey }) => {
          const threshold = seededNumber(seedKey, "threshold", 60, 82);
          return [
            "type CanarySignals = { errorRate: number; latencyP95: number; saturation: number };",
            "",
            "export function scoreCanary(signals: CanarySignals): number {",
            "  const latencyScore = Math.max(0, 100 - Math.round(signals.latencyP95));",
            "  const errorScore = Math.max(0, 100 - Math.round(signals.errorRate * 150));",
            "  const saturationScore = Math.max(0, 100 - Math.round(signals.saturation * 100));",
            "  return Math.round(latencyScore * 0.4 + errorScore * 0.4 + saturationScore * 0.2);",
            "}",
            "",
            "export function shouldRollback(signals: CanarySignals) {",
            `  const threshold = ${threshold};`,
            "  const score = scoreCanary(signals);",
            `  return { score, rollback: score < threshold, policyVersion: \"deploy-v${revision}\" };`,
            "}",
          ].join("\n");
        },
      },
    ],
  },
  "Rate Limit Tuning": {
    domain: "traffic fairness and abuse resistance",
    components: [
      "rate limiter",
      "request classifier",
      "quota storage",
      "edge cache",
    ],
    contextStatements: [
      "Current limits are too coarse and penalize legitimate bursty workloads.",
      "Abusive traffic patterns bypass some endpoint-level limits due to inconsistent keying.",
      "Quota resets are not aligned across services, creating fairness drift.",
    ],
    constraints: [
      "Limiter decisions must remain under 5ms at p95.",
      "Burst handling should not increase false throttles for paid tiers.",
      "Storage writes from limiter should remain bounded under flash traffic.",
      "Endpoint policy updates must support zero-downtime reload.",
    ],
    goals: [
      "Improve fairness between steady and bursty tenants.",
      "Reduce abusive traffic amplification during spikes.",
      "Make policy changes safer and easier to audit.",
      "Expose limiter outcomes for product and support visibility.",
    ],
    nonGoals: [
      "Per-user pricing model changes.",
      "Global networking stack replacement.",
      "Regional traffic routing redesign.",
    ],
    inScope: [
      "Endpoint-tier aware limiter keying.",
      "Burst budget and refill strategy updates.",
      "Limiter policy versioning and audits.",
      "Throttle reason analytics.",
    ],
    outOfScope: [
      "Customer billing reconciliation.",
      "WAF product migration.",
      "Realtime abuse classifier ML model rollout.",
    ],
    approachOptions: [
      "Apply weighted token buckets by endpoint criticality and tenant tier.",
      "Separate burst budget from sustained throughput caps.",
      "Version limiter policy and attach version to deny responses.",
      "Use deterministic limiter keys across edge and core services.",
    ],
    implementationTracks: [
      "Define endpoint policy matrix and migration mapping.",
      "Implement bucket refill algorithm updates.",
      "Add deny reason telemetry and dashboards.",
      "Ship policy rollout controls with staged overrides.",
    ],
    dataChanges: [
      "Store `policy_version` with each throttle decision.",
      "Persist burst debt counters for short windows.",
      "Track tenant-tier limiter outcomes for tuning loops.",
    ],
    rolloutSteps: [
      "Replay last week traffic in staging with new policy.",
      "Canary high-volume endpoints before global policy switch.",
      "Monitor deny ratio and success latency in each rollout stage.",
      "Freeze rollout on unexpected false throttle increase.",
    ],
    observabilitySignals: [
      "Throttle rate segmented by tier and endpoint.",
      "False throttle reports from support tooling.",
      "Limiter decision latency and storage write pressure.",
      "Burst debt accumulation over time windows.",
    ],
    testScenarios: [
      "Legitimate burst traffic from webhook fan-out.",
      "Distributed abuse with rotating API keys.",
      "Policy reload while requests are in-flight.",
      "Clock skew effects on refill calculations.",
      "Backpressure interaction with downstream service limits.",
    ],
    risks: [
      {
        risk: "Over-tight limits can degrade healthy automation workflows.",
        mitigation:
          "Introduce per-tier burst safety margins and monitor override volume.",
      },
      {
        risk: "Inconsistent limiter keys can create bypass routes.",
        mitigation:
          "Centralize key derivation with shared tests across runtimes.",
      },
      {
        risk: "State write amplification may impact storage reliability.",
        mitigation:
          "Use batched updates and hot-key protection under high churn.",
      },
    ],
    acceptanceCriteria: [
      "Abuse traffic is reduced without harming paid-tier success rates.",
      "Limiter p95 decision latency remains under 5ms.",
      "False throttle rate stays below agreed threshold.",
      "Policy versioning supports quick rollback and audit traceability.",
    ],
    reviewFindings: [
      "Policy matrix lacks endpoint ownership for exceptions",
      "Burst debt metric is not tied to rollback guardrail",
      "Limiter key derivation contract needs stronger tests",
      "Policy reload behavior under load is under-specified",
    ],
    codeSamples: [
      {
        title: "Tier-aware limiter configuration",
        language: "ts",
        render: ({ revision, seedKey }) => {
          const burst = seededNumber(seedKey, "burst", 30, 120);
          const refill = seededNumber(seedKey, "refill", 8, 35);
          return [
            'type Tier = "free" | "pro" | "enterprise";',
            "",
            "const BASE_POLICY: Record<Tier, { burst: number; refillPerSecond: number }> = {",
            `  free: { burst: ${Math.max(10, Math.floor(burst * 0.4))}, refillPerSecond: ${Math.max(3, Math.floor(refill * 0.4))} },`,
            `  pro: { burst: ${Math.max(20, Math.floor(burst * 0.8))}, refillPerSecond: ${Math.max(5, Math.floor(refill * 0.8))} },`,
            `  enterprise: { burst: ${burst}, refillPerSecond: ${refill} },`,
            "};",
            "",
            "export function policyFor(tier: Tier) {",
            '  return { ...BASE_POLICY[tier], policyName: "weighted-token-bucket",',
            `    policyVersion: \"ratelimit-v${revision}\" };`,
            "}",
          ].join("\n");
        },
      },
      {
        title: "Hot-key throttle investigation query",
        language: "sql",
        render: ({ revision, seedKey }) => {
          const limit = seededNumber(seedKey, "limit", 25, 75);
          return [
            "select",
            "  limiter_key,",
            "  count(*) as deny_count,",
            "  max(policy_version) as policy_version",
            "from limiter_decisions",
            "where created_at > now() - interval '15 minutes'",
            "  and decision = 'deny'",
            `  and policy_version = 'ratelimit-v${revision}'`,
            "group by limiter_key",
            "order by deny_count desc",
            `limit ${limit};`,
          ].join("\n");
        },
      },
    ],
  },
  "Search Index Backfill": {
    domain: "index consistency and query freshness",
    components: [
      "backfill worker",
      "source tables",
      "index writer",
      "progress tracker",
    ],
    contextStatements: [
      "Search relevance regressed because historical records are missing newer index fields.",
      "Backfill jobs currently run without granular checkpoints, making restarts expensive.",
      "Index writes can saturate downstream clusters when replaying old records too aggressively.",
    ],
    constraints: [
      "Backfill should not degrade live query p95 by more than 10%.",
      "Jobs must be resumable from deterministic checkpoints.",
      "Index write throughput should respect downstream quota limits.",
      "Data correctness verification must run continuously during backfill.",
    ],
    goals: [
      "Restore index completeness for historical entities.",
      "Run backfill safely without impacting live search.",
      "Improve checkpoint reliability for job restarts.",
      "Provide transparent progress visibility for operators.",
    ],
    nonGoals: [
      "Changing search engine provider.",
      "Redesigning ranking model semantics.",
      "Removing existing query APIs.",
    ],
    inScope: [
      "Chunked record replay with resumable cursoring.",
      "Write throttling controls tied to cluster health.",
      "Consistency validation against source-of-truth tables.",
      "Operational dashboards for progress and failure states.",
    ],
    outOfScope: [
      "Ranking model retraining.",
      "Search UI redesign.",
      "Global sharding strategy changes.",
    ],
    approachOptions: [
      "Use monotonic cursor checkpoints with idempotent writes.",
      "Throttle by observed cluster pressure and error rate.",
      "Verify document parity through rolling sample audits.",
      "Separate replay and verification workers for isolation.",
    ],
    implementationTracks: [
      "Define backfill segmentation and cursor model.",
      "Implement writer throttling and retry controls.",
      "Add parity checker and mismatch alerting.",
      "Document pause/resume operational commands.",
    ],
    dataChanges: [
      "Persist backfill cursor, shard id, and checkpoint timestamp.",
      "Track document parity mismatches with source ids.",
      "Store throughput and retry counters per batch.",
    ],
    rolloutSteps: [
      "Run dry backfill in shadow environment.",
      "Backfill low-volume shards first to validate controls.",
      "Expand to high-volume shards after parity confidence threshold.",
      "Require final mismatch report review before declaring complete.",
    ],
    observabilitySignals: [
      "Backfill throughput and queue lag.",
      "Parity mismatch rate over moving windows.",
      "Index write error categories and retry depth.",
      "Live search latency impact during backfill windows.",
    ],
    testScenarios: [
      "Worker restart from mid-batch checkpoint.",
      "Duplicate replay with idempotent writer enforcement.",
      "Downstream index timeout and retry backoff behavior.",
      "Shard expansion during in-flight backfill.",
      "Parity checker handling soft-deleted records.",
    ],
    risks: [
      {
        risk: "Aggressive replay may degrade live search traffic.",
        mitigation:
          "Apply adaptive throttling tied to latency and error thresholds.",
      },
      {
        risk: "Checkpoint corruption could cause skipped records.",
        mitigation:
          "Use write-ahead checkpoint validation and replay-safe windows.",
      },
      {
        risk: "Parity checks may miss schema-evolution mismatches.",
        mitigation:
          "Include schema version in parity snapshots and enforce migration checks.",
      },
    ],
    acceptanceCriteria: [
      "Backfill reaches 100% targeted record coverage.",
      "Parity mismatch rate remains below 0.2% before completion.",
      "No sustained live search latency regression above agreed threshold.",
      "Pause/resume runbook is validated in operator drills.",
    ],
    reviewFindings: [
      "Checkpoint durability strategy is not explicit enough",
      "Parity sampling plan needs stricter acceptance threshold",
      "Adaptive throttle guardrails are under-defined",
      "Shard sequencing rationale should be documented",
    ],
    codeSamples: [
      {
        title: "Backfill candidate query",
        language: "sql",
        render: ({ revision, seedKey }) => {
          const batchSize = seededNumber(seedKey, "batch", 400, 1200);
          return [
            "select id, updated_at, payload",
            "from documents",
            "where id > $1",
            "  and indexed_version < $2",
            "order by id asc",
            `limit ${batchSize}; -- search-backfill-v${revision}`,
          ].join("\n");
        },
      },
      {
        title: "Resumable replay worker",
        language: "ts",
        render: ({ revision, seedKey }) => {
          const chunk = seededNumber(seedKey, "chunk", 300, 900);
          return [
            "export async function runBackfill(cursor: string | null) {",
            "  let next = cursor;",
            `  const chunkSize = ${chunk};`,
            "",
            "  while (true) {",
            "    const rows = await loadBatch(next, chunkSize);",
            "    if (rows.length === 0) break;",
            "",
            "    await writeToIndex(rows, { idempotencyKey: rows[0]!.id });",
            "    next = rows[rows.length - 1]!.id;",
            `    await saveCheckpoint({ next, workerVersion: \"backfill-v${revision}\" });`,
            "  }",
            "}",
          ].join("\n");
        },
      },
    ],
  },
  "Background Job Retry Rules": {
    domain: "job reliability and retry predictability",
    components: [
      "queue processor",
      "retry policy",
      "dead-letter queue",
      "scheduler",
    ],
    contextStatements: [
      "Job retries currently use static limits that do not reflect failure class severity.",
      "Transient dependency outages produce retry floods and queue starvation.",
      "Dead-letter records often miss metadata needed for targeted replay.",
    ],
    constraints: [
      "Retry policy changes must be backward compatible with existing job payloads.",
      "Queue throughput cannot drop below baseline SLO during rollout.",
      "Dead-letter retention must satisfy audit requirements.",
      "Retry jitter should prevent synchronized retry storms.",
    ],
    goals: [
      "Classify retry behavior by failure category.",
      "Reduce queue starvation during external outages.",
      "Improve dead-letter replay confidence and visibility.",
      "Codify owner response expectations for stuck queues.",
    ],
    nonGoals: [
      "Migrating queue provider.",
      "Rewriting worker runtime language.",
      "Removing all non-idempotent jobs in one milestone.",
    ],
    inScope: [
      "Failure-class aware retry schedules.",
      "Circuit-breaker interaction with retry execution.",
      "Dead-letter enrichment for replay decisions.",
      "Queue health dashboards and alert tuning.",
    ],
    outOfScope: [
      "Long-term archival system overhaul.",
      "Workflow orchestration migration.",
      "Global event schema redesign.",
    ],
    approachOptions: [
      "Assign retry backoff curves by failure class.",
      "Introduce bounded jitter to avoid synchronized retries.",
      "Route unrecoverable failures directly to dead-letter queue with context.",
      "Expose retry budget utilization in queue metrics.",
    ],
    implementationTracks: [
      "Define retry class taxonomy and mapping rules.",
      "Implement policy engine in queue worker.",
      "Add dead-letter enrichment and replay endpoints.",
      "Document incident handling and manual override controls.",
    ],
    dataChanges: [
      "Store retry class and attempt history per job.",
      "Persist dead-letter reason and dependency error fingerprint.",
      "Track replay outcomes by operator and job family.",
    ],
    rolloutSteps: [
      "Apply new policy in observe-only mode first.",
      "Enable class-based retries for low-risk job families.",
      "Expand rollout after queue lag and drop metrics stabilize.",
      "Lock policy with incident response sign-off.",
    ],
    observabilitySignals: [
      "Retry attempt distribution by failure class.",
      "Queue lag and worker saturation during outage windows.",
      "Dead-letter growth and replay success rate.",
      "Circuit-breaker open duration and downstream recovery correlation.",
    ],
    testScenarios: [
      "Transient timeout with eventual dependency recovery.",
      "Permanent validation failure routed to dead-letter queue.",
      "Retry storm simulation with jitter enabled.",
      "Manual replay of dead-letter batches.",
      "Policy upgrade with in-flight jobs.",
    ],
    risks: [
      {
        risk: "Misclassified errors may delay legitimate retries.",
        mitigation:
          "Keep class overrides and monitor class-specific success rates.",
      },
      {
        risk: "Retry jitter misconfiguration can still produce synchronized spikes.",
        mitigation:
          "Bound jitter windows and validate distribution in load tests.",
      },
      {
        risk: "Dead-letter growth can hide systemic failures.",
        mitigation: "Add growth-based paging and explicit replay ownership.",
      },
    ],
    acceptanceCriteria: [
      "Queue lag during dependency incidents remains within defined SLO.",
      "Retry success ratio improves for transient failure classes.",
      "Dead-letter replay success exceeds baseline by agreed margin.",
      "On-call runbook includes class-specific response guidance.",
    ],
    reviewFindings: [
      "Retry class mapping does not include owner escalation",
      "Dead-letter enrichment lacks correlation fields",
      "Observe-only rollout criteria are not explicit",
      "Replay permissions and safeguards need tighter definition",
    ],
    codeSamples: [
      {
        title: "Class-based retry policy",
        language: "ts",
        render: ({ revision, seedKey }) => {
          const baseDelay = seededNumber(seedKey, "delay", 3, 15);
          return [
            'type RetryClass = "transient" | "dependency" | "permanent";',
            "",
            "const RETRY_POLICY: Record<RetryClass, { maxAttempts: number; baseDelaySeconds: number }> = {",
            `  transient: { maxAttempts: ${3 + revision}, baseDelaySeconds: ${baseDelay} },`,
            `  dependency: { maxAttempts: ${5 + revision}, baseDelaySeconds: ${baseDelay + 2} },`,
            "  permanent: { maxAttempts: 1, baseDelaySeconds: 0 },",
            "};",
            "",
            "export function nextRetryDelay(kind: RetryClass, attempt: number) {",
            "  const config = RETRY_POLICY[kind];",
            "  if (attempt >= config.maxAttempts) return null;",
            "  const exponential = config.baseDelaySeconds * Math.pow(2, attempt);",
            "  return Math.min(exponential, 300);",
            "}",
          ].join("\n");
        },
      },
      {
        title: "Retry policy registry",
        language: "json",
        render: ({ revision, seedKey }) => {
          return [
            "{",
            `  \"version\": \"retry-v${revision}\",`,
            `  \"overrideWindow\": \"${seededNumber(seedKey, "window", 30, 90)}m\",`,
            '  "classes": ["transient", "dependency", "permanent"],',
            '  "deadLetterEscalation": true',
            "}",
          ].join("\n");
        },
      },
    ],
  },
  "Metrics Dashboard Pass": {
    domain: "operational signal quality and dashboard reliability",
    components: [
      "metrics pipeline",
      "dashboard widgets",
      "alert rules",
      "data warehouse",
    ],
    contextStatements: [
      "Dashboards mix inconsistent aggregation windows, making trend interpretation unreliable.",
      "Alert thresholds are not tied directly to dashboard panels used by on-call engineers.",
      "Metric naming drift has created duplicate panels with conflicting semantics.",
    ],
    constraints: [
      "Dashboard refresh must stay under current render budget.",
      "Metric renames must not break existing alerts.",
      "Historical comparisons require backfilled aliases for renamed metrics.",
      "Panel changes need deterministic ownership and review trails.",
    ],
    goals: [
      "Align dashboard panels with actionable on-call questions.",
      "Normalize metric names and windows across product areas.",
      "Reduce alert noise through threshold and panel consistency.",
      "Improve confidence in incident triage data.",
    ],
    nonGoals: [
      "Replacing the metrics backend.",
      "Redesigning every dashboard visual style.",
      "Retiring all legacy panels in one release.",
    ],
    inScope: [
      "Panel normalization and ownership mapping.",
      "Metric aliasing strategy for renamed signals.",
      "Alert-to-panel linkage and runbook references.",
      "Data freshness checks in dashboard build pipeline.",
    ],
    outOfScope: [
      "SLO policy redesign across teams.",
      "Analytics product roadmap changes.",
      "Long-term warehouse schema rearchitecture.",
    ],
    approachOptions: [
      "Standardize panel windows by signal type and incident use case.",
      "Annotate panels with metric ownership and runbook URL.",
      "Publish metric alias registry for deprecations and migrations.",
      "Use panel lint checks to prevent drift before merge.",
    ],
    implementationTracks: [
      "Audit existing panels and identify duplicates.",
      "Apply naming and window normalization.",
      "Wire alerts to canonical dashboard components.",
      "Add build-time dashboard linting.",
    ],
    dataChanges: [
      "Store panel ownership metadata and review timestamp.",
      "Persist metric alias mappings with sunset dates.",
      "Track dashboard freshness lag per data source.",
    ],
    rolloutSteps: [
      "Ship normalized dashboards for internal SRE first.",
      "Enable alias-aware panels for one product area at a time.",
      "Monitor alert noise and incident response quality after cutover.",
      "Retire duplicate panels only after two stable release cycles.",
    ],
    observabilitySignals: [
      "Dashboard data freshness lag.",
      "Alert noise ratio and acknowledgement times.",
      "Panel render latency and timeout count.",
      "Metric alias fallback usage over time.",
    ],
    testScenarios: [
      "Panel rendering with delayed data source.",
      "Alert firing against aliased metric names.",
      "Dashboard load under concurrent user access.",
      "Runbook link validation in panel metadata.",
      "Legacy panel deprecation with rollback.",
    ],
    risks: [
      {
        risk: "Metric alias gaps can break historical trend continuity.",
        mitigation:
          "Backfill alias mapping and block deprecations without parity checks.",
      },
      {
        risk: "Panel normalization may hide team-specific context.",
        mitigation:
          "Preserve local overlays while keeping canonical base panels.",
      },
      {
        risk: "Alert linkage mistakes can degrade incident response.",
        mitigation: "Require alert-panel validation tests before rollout.",
      },
    ],
    acceptanceCriteria: [
      "Canonical dashboard coverage reaches all targeted services.",
      "Alert noise ratio decreases without increasing incident miss rate.",
      "Panel ownership metadata is complete and current.",
      "Data freshness and render SLOs remain within thresholds.",
    ],
    reviewFindings: [
      "Panel ownership metadata is missing escalation coverage",
      "Alias deprecation timeline does not include rollback trigger",
      "Alert-to-panel mapping validation needs CI enforcement",
      "Freshness lag thresholds are not tied to severity bands",
    ],
    codeSamples: [
      {
        title: "Dashboard latency panel query",
        language: "sql",
        render: ({ revision }) => {
          return [
            "select",
            "  date_trunc('minute', ts) as bucket,",
            "  percentile_cont(0.95) within group (order by latency_ms) as p95_latency_ms,",
            "  count(*) filter (where status = 'error') as errors",
            "from request_metrics",
            "where ts > now() - interval '2 hours'",
            `  and dashboard_version = 'metrics-v${revision}'`,
            "group by bucket",
            "order by bucket;",
          ].join("\n");
        },
      },
      {
        title: "Panel definition fragment",
        language: "ts",
        render: ({ revision, seedKey }) => {
          const refresh = seededNumber(seedKey, "refresh", 15, 45);
          return [
            "export const latencyPanel = {",
            '  id: "svc-latency-p95",',
            '  title: "Service latency p95",',
            '  runbook: "/runbooks/latency-triage",',
            `  refreshSeconds: ${refresh},`,
            `  dashboardVersion: \"metrics-v${revision}\",`,
            '  owner: "platform-observability",',
            "};",
          ].join("\n");
        },
      },
    ],
  },
  "Permission Model Audit": {
    domain: "authorization correctness and least privilege",
    components: [
      "permission resolver",
      "role bindings",
      "policy store",
      "audit logs",
    ],
    contextStatements: [
      "Role inheritance rules are not consistently enforced across admin and runtime surfaces.",
      "Permission checks in asynchronous jobs diverge from request-time checks.",
      "Audit visibility is limited for transient privilege escalations.",
    ],
    constraints: [
      "Permission checks must not increase request p95 by more than 10ms.",
      "Role migration must support staged rollout by workspace.",
      "Audit records need actor and source context for each decision.",
      "Policy updates require reproducible diffs for compliance review.",
    ],
    goals: [
      "Close privilege gaps and enforce least-privilege defaults.",
      "Unify permission evaluation across execution contexts.",
      "Improve auditability of policy changes and access decisions.",
      "Make policy rollback fast and deterministic.",
    ],
    nonGoals: [
      "Introducing attribute-based access control platform-wide.",
      "Migrating identity providers.",
      "Rewriting all policy DSLs this cycle.",
    ],
    inScope: [
      "Permission matrix verification and normalization.",
      "Async job permission parity checks.",
      "Role binding audit views and alerts.",
      "Policy diff tooling and rollback commands.",
    ],
    outOfScope: [
      "Organization billing role redesign.",
      "Cross-product SSO migration.",
      "Enterprise entitlement revamp.",
    ],
    approachOptions: [
      "Centralize permission evaluation with shared policy resolver.",
      "Generate policy snapshots for deploy-time diff checks.",
      "Attach actor, scope, and source metadata to every decision log.",
      "Run periodic least-privilege audits against effective permissions.",
    ],
    implementationTracks: [
      "Model canonical permission matrix and role hierarchy.",
      "Backfill policy snapshots for baseline comparison.",
      "Integrate shared resolver in async and sync paths.",
      "Publish audit query set and escalation workflow.",
    ],
    dataChanges: [
      "Add `effective_scope` and `decision_source` fields to auth logs.",
      "Persist role binding snapshot hash per deploy.",
      "Track policy override expiration timestamps.",
    ],
    rolloutSteps: [
      "Enable parity checks in observe-only mode.",
      "Roll out shared resolver to low-risk services first.",
      "Require compliance review for policy diff exceptions.",
      "Expand after two clean audit cycles.",
    ],
    observabilitySignals: [
      "Permission deny anomalies by role and endpoint.",
      "Policy diff exception count per release.",
      "Async/sync parity mismatch detections.",
      "Least-privilege audit remediation backlog.",
    ],
    testScenarios: [
      "Role downgrade propagation during active sessions.",
      "Async job execution with stale role cache.",
      "Policy rollback after unintended permission grant.",
      "Cross-tenant access attempt with shared resource IDs.",
      "Audit export integrity for compliance reporting.",
    ],
    risks: [
      {
        risk: "Over-correction can remove permissions needed for core workflows.",
        mitigation:
          "Run observe-only mode and require owner approvals before enforcement.",
      },
      {
        risk: "Policy snapshot drift can hide unauthorized changes.",
        mitigation: "Sign snapshots and verify hashes at deploy boundaries.",
      },
      {
        risk: "Async parity checks may lag and produce stale alerts.",
        mitigation:
          "Include freshness metadata and alert suppression controls.",
      },
    ],
    acceptanceCriteria: [
      "No unresolved high-risk privilege gaps remain in audited scope.",
      "Shared resolver is active across all targeted paths.",
      "Policy diff exceptions are reviewed and traceable.",
      "Audit logs satisfy compliance field requirements.",
    ],
    reviewFindings: [
      "Policy snapshot validation does not define signature checks",
      "Least-privilege remediation workflow lacks owner SLAs",
      "Async parity mismatch triage path is unclear",
      "Role downgrade rollback criteria should be explicit",
    ],
    codeSamples: [
      {
        title: "Canonical permission check",
        language: "ts",
        render: ({ revision }) => {
          return [
            'type Action = "task:read" | "task:write" | "project:admin";',
            'type Role = "viewer" | "editor" | "admin";',
            "",
            "const MATRIX: Record<Role, Action[]> = {",
            '  viewer: ["task:read"],',
            '  editor: ["task:read", "task:write"],',
            '  admin: ["task:read", "task:write", "project:admin"],',
            "};",
            "",
            "export function can(role: Role, action: Action) {",
            `  const policyVersion = \"perm-v${revision}\";`,
            "  return { allowed: MATRIX[role].includes(action), policyVersion };",
            "}",
          ].join("\n");
        },
      },
      {
        title: "Role binding audit query",
        language: "sql",
        render: ({ revision, seedKey }) => {
          return [
            "select",
            "  workspace_id,",
            "  user_id,",
            "  role,",
            "  decision_source,",
            "  updated_at",
            "from permission_audit_log",
            "where updated_at > now() - interval '24 hours'",
            `  and policy_version = 'perm-v${revision}'`,
            `order by updated_at desc limit ${seededNumber(seedKey, "limit", 100, 250)};`,
          ].join("\n");
        },
      },
    ],
  },
  "Notification Routing": {
    domain: "reliable alert delivery across channels",
    components: [
      "routing engine",
      "channel adapters",
      "preference store",
      "dedupe service",
    ],
    contextStatements: [
      "Notifications are occasionally duplicated when retries and channel fallbacks overlap.",
      "Routing rules do not consistently respect user quiet hours and escalation preferences.",
      "Channel-specific failures can silently drop high-priority incidents.",
    ],
    constraints: [
      "Priority notifications must deliver within 60 seconds.",
      "Routing decisions must be auditable by rule and user preference snapshot.",
      "Channel fallback should avoid duplicate sends when primary recovers late.",
      "Preference changes must propagate in near real time.",
    ],
    goals: [
      "Improve high-priority notification delivery reliability.",
      "Reduce duplicate sends during fallback and retries.",
      "Honor user preferences and quiet hours consistently.",
      "Increase traceability of routing decisions for support and ops.",
    ],
    nonGoals: [
      "Replacing all notification vendors.",
      "Building a new user preference center UI.",
      "Adding new channel types this milestone.",
    ],
    inScope: [
      "Priority-aware routing engine updates.",
      "Deduplication key and fallback contract hardening.",
      "Preference snapshot integration in routing decisions.",
      "Delivery status dashboards and failure escalations.",
    ],
    outOfScope: [
      "Marketing campaign orchestration.",
      "Cross-product notification identity unification.",
      "Long-term message archival redesign.",
    ],
    approachOptions: [
      "Compute deterministic dedupe keys for each routing attempt.",
      "Use channel health scoring to prioritize fallback order.",
      "Snapshot user preference state at dispatch time.",
      "Attach routing reason codes to delivery events.",
    ],
    implementationTracks: [
      "Define routing decision contract and dedupe strategy.",
      "Integrate channel health and fallback matrix.",
      "Add preference snapshot ingestion and validation.",
      "Build delivery telemetry panels and alert hooks.",
    ],
    dataChanges: [
      "Store routing reason and fallback chain in delivery logs.",
      "Persist dedupe key and retry correlation IDs.",
      "Track preference snapshot version used at send time.",
    ],
    rolloutSteps: [
      "Enable new routing in observe-only mode for low-priority events.",
      "Roll out high-priority path once duplicate rate stabilizes.",
      "Expand channel fallback matrix by incident severity.",
      "Finalize with on-call validation drills.",
    ],
    observabilitySignals: [
      "Delivery latency by priority and channel.",
      "Duplicate send rate by fallback path.",
      "Preference mismatch incidents.",
      "Channel adapter failure rates and recovery times.",
    ],
    testScenarios: [
      "Primary channel outage with fallback recovery.",
      "Preference update during in-flight notification dispatch.",
      "Duplicate detection under retry concurrency.",
      "Quiet-hour suppression for high and low priority events.",
      "Adapter timeout with partial acknowledgement.",
    ],
    risks: [
      {
        risk: "Fallback logic may increase duplicate sends under race conditions.",
        mitigation:
          "Enforce dedupe key checks at adapter boundary and post-send reconciliation.",
      },
      {
        risk: "Preference snapshots can go stale during rapid updates.",
        mitigation:
          "Use versioned snapshots with freshness validation before dispatch.",
      },
      {
        risk: "High-priority latency could regress with additional checks.",
        mitigation:
          "Short-circuit critical paths with precomputed routing plans.",
      },
    ],
    acceptanceCriteria: [
      "High-priority notifications meet latency SLA.",
      "Duplicate send rate decreases below baseline target.",
      "Preference mismatch incidents are measurable and below threshold.",
      "Routing decision logs are complete and auditable.",
    ],
    reviewFindings: [
      "Dedupe guarantees are not enforced across fallback adapters",
      "Preference snapshot freshness check lacks explicit threshold",
      "High-priority SLA rollback trigger is not specified",
      "Routing reason taxonomy should be versioned",
    ],
    codeSamples: [
      {
        title: "Priority-aware notification router",
        language: "ts",
        render: ({ revision, seedKey }) => {
          const timeout = seededNumber(seedKey, "timeout", 8, 25);
          return [
            'type Priority = "low" | "medium" | "high";',
            'type Channel = "email" | "slack" | "sms";',
            "",
            "export function route(priority: Priority): Channel[] {",
            '  if (priority === "high") return ["sms", "slack", "email"];',
            '  if (priority === "medium") return ["slack", "email"];',
            '  return ["email"];',
            "}",
            "",
            "export const routingPolicy = {",
            `  timeoutSeconds: ${timeout},`,
            `  version: \"notify-v${revision}\",`,
            "  dedupeEnabled: true,",
            "};",
          ].join("\n");
        },
      },
      {
        title: "Routing policy document",
        language: "json",
        render: ({ revision, seedKey }) => {
          return [
            "{",
            `  \"policyVersion\": \"notify-v${revision}\",`,
            `  \"fallbackWindowSeconds\": ${seededNumber(seedKey, "fallback", 20, 70)},`,
            '  "channels": ["email", "slack", "sms"],',
            '  "dedupeBy": ["workspaceId", "eventId", "priority"]',
            "}",
          ].join("\n");
        },
      },
    ],
  },
};

function buildRevisionBody(input: {
  projectName: string;
  title: string;
  topic: TaskTopic;
  revision: number;
  seedKey: string;
  taskNumber: number;
}): string {
  const blueprint = TOPIC_BLUEPRINTS[input.topic];
  const revProfile = revisionProfile(input.revision);
  const seedRoot = `${input.seedKey}:rev:${input.revision}`;

  const summaryOpeners = [
    "This plan targets a production-grade upgrade with explicit tradeoffs and execution controls.",
    "The proposal prioritizes deterministic delivery and low-regression rollout in a high-change area.",
    "This revision is designed to be implementation-ready with minimal room for interpretation drift.",
    "The spec balances velocity and reliability by tightening sequencing, ownership, and release safety.",
  ];

  const approachLeadIns = [
    "The preferred strategy combines incremental delivery with strict observability gates.",
    "The design emphasizes stable contracts first, then controlled rollout by risk tier.",
    "The implementation intentionally sequences dependency-sensitive work before broad rollout.",
  ];

  const constraints = pickMany(
    blueprint.constraints,
    3,
    seedRoot,
    "constraints",
  );
  const goals = pickMany(blueprint.goals, 3, seedRoot, "goals");
  const nonGoals = pickMany(blueprint.nonGoals, 2, seedRoot, "non-goals");
  const inScope = pickMany(blueprint.inScope, 3, seedRoot, "in-scope");
  const outScope = pickMany(blueprint.outOfScope, 2, seedRoot, "out-scope");
  const approach = pickMany(blueprint.approachOptions, 3, seedRoot, "approach");
  const tracks = pickMany(
    blueprint.implementationTracks,
    4,
    seedRoot,
    "tracks",
  );
  const dataChanges = pickMany(blueprint.dataChanges, 3, seedRoot, "data");
  const rollout = pickMany(blueprint.rolloutSteps, 4, seedRoot, "rollout");
  const observability = pickMany(
    blueprint.observabilitySignals,
    4,
    seedRoot,
    "obs",
  );
  const tests = pickMany(blueprint.testScenarios, 4, seedRoot, "tests");
  const risks = pickMany(blueprint.risks, 3, seedRoot, "risks");
  const acceptance = pickMany(
    blueprint.acceptanceCriteria,
    4,
    seedRoot,
    "acceptance",
  );

  const includeSecondCodeSample =
    hashValue(`${seedRoot}:second-code`) % 3 === 0;
  const codeSampleCount = includeSecondCodeSample ? 2 : 1;
  const codeSamples = pickMany(
    blueprint.codeSamples,
    codeSampleCount,
    seedRoot,
    "code-samples",
  );
  const codeSampleBlocks = codeSamples.map((sample, index) => {
    const code = sample.render({
      revision: input.revision,
      seedKey: `${seedRoot}:code:${index}`,
      topic: input.topic,
      taskNumber: input.taskNumber,
    });
    return [
      `### ${sample.title}`,
      `\`\`\`${sample.language}`,
      code,
      "\`\`\`",
    ].join("\n");
  });

  return [
    `# ${input.title}`,
    "",
    `Project: ${input.projectName}`,
    `Topic: ${input.topic}`,
    `Task Number: ${input.taskNumber}`,
    `Revision: ${input.revision}`,
    "",
    "## Summary",
    `${pickOne(summaryOpeners, seedRoot, "summary-open")} ${pickOne(blueprint.contextStatements, seedRoot, "summary-context")} ${revProfile.summaryFocus}`,
    "",
    "## Problem & Context",
    `${pickOne(blueprint.contextStatements, seedRoot, "problem-context")} This workstream focuses on ${blueprint.domain}.`,
    "",
    ...constraints.map((line) => `- Constraint: ${line}`),
    "",
    "## Goals",
    ...goals.map((line) => `- ${line}`),
    "",
    "## Non-Goals",
    ...nonGoals.map((line) => `- ${line}`),
    "",
    "## Scope",
    "### In Scope",
    ...inScope.map((line, index) => `${index + 1}. ${line}`),
    "",
    "### Out of Scope",
    ...outScope.map((line, index) => `${index + 1}. ${line}`),
    "",
    "## Proposed Approach",
    `${pickOne(approachLeadIns, seedRoot, "approach-lead")} Revision ${input.revision} will ${revProfile.implementationFocus}.`,
    "",
    ...approach.map((line, index) => `${index + 1}. ${line}`),
    "",
    "## Implementation Plan",
    `${revProfile.validationFocus} while execution is split into the following tracks:`,
    "",
    ...tracks.map((line, index) => `${index + 1}. ${line}`),
    "",
    "## Data/State Changes",
    ...dataChanges.map((line) => `- ${line}`),
    "",
    "## Rollout Plan",
    `${revProfile.rolloutFocus}.`,
    "",
    ...rollout.map((line, index) => `${index + 1}. ${line}`),
    "",
    "## Observability",
    ...observability.map((line) => `- ${line}`),
    `- Rollout gate metric key: ${titleCase(pickOne(blueprint.components, seedRoot, "gate-component"))} stability index.`,
    "",
    "## Test Plan",
    ...tests.map((line, index) => `${index + 1}. ${line}`),
    `5. Execute regression suite with seed marker ${shortToken(seedRoot, "suite")}.`,
    "",
    "## Risks & Mitigations",
    ...risks.map(
      (entry) => `- Risk: ${entry.risk} Mitigation: ${entry.mitigation}`,
    ),
    "",
    "## Acceptance Criteria",
    ...acceptance.map((line) => `- ${line}`),
    `- Revision ${input.revision} sign-off requires evidence for ${revProfile.validationFocus}.`,
    "",
    "## Reference Implementation Fragments",
    ...codeSampleBlocks,
  ].join("\n");
}

function buildRevisionComment(
  task: PlannedTask,
  revision: number,
): string | null {
  if (revision === 1) return null;

  const blueprint = TOPIC_BLUEPRINTS[task.topic];
  const seedRoot = `${task.seedKey}:comment:${revision}`;

  const severityPool: Array<"P1" | "P2" | "P3"> =
    revision >= 4
      ? ["P1", "P2", "P1"]
      : revision === 3
        ? ["P2", "P1", "P2"]
        : ["P2", "P3", "P2"];
  const severity = pickOne(severityPool, seedRoot, "severity");

  const primaryComponent = pickOne(
    blueprint.components,
    seedRoot,
    "component-a",
  );
  const secondaryComponent = pickOne(
    blueprint.components,
    seedRoot,
    "component-b",
  );
  const findingTitle = pickOne(
    blueprint.reviewFindings,
    seedRoot,
    "finding-title",
  );

  const concern = pickOne(
    [
      `The contract between ${primaryComponent} and ${secondaryComponent} is still ambiguous during failure transitions.`,
      `Current revision does not fully lock thresholds around ${pickOne(blueprint.constraints, seedRoot, "constraint").toLowerCase()}.`,
      `Ownership for validating ${pickOne(blueprint.goals, seedRoot, "goal").toLowerCase()} is implied but not explicit.`,
      `The scope boundary around ${pickOne(blueprint.inScope, seedRoot, "scope").toLowerCase()} can still create interpretation drift.`,
    ],
    seedRoot,
    "concern",
  );

  const rationale = pickOne(
    [
      "Without this clarification, rollout risk remains concentrated in late-cycle execution when fixes are more expensive.",
      "This gap can cause inconsistent implementation behavior across contributors and reduce review confidence.",
      "The current wording allows multiple valid interpretations, which weakens predictability for launch decisions.",
      "If unresolved, this can break the linkage between observability gates and operational response actions.",
    ],
    seedRoot,
    "rationale",
  );

  const requestedChange = pickOne(
    [
      `Add explicit decision rules for ${primaryComponent}, including fallback handling and owner sign-off checkpoints.`,
      `Tighten the section for ${secondaryComponent} with concrete thresholds, rollback triggers, and escalation owner.`,
      "Include a short execution matrix that maps risks to test evidence and release gates before approval.",
      "Specify the exact validation artifacts required at each rollout phase and who is accountable for review.",
    ],
    seedRoot,
    "requested-change",
  );

  const acceptanceChecks = pickOne(
    [
      "Updated plan must include measurable thresholds, named owners, and a rollback trigger tied to observability signals.",
      "Revision should include explicit test evidence requirements and failure-path handling before status can move forward.",
      "Approval criteria should reference concrete metrics, not descriptive goals, with pass/fail boundaries documented.",
      "Final scope statement must remove ambiguous wording and include deterministic handoff conditions.",
    ],
    seedRoot,
    "acceptance-checks",
  );

  return [
    `[${severity}] ${findingTitle}`,
    `Concern: ${concern}`,
    `Rationale: ${rationale}`,
    `Requested change: ${requestedChange}`,
    `Acceptance checks: ${acceptanceChecks}`,
  ].join("\n");
}

function validateRevisionBody(
  body: string,
  taskKey: string,
  revision: number,
): void {
  for (const header of REQUIRED_PLAN_HEADERS) {
    if (!body.includes(header)) {
      throw new Error(
        `Seed validation failed for ${taskKey} rev ${revision}: missing header ${header}`,
      );
    }
  }

  if (body.length < MIN_PLAN_CHARACTERS) {
    throw new Error(
      `Seed validation failed for ${taskKey} rev ${revision}: body too short (${body.length} chars)`,
    );
  }

  if (!/```[a-z]+/i.test(body)) {
    throw new Error(
      `Seed validation failed for ${taskKey} rev ${revision}: no fenced code block with language`,
    );
  }

  const fenceCount = body.match(/```/g)?.length ?? 0;
  if (fenceCount < 2 || fenceCount % 2 !== 0) {
    throw new Error(
      `Seed validation failed for ${taskKey} rev ${revision}: unbalanced fenced code blocks`,
    );
  }
}

function validateRevisionComment(
  comment: string | null,
  taskKey: string,
  revision: number,
): void {
  if (revision === 1) {
    if (comment !== null) {
      throw new Error(
        `Seed validation failed for ${taskKey} rev ${revision}: comment must be null on first revision`,
      );
    }
    return;
  }

  if (!comment) {
    throw new Error(
      `Seed validation failed for ${taskKey} rev ${revision}: comment is required`,
    );
  }

  if (!/^\[P[123]\]\s.+/.test(comment)) {
    throw new Error(
      `Seed validation failed for ${taskKey} rev ${revision}: invalid severity prefix`,
    );
  }

  const lines = comment.split("\n");
  for (const field of REQUIRED_COMMENT_FIELDS) {
    if (!lines.some((line) => line.startsWith(field))) {
      throw new Error(
        `Seed validation failed for ${taskKey} rev ${revision}: missing comment field ${field}`,
      );
    }
  }
}

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool);

  const now = new Date();

  const seedUsers = [
    {
      name: "Luca Rivera",
      email: "luca@unlinear.dev",
      avatar: "https://i.pravatar.cc/150?u=luca",
    },
    {
      name: "Maya Chen",
      email: "maya@unlinear.dev",
      avatar: "https://i.pravatar.cc/150?u=maya",
    },
    {
      name: "Sam Patel",
      email: "sam@unlinear.dev",
      avatar: "https://i.pravatar.cc/150?u=sam",
    },
    {
      name: "Ivy Morales",
      email: "ivy@unlinear.dev",
      avatar: "https://i.pravatar.cc/150?u=ivy",
    },
    {
      name: "Noah Kim",
      email: "noah@unlinear.dev",
      avatar: "https://i.pravatar.cc/150?u=noah",
    },
    {
      name: "Ada Brooks",
      email: "ada@unlinear.dev",
      avatar: "https://i.pravatar.cc/150?u=ada",
    },
    {
      name: "Rae Johnson",
      email: "rae@unlinear.dev",
      avatar: "https://i.pravatar.cc/150?u=rae",
    },
    {
      name: "Jules Park",
      email: "jules@unlinear.dev",
      avatar: "https://i.pravatar.cc/150?u=jules",
    },
    {
      name: "Omar Bell",
      email: "omar@unlinear.dev",
      avatar: "https://i.pravatar.cc/150?u=omar",
    },
    {
      name: "Nina Shah",
      email: "nina@unlinear.dev",
      avatar: "https://i.pravatar.cc/150?u=nina",
    },
  ];

  const seedProjects: SeedProject[] = [
    {
      name: "Core Platform",
      description: "Reliability and backend architecture improvements.",
      ownerEmail: "luca@unlinear.dev",
      memberEmails: [
        "maya@unlinear.dev",
        "sam@unlinear.dev",
        "ivy@unlinear.dev",
      ],
    },
    {
      name: "Product Surface",
      description: "UX and workflow polish for daily product usage.",
      ownerEmail: "maya@unlinear.dev",
      memberEmails: [
        "luca@unlinear.dev",
        "noah@unlinear.dev",
        "ada@unlinear.dev",
      ],
    },
    {
      name: "Integrations",
      description: "External connectors, webhook hardening, and sync jobs.",
      ownerEmail: "sam@unlinear.dev",
      memberEmails: [
        "jules@unlinear.dev",
        "rae@unlinear.dev",
        "omar@unlinear.dev",
      ],
    },
    {
      name: "Growth Ops",
      description: "Acquisition, activation, and experimentation work.",
      ownerEmail: "nina@unlinear.dev",
      memberEmails: [
        "maya@unlinear.dev",
        "ada@unlinear.dev",
        "ivy@unlinear.dev",
      ],
    },
  ];

  try {
    await db.transaction(async (tx) => {
      await tx.delete(codexRuns);
      await tx.delete(approvals);
      await tx.delete(taskRevisions);
      await tx.delete(tasks);
      await tx.delete(projectMembers);
      await tx.delete(projects);
      await tx.delete(users);

      const insertedUsers = await tx
        .insert(users)
        .values(
          seedUsers.map((u) => ({
            name: u.name,
            email: u.email,
            avatarUrl: u.avatar,
          })),
        )
        .returning();

      const userIdByEmail = new Map(insertedUsers.map((u) => [u.email, u.id]));

      const insertedProjects = await tx
        .insert(projects)
        .values(
          seedProjects.map((p) => ({
            name: p.name,
            description: p.description,
            ownerId: userIdByEmail.get(p.ownerEmail)!,
          })),
        )
        .returning();

      const projectIdByName = new Map(
        insertedProjects.map((p) => [p.name, p.id]),
      );

      const memberRows: {
        projectId: string;
        userId: string;
        role: "owner" | "admin" | "member";
        joinedAt: Date;
      }[] = [];

      for (const project of seedProjects) {
        const projectId = projectIdByName.get(project.name)!;
        memberRows.push({
          projectId,
          userId: userIdByEmail.get(project.ownerEmail)!,
          role: "owner",
          joinedAt: now,
        });
        for (const email of project.memberEmails) {
          memberRows.push({
            projectId,
            userId: userIdByEmail.get(email)!,
            role: "member",
            joinedAt: now,
          });
        }
      }
      await tx.insert(projectMembers).values(memberRows);

      const plannedTasks: PlannedTask[] = [];
      const revisionDataByTaskKey = new Map<string, RevisionSeed[]>();

      for (const [projectIndex, project] of seedProjects.entries()) {
        const projectId = projectIdByName.get(project.name)!;
        const projectContributors = [
          project.ownerEmail,
          ...project.memberEmails,
        ];

        for (let n = 1; n <= 25; n += 1) {
          const status = taskStatusFor(n + projectIndex);
          const topic = TASK_TOPICS[(n + projectIndex) % TASK_TOPICS.length];
          const title = `${topic} #${n}`;
          const authorEmail =
            projectContributors[n % projectContributors.length]!;
          const authorId = userIdByEmail.get(authorEmail)!;
          const currentRevision = ((n + projectIndex) % 4) + 1;

          const key = `${projectId}:${n}`;
          const seedKey = `${projectId}:${n}`;
          const revisions: RevisionSeed[] = [];

          for (let rev = 1; rev <= currentRevision; rev += 1) {
            const body = buildRevisionBody({
              projectName: project.name,
              title,
              topic,
              revision: rev,
              seedKey,
              taskNumber: n,
            });
            const comment = buildRevisionComment(
              {
                key,
                seedKey,
                projectId,
                projectName: project.name,
                number: n,
                topic,
                title,
                status,
                authorId,
                currentRevision,
                body,
              },
              rev,
            );

            validateRevisionBody(body, key, rev);
            validateRevisionComment(comment, key, rev);
            revisions.push({ body, comment });
          }

          revisionDataByTaskKey.set(key, revisions);

          plannedTasks.push({
            key,
            seedKey,
            projectId,
            projectName: project.name,
            number: n,
            topic,
            title,
            status,
            authorId,
            currentRevision,
            body: revisions[revisions.length - 1]!.body,
          });
        }
      }

      const insertedTasks = await tx
        .insert(tasks)
        .values(
          plannedTasks.map((t) => ({
            projectId: t.projectId,
            number: t.number,
            title: t.title,
            body: t.body,
            status: t.status,
            authorId: t.authorId,
            currentRevision: t.currentRevision,
            updatedAt: now,
          })),
        )
        .returning();

      const taskIdByKey = new Map(
        insertedTasks.map((t) => [`${t.projectId}:${t.number}`, t.id]),
      );

      const revisionRows: {
        taskId: string;
        revisionNumber: number;
        body: string;
        comment: string | null;
        authorId: string;
      }[] = [];

      const approvalRows: {
        taskId: string;
        userId: string;
        revisionNumber: number;
      }[] = [];

      const codexRunRows: {
        taskId: string;
        revisionNumber: number;
        triggeredBy: string;
        status: "queued" | "running" | "completed" | "failed";
        outputUrl: string | null;
        errorMessage: string | null;
        startedAt: Date | null;
        completedAt: Date | null;
      }[] = [];

      for (const task of plannedTasks) {
        const taskId = taskIdByKey.get(task.key)!;
        const revisions = revisionDataByTaskKey.get(task.key)!;

        for (let rev = 1; rev <= revisions.length; rev += 1) {
          const revision = revisions[rev - 1]!;
          revisionRows.push({
            taskId,
            revisionNumber: rev,
            body: revision.body,
            comment: revision.comment,
            authorId: task.authorId,
          });
        }

        if (
          task.status === "approved" ||
          task.status === "building" ||
          task.status === "done"
        ) {
          approvalRows.push({
            taskId,
            userId: task.authorId,
            revisionNumber: task.currentRevision,
          });

          if (task.status === "approved") {
            codexRunRows.push({
              taskId,
              revisionNumber: task.currentRevision,
              triggeredBy: task.authorId,
              status: "queued",
              outputUrl: null,
              errorMessage: null,
              startedAt: null,
              completedAt: null,
            });
          } else if (task.status === "building") {
            codexRunRows.push({
              taskId,
              revisionNumber: task.currentRevision,
              triggeredBy: task.authorId,
              status: "running",
              outputUrl: null,
              errorMessage: null,
              startedAt: new Date(now.getTime() - 1000 * 60 * 15),
              completedAt: null,
            });
          } else {
            const failed = task.number % 7 === 0;
            codexRunRows.push({
              taskId,
              revisionNumber: task.currentRevision,
              triggeredBy: task.authorId,
              status: failed ? "failed" : "completed",
              outputUrl: failed
                ? null
                : `https://artifacts.unlinear.dev/runs/${taskId}`,
              errorMessage: failed
                ? "Integration tests failed in deploy preview"
                : null,
              startedAt: new Date(now.getTime() - 1000 * 60 * 40),
              completedAt: new Date(now.getTime() - 1000 * 60 * 10),
            });
          }
        }
      }

      await tx.insert(taskRevisions).values(revisionRows);
      await tx.insert(approvals).values(approvalRows);
      await tx.insert(codexRuns).values(codexRunRows);

      console.log(
        `Seed complete: ${insertedUsers.length} users, ${insertedProjects.length} projects, ${insertedTasks.length} tasks, ${revisionRows.length} revisions, ${approvalRows.length} approvals, ${codexRunRows.length} codex runs`,
      );
    });
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
