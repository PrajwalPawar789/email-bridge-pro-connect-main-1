import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalLabel,
  canActorInviteRole,
  getApprovalBadgeClass,
  getMemberStatusBadgeClass,
  getRoleBadgeClass,
  isValidApprovalTransition,
  normalizeTeamErrorMessage,
  roleLabel,
} from '../../src/lib/teamManagementHelpers.js';

test('owner can invite admins and admins can only invite users', () => {
  assert.equal(canActorInviteRole('owner', 'admin'), true);
  assert.equal(canActorInviteRole('owner', 'sub_admin'), true);
  assert.equal(canActorInviteRole('owner', 'owner'), false);
  assert.equal(canActorInviteRole('admin', 'user'), true);
  assert.equal(canActorInviteRole('admin', 'admin'), false);
  assert.equal(canActorInviteRole('sub_admin', 'user'), true);
  assert.equal(canActorInviteRole('reviewer', 'user'), false);
});

test('approval transitions only allow review actions from pending approval', () => {
  assert.equal(isValidApprovalTransition('pending_approval', 'approved'), true);
  assert.equal(isValidApprovalTransition('pending_approval', 'rejected'), true);
  assert.equal(isValidApprovalTransition('pending_approval', 'changes_requested'), true);
  assert.equal(isValidApprovalTransition('draft', 'approved'), false);
  assert.equal(isValidApprovalTransition('approved', 'rejected'), false);
});

test('team error normalization keeps allocation and approval details intact', () => {
  assert.equal(
    normalizeTeamErrorMessage(new Error('Member is outside of your scope')),
    'That member is outside of your scope.'
  );
  assert.equal(
    normalizeTeamErrorMessage({ message: 'Not authorized to review this approval request' }),
    'You do not have permission for that action.'
  );
  assert.equal(
    normalizeTeamErrorMessage({ message: 'Allocation exceeds parent limit' }),
    'Allocation exceeds parent limit'
  );
  assert.equal(
    normalizeTeamErrorMessage({ message: 'Campaign launch is blocked until approval is granted' }),
    'Campaign launch is blocked until approval is granted'
  );
});

test('label and badge helpers map team roles and approval states consistently', () => {
  assert.equal(roleLabel('sub_admin'), 'Sub Admin');
  assert.equal(approvalLabel('pending_approval'), 'Pending Approval');
  assert.match(getRoleBadgeClass('owner'), /amber/);
  assert.match(getMemberStatusBadgeClass('disabled'), /rose/);
  assert.match(getApprovalBadgeClass('changes_requested'), /sky/);
});
