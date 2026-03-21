import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlanManager } from '../../src/plans/plan-manager.js';
import { createRenameOp, createSetBpmOp } from '../../src/plans/operations.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

describe('PlanManager', () => {
  let manager: PlanManager;

  beforeEach(() => {
    manager = new PlanManager();
  });

  it('creates a plan', () => {
    const plan = manager.createPlan('Test Plan', '/music');
    expect(plan.name).toBe('Test Plan');
    expect(plan.id).toBeTruthy();
    expect(plan.version).toBe(1);
    expect(plan.operations).toHaveLength(0);
    expect(plan.baseDirectory).toBe('/music');
  });

  it('creates a plan with description', () => {
    const plan = manager.createPlan('Test', '/music', 'A test plan');
    expect(plan.description).toBe('A test plan');
  });

  it('adds operations to a plan', () => {
    const plan = manager.createPlan('Test', '/music');
    manager.addOperation(plan.id, createRenameOp('/a.mp3', '/b.mp3'));
    manager.addOperation(plan.id, createSetBpmOp('/b.mp3', 128));

    const updated = manager.getPlan(plan.id);
    expect(updated.operations).toHaveLength(2);
    expect(updated.metadata.totalFiles).toBe(2);
  });

  it('throws on unknown plan id', () => {
    expect(() => manager.getPlan('nonexistent')).toThrow('Plan not found');
  });

  it('lists all plans', () => {
    manager.createPlan('Plan A', '/a');
    manager.createPlan('Plan B', '/b');
    expect(manager.listPlans()).toHaveLength(2);
  });

  it('executes plan in dry mode', async () => {
    const plan = manager.createPlan('Test', '/music');
    manager.addOperation(plan.id, createRenameOp('/a.mp3', '/b.mp3'));

    const result = await manager.executePlan(plan.id, { dryMode: true });
    expect(result.dryMode).toBe(true);
    expect(result.executed).toBe(1);
    expect(result.succeeded).toBe(1);
  });

  describe('export/import', () => {
    const testDir = path.join(tmpdir(), `musicsorter-plan-test-${Date.now()}`);

    afterEach(async () => {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    });

    it('exports and imports a plan', async () => {
      const plan = manager.createPlan('Export Test', '/music');
      manager.addOperation(plan.id, createSetBpmOp('/track.mp3', 140));

      const exportPath = path.join(testDir, 'test.bangersss-mcp-plan.json');
      await fs.mkdir(testDir, { recursive: true });
      await manager.exportPlan(plan.id, exportPath);

      // Import into a fresh manager
      const manager2 = new PlanManager();
      const imported = await manager2.importPlan(exportPath);

      expect(imported.name).toBe('Export Test');
      expect(imported.operations).toHaveLength(1);
      expect(imported.operations[0].type).toBe('set_bpm');
    });
  });
});
