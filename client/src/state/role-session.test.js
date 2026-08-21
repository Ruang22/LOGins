import { beforeEach, describe, expect, it } from 'vitest';
import { createRoleSession } from './role-session.js';

describe('createRoleSession', () => {
  beforeEach(() => sessionStorage.clear());

  it('保存并恢复选中的身份与本地账户', () => {
    const session = createRoleSession();

    session.select({ role: 'parent', accountId: 'parent-local-id' });
    const restored = createRoleSession();

    expect(restored.role.value).toBe('parent');
    expect(restored.accountId.value).toBe('parent-local-id');
  });

  it('重置后清除持久化的账户选择', () => {
    const session = createRoleSession();
    session.select({ role: 'teacher', accountId: 'teacher-local-id' });

    session.reset();
    const restored = createRoleSession();

    expect(restored.role.value).toBe(null);
    expect(restored.accountId.value).toBe(null);
  });

  it('忽略教师和家长以外的身份', () => {
    const session = createRoleSession();

    session.select({ role: 'visitor', accountId: 'visitor-local-id' });

    expect(session.role.value).toBe(null);
  });

  it('拒绝与演示别名不匹配的身份账户组合', () => {
    const session = createRoleSession();

    session.select({ role: 'teacher', accountId: 'parent-demo' });

    expect(session.role.value).toBe(null);
    expect(session.accountId.value).toBe(null);
  });
});
