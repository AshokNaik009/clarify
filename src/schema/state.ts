import { z } from 'zod';

export const PhaseSchema = z.enum([
  'interviewing',
  'crystallizing',
  'executing',
  'evaluating',
  'evolving',
  'done',
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const ACStatusSchema = z.enum([
  'pending',
  'in_progress',
  'passed',
  'failed',
  'skipped',
]);
export type ACStatus = z.infer<typeof ACStatusSchema>;

export const InterviewTurnSchema = z
  .object({
    q: z.string(),
    a: z.string(),
    asked_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const InterviewSchema = z
  .object({
    idea: z.string().default(''),
    turns: z.array(InterviewTurnSchema).default([]),
    slots: z
      .object({
        language: z.string().nullable().default(null),
        runtime: z.string().nullable().default(null),
        persistence: z.string().nullable().default(null),
        scope: z.string().nullable().default(null),
        success_criteria: z.string().nullable().default(null),
        constraints: z.string().nullable().default(null),
      })
      .default({
        language: null,
        runtime: null,
        persistence: null,
        scope: null,
        success_criteria: null,
        constraints: null,
      }),
    ambiguity_score: z.number().min(0).max(1).default(1),
    completed: z.boolean().default(false),
  })
  .strict();

export const MechanicalResultSchema = z
  .object({
    name: z.string(),
    verdict: z.enum(['pass', 'fail', 'timeout', 'error']),
    exit_code: z.number().int().nullable().default(null),
    duration_ms: z.number().int().nonnegative().default(0),
    output_tail: z.string().default(''),
  })
  .strict();

export const LLMReviewSchema = z
  .object({
    score: z.number().min(0).max(1),
    verdict: z.enum(['pass', 'fail']),
    notes: z.string().default(''),
  })
  .strict();

export const EvaluationSchema = z
  .object({
    ac_id: z.string(),
    iteration: z.number().int().nonnegative(),
    mechanical: z.array(MechanicalResultSchema).default([]),
    llm_review: LLMReviewSchema.nullable().default(null),
    consensus: z.enum(['pass', 'fail']),
    evaluated_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const DriftSchema = z
  .object({
    last_checked_at: z.string().datetime({ offset: true }).nullable().default(null),
    scope_score: z.number().min(0).max(1).nullable().default(null),
    intent_score: z.number().min(0).max(1).nullable().default(null),
    verdict: z.enum(['aligned', 'drifting', 'diverged', 'unknown']).default('unknown'),
    findings: z.array(z.string()).default([]),
  })
  .strict();

export const EvolutionRefSchema = z
  .object({
    n: z.number().int().nonnegative(),
    seed_path: z.string(),
    parent_seed_id: z.string().nullable().default(null),
    created_at: z.string().datetime({ offset: true }),
    reason: z.string().default(''),
  })
  .strict();

export const StateSchema = z
  .object({
    schema_version: z.literal(1),
    seed_id: z.string().nullable().default(null),
    phase: PhaseSchema.default('interviewing'),
    started_at: z.string().datetime({ offset: true }),
    interview: InterviewSchema.default({
      idea: '',
      turns: [],
      slots: {
        language: null,
        runtime: null,
        persistence: null,
        scope: null,
        success_criteria: null,
        constraints: null,
      },
      ambiguity_score: 1,
      completed: false,
    }),
    ac_status: z.record(z.string(), ACStatusSchema).default({}),
    evaluations: z.array(EvaluationSchema).default([]),
    drift: DriftSchema.default({
      last_checked_at: null,
      scope_score: null,
      intent_score: null,
      verdict: 'unknown',
      findings: [],
    }),
    evolutions: z.array(EvolutionRefSchema).default([]),
  })
  .strict();

export type State = z.infer<typeof StateSchema>;
export type Evaluation = z.infer<typeof EvaluationSchema>;
export type MechanicalResult = z.infer<typeof MechanicalResultSchema>;
export type LLMReview = z.infer<typeof LLMReviewSchema>;
export type Drift = z.infer<typeof DriftSchema>;
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;
