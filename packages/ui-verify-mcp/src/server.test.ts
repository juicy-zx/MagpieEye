import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createUiVerifyServer } from './server.js';

describe('createUiVerifyServer 冒烟', () => {
  it('in-process 连通,三工具可列出', async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await createUiVerifyServer().connect(st);
    const client = new Client({ name: 't', version: '0' });
    await client.connect(ct);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['ui_baseline', 'ui_check', 'ui_verify_page']);
  });
});
