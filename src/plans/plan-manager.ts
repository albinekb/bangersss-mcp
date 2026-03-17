import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { nanoid } from "nanoid";
import { PlanSchema } from "./types.js";
import type { Plan, Operation, ExecutionResult } from "./types.js";

export class PlanManager {
  private plans = new Map<string, Plan>();

  createPlan(
    name: string,
    baseDirectory: string,
    description?: string,
  ): Plan {
    const now = new Date().toISOString();
    const plan: Plan = {
      id: nanoid(),
      name,
      description,
      version: 1,
      createdAt: now,
      updatedAt: now,
      baseDirectory,
      operations: [],
      metadata: {
        totalFiles: 0,
        completedOps: 0,
        failedOps: 0,
      },
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  addOperation(planId: string, operation: Operation): void {
    const plan = this.requirePlan(planId);
    plan.operations.push(operation);
    plan.metadata.totalFiles = plan.operations.length;
    plan.updatedAt = new Date().toISOString();
  }

  getPlan(planId: string): Plan {
    return this.requirePlan(planId);
  }

  listPlans(): Plan[] {
    return Array.from(this.plans.values());
  }

  async executePlan(
    planId: string,
    options: { dryMode: boolean } = { dryMode: false },
  ): Promise<ExecutionResult> {
    const plan = this.requirePlan(planId);
    return this.runOperations(plan, plan.operations, options.dryMode);
  }

  async resumePlan(planId: string): Promise<ExecutionResult> {
    const plan = this.requirePlan(planId);
    const pending = plan.operations.filter((op) => op.status === "pending");
    return this.runOperations(plan, pending, false);
  }

  async exportPlan(planId: string, filePath: string): Promise<void> {
    const plan = this.requirePlan(planId);
    const json = JSON.stringify(plan, null, 2);
    await writeFile(filePath, json, "utf-8");
  }

  async importPlan(filePath: string): Promise<Plan> {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    const plan = PlanSchema.parse(data);
    this.plans.set(plan.id, plan);
    return plan;
  }

  // --- Internal helpers ---

  private requirePlan(planId: string): Plan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    return plan;
  }

  private async runOperations(
    plan: Plan,
    operations: Operation[],
    dryMode: boolean,
  ): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      planId: plan.id,
      executed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      dryMode,
      errors: [],
    };

    for (const op of operations) {
      if (op.status !== "pending") {
        result.skipped++;
        continue;
      }

      result.executed++;

      if (dryMode) {
        result.succeeded++;
        continue;
      }

      try {
        await this.executeOperation(op, plan.baseDirectory);
        op.status = "done";
        plan.metadata.completedOps++;
        result.succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        op.status = "failed";
        op.error = message;
        plan.metadata.failedOps++;
        result.failed++;
        result.errors.push({
          operationIndex: plan.operations.indexOf(op),
          message,
        });
      }
    }

    plan.updatedAt = new Date().toISOString();
    return result;
  }

  private async executeOperation(
    op: Operation,
    _baseDirectory: string,
  ): Promise<void> {
    switch (op.type) {
      case "rename_file": {
        await rename(op.from, op.to);
        break;
      }
      case "move_file": {
        await mkdir(dirname(op.to), { recursive: true });
        await rename(op.from, op.to);
        break;
      }
      case "delete_file": {
        await unlink(op.path);
        break;
      }
      case "write_tags":
      case "set_bpm":
      case "create_playlist":
      case "add_to_playlist":
      case "add_to_rekordbox_playlist":
      case "add_to_engine_crate": {
        // These operations require integration with external libraries
        // (music-metadata, rekordbox, engine DJ). Implementations will be
        // wired in when those modules are built. For now, mark as done.
        break;
      }
      default: {
        const _exhaustive: never = op;
        throw new Error(`Unknown operation type: ${(_exhaustive as Operation).type}`);
      }
    }
  }
}
