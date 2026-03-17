import { z } from "zod";

// --- Operation Status ---

export const OperationStatusSchema = z.enum([
  "pending",
  "done",
  "failed",
  "skipped",
]);
export type OperationStatus = z.infer<typeof OperationStatusSchema>;

// --- Operation Schemas (discriminated union on `type`) ---

export const RenameFileOpSchema = z.object({
  type: z.literal("rename_file"),
  status: OperationStatusSchema,
  from: z.string(),
  to: z.string(),
  error: z.string().optional(),
});

export const MoveFileOpSchema = z.object({
  type: z.literal("move_file"),
  status: OperationStatusSchema,
  from: z.string(),
  to: z.string(),
  error: z.string().optional(),
});

export const WriteTagsOpSchema = z.object({
  type: z.literal("write_tags"),
  status: OperationStatusSchema,
  path: z.string(),
  tags: z.record(z.string(), z.unknown()),
  error: z.string().optional(),
});

export const SetBpmOpSchema = z.object({
  type: z.literal("set_bpm"),
  status: OperationStatusSchema,
  path: z.string(),
  bpm: z.number(),
  error: z.string().optional(),
});

export const CreatePlaylistOpSchema = z.object({
  type: z.literal("create_playlist"),
  status: OperationStatusSchema,
  name: z.string(),
  tracks: z.array(z.string()),
  error: z.string().optional(),
});

export const AddToPlaylistOpSchema = z.object({
  type: z.literal("add_to_playlist"),
  status: OperationStatusSchema,
  name: z.string(),
  tracks: z.array(z.string()),
  error: z.string().optional(),
});

export const AddToRekordboxPlaylistOpSchema = z.object({
  type: z.literal("add_to_rekordbox_playlist"),
  status: OperationStatusSchema,
  name: z.string(),
  tracks: z.array(z.string()),
  error: z.string().optional(),
});

export const AddToEngineCrateOpSchema = z.object({
  type: z.literal("add_to_engine_crate"),
  status: OperationStatusSchema,
  name: z.string(),
  tracks: z.array(z.string()),
  error: z.string().optional(),
});

export const DeleteFileOpSchema = z.object({
  type: z.literal("delete_file"),
  status: OperationStatusSchema,
  path: z.string(),
  error: z.string().optional(),
});

export const OperationSchema = z.discriminatedUnion("type", [
  RenameFileOpSchema,
  MoveFileOpSchema,
  WriteTagsOpSchema,
  SetBpmOpSchema,
  CreatePlaylistOpSchema,
  AddToPlaylistOpSchema,
  AddToRekordboxPlaylistOpSchema,
  AddToEngineCrateOpSchema,
  DeleteFileOpSchema,
]);

export type Operation = z.infer<typeof OperationSchema>;

export type RenameFileOp = z.infer<typeof RenameFileOpSchema>;
export type MoveFileOp = z.infer<typeof MoveFileOpSchema>;
export type WriteTagsOp = z.infer<typeof WriteTagsOpSchema>;
export type SetBpmOp = z.infer<typeof SetBpmOpSchema>;
export type CreatePlaylistOp = z.infer<typeof CreatePlaylistOpSchema>;
export type AddToPlaylistOp = z.infer<typeof AddToPlaylistOpSchema>;
export type AddToRekordboxPlaylistOp = z.infer<
  typeof AddToRekordboxPlaylistOpSchema
>;
export type AddToEngineCrateOp = z.infer<typeof AddToEngineCrateOpSchema>;
export type DeleteFileOp = z.infer<typeof DeleteFileOpSchema>;

// --- Plan Schema ---

export const PlanMetadataSchema = z.object({
  totalFiles: z.number(),
  completedOps: z.number(),
  failedOps: z.number(),
});

export type PlanMetadata = z.infer<typeof PlanMetadataSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  baseDirectory: z.string(),
  operations: z.array(OperationSchema),
  metadata: PlanMetadataSchema,
});

export type Plan = z.infer<typeof PlanSchema>;

// --- Execution Result ---

export const ExecutionResultSchema = z.object({
  planId: z.string(),
  executed: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  skipped: z.number(),
  dryMode: z.boolean(),
  errors: z.array(
    z.object({
      operationIndex: z.number(),
      message: z.string(),
    }),
  ),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
