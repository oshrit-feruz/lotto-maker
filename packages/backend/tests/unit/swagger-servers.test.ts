import { describe, expect, it } from 'vitest';
import { apiServers } from '../../src/plugins/swagger.js';

describe('apiServers', () => {
  it('uses only the path prefix of PUBLIC_API_URL', () => {
    expect(apiServers('https://prod.example.com/backend')).toEqual({ servers: [{ url: '/backend' }] });
    expect(apiServers('https://prod.example.com/backend/')).toEqual({ servers: [{ url: '/backend' }] });
  });
  it('adds no servers without a prefix or URL', () => {
    expect(apiServers('https://api.example.com')).toEqual({});
    expect(apiServers(undefined)).toEqual({});
  });
});
