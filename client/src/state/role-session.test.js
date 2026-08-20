import { describe, expect, it } from 'vitest';
import { createRoleSession } from './role-session.js';

describe('createRoleSession', () => {
  it('忽略教师和家长以外的身份', () => {
    const session = createRoleSession();

    session.select('visitor');

    expect(session.role.value).toBe(null);
  });
});
