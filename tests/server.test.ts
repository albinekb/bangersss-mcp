import { describe, it, expect } from 'vitest';
import { createServer } from '../src/server.js';

describe('Server', () => {
  it('creates a server with context', () => {
    const { server, context } = createServer();
    expect(server).toBeDefined();
    expect(context.overlay).toBeDefined();
    expect(context.planManager).toBeDefined();
    expect(context.playlistManager).toBeDefined();
  });

  it('overlay starts clean', () => {
    const { context } = createServer();
    expect(context.overlay.getTrackedOperations()).toHaveLength(0);
    expect(context.overlay.getSummary().total).toBe(0);
  });

  it('planManager starts empty', () => {
    const { context } = createServer();
    expect(context.planManager.listPlans()).toHaveLength(0);
  });

  it('playlistManager starts empty', () => {
    const { context } = createServer();
    expect(context.playlistManager.listPlaylists()).toHaveLength(0);
  });

  it('context modules are independent across servers', () => {
    const { context: c1 } = createServer();
    const { context: c2 } = createServer();

    c1.planManager.createPlan('test', '/music');
    expect(c1.planManager.listPlans()).toHaveLength(1);
    expect(c2.planManager.listPlans()).toHaveLength(0);
  });
});
