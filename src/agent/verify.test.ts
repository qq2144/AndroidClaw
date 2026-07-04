import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAction } from './verify.ts';
import type { Observation } from '../perception/types.ts';

function obs(pkg = 'com.tencent.mm'): Observation {
  return {
    step: 1, ts: '', currentPackage: pkg, elements: [],
    screenshotPath: '', uiXmlPath: '', screenWidth: 1216, screenHeight: 2640,
  };
}

test('a tap that changes nothing on screen is flagged as a likely miss', () => {
  const v = verifyAction({ name: 'tap', input: { id: 5 } }, false, obs());
  assert.equal(v.ok, false);
  assert.match(v.note ?? '', /miss|no visible change/i);
});

test('launch_app is flagged when the target package did not come to foreground', () => {
  const v = verifyAction({ name: 'launch_app', input: { pkg: 'com.tencent.mm' } }, true, obs('com.android.launcher'));
  assert.equal(v.ok, false);
  assert.match(v.note ?? '', /foreground|com\.tencent\.mm/i);
});

test('a swipe that scrolls nothing is flagged as end-of-list', () => {
  const v = verifyAction({ name: 'swipe', input: { dir: 'down' } }, false, obs());
  assert.equal(v.ok, false);
  assert.match(v.note ?? '', /scroll|end of/i);
});

test('a tap that does change the screen is not flagged', () => {
  const v = verifyAction({ name: 'tap', input: { id: 5 } }, true, obs());
  assert.equal(v.ok, true);
});

test('submit / paste are NOT flagged even with no screen change (transient/息屏 frames would false-positive a successful send → duplicate message)', () => {
  assert.equal(verifyAction({ name: 'submit', input: {} }, false, obs()).ok, true);
  assert.equal(verifyAction({ name: 'paste_text', input: { text: 'hi' } }, false, obs()).ok, true);
});
