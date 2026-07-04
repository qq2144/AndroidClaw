import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalPolicy } from './approval.ts';
import type { Observation } from '../perception/types.ts';
import type { ActionInput } from '../agent/tools.ts';

/** Minimal Observation — approval only reads currentPackage + elements. */
function obsIn(pkg: string): Observation {
  return {
    step: 1,
    ts: '',
    currentPackage: pkg,
    elements: [],
    screenshotPath: '',
    uiXmlPath: '',
    screenWidth: 1216,
    screenHeight: 2640,
  };
}

test('submit in a sensitive app (WeChat) requires approval', () => {
  const policy = new ApprovalPolicy('on-request');
  const action: ActionInput = { name: 'submit', input: {} };
  const decision = policy.evaluate(action, obsIn('com.tencent.mm'));
  assert.equal(decision.needs, true);
});

test('submit in a non-sensitive app does NOT require approval', () => {
  const policy = new ApprovalPolicy('on-request');
  const action: ActionInput = { name: 'submit', input: {} };
  const decision = policy.evaluate(action, obsIn('com.android.settings'));
  assert.equal(decision.needs, false);
});

test('approve-for-session: a second submit in the same app is not re-prompted', () => {
  const policy = new ApprovalPolicy('on-request');
  const action: ActionInput = { name: 'submit', input: {} };
  const obs = obsIn('com.tencent.mm');
  assert.equal(policy.evaluate(action, obs).needs, true); // first time prompts
  policy.approveKey(obs, action);                          // user picks "approve for session"
  assert.equal(policy.evaluate(action, obs).needs, false); // no longer prompts
});
