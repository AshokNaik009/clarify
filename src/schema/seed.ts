import { z } from 'zod';

export const ACSchema: z.ZodType<AC, z.ZodTypeDef, unknown> = z.lazy(() =>
  z
    .object({
      id: z.string().regex(/^AC(-\d+(\.\d+)*)?$/, 'AC id must be like "AC-1" or "AC-1.2.3"'),
      title: z.string().min(1),
      intent: z.string().optional(),
      allowed_paths: z.array(z.string()).default([]),
      children: z.array(ACSchema).optional(),
    })
    .strict(),
);

export interface AC {
  id: string;
  title: string;
  intent?: string;
  allowed_paths: string[];
  children?: AC[];
}

export const MechanicalCheckSchema = z
  .object({
    name: z.string().min(1),
    cmd: z.string().min(1),
    timeout_ms: z.number().int().positive().optional(),
  })
  .strict();

export const ConstraintsSchema = z
  .object({
    language: z.string().optional(),
    runtime: z.string().optional(),
    packaging: z.string().optional(),
    forbidden_paths: z.array(z.string()).default([]),
    allowed_globals: z.array(z.string()).default([]),
  })
  .partial()
  .strict()
  .default({});

export const ThresholdsSchema = z
  .object({
    ambiguity_max: z.number().min(0).max(1).default(0.2),
    consensus_min: z.number().min(0).max(1).default(0.8),
    drift_warn: z.number().min(0).max(1).default(0.3),
    drift_fail: z.number().min(0).max(1).default(0.7),
    max_evolutions: z.number().int().min(0).default(3),
  })
  .strict()
  .default({
    ambiguity_max: 0.2,
    consensus_min: 0.8,
    drift_warn: 0.3,
    drift_fail: 0.7,
    max_evolutions: 3,
  });

export const LineageSchema = z
  .object({
    source: z.enum(['interview', 'evolution', 'manual', 'ingest']).default('interview'),
    interview_transcript: z.string().nullable().optional(),
    parent_seed: z.string().nullable().optional(),
    ticket_ref: z.string().nullable().optional(),
  })
  .strict();

export const ContextReferenceSchema = z
  .object({
    path: z.string().min(1),
    role: z.enum(['primary', 'reference']),
    summary: z.string().max(200).default(''),
  })
  .strict();
export type ContextReference = z.infer<typeof ContextReferenceSchema>;

export const BrownfieldContextSchema = z
  .object({
    project_type: z.enum(['greenfield', 'brownfield']).default('greenfield'),
    tech_stack: z.string().default(''),
    context_references: z.array(ContextReferenceSchema).default([]),
    existing_patterns: z.array(z.string()).default([]),
    existing_dependencies: z.array(z.string()).default([]),
    forbidden_new_dependencies: z.boolean().default(false),
    unresolved_gaps: z.array(z.string()).default([]),
  })
  .strict();
export type BrownfieldContext = z.infer<typeof BrownfieldContextSchema>;

export const SeedSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    backend: z.string().default('claude'),
    description: z.string().min(1),
    constraints: ConstraintsSchema,
    acceptance_criteria: z.array(ACSchema).min(1),
    mechanical_checks: z.array(MechanicalCheckSchema).default([]),
    thresholds: ThresholdsSchema,
    lineage: LineageSchema,
    brownfield: BrownfieldContextSchema.optional(),
  })
  .strict();

export type Seed = z.infer<typeof SeedSchema>;
export type MechanicalCheck = z.infer<typeof MechanicalCheckSchema>;
export type Thresholds = z.infer<typeof ThresholdsSchema>;
