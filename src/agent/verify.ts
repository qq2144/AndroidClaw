// Per-action verification: after an action runs, did it have its expected observable effect?
// Cheap, screen-level signal only — the caller passes `screenChanged` (computed from the same
// pngSize+element fingerprint that powers stuck-detection), so this needs no extra device I/O.
// A failed verdict is fed back into history so the model sees "your last tap did nothing"
// instead of blindly re-tapping (the task-A navigation wobble). It is also the divergence
// detector a future deterministic flow-replay will reuse.
import type { ActionInput } from './tools.ts';
import type { Observation } from '../perception/types.ts';

export interface Verdict {
  ok: boolean;
  note?: string;
}

export function verifyAction(action: ActionInput, screenChanged: boolean, after: Observation): Verdict {
  switch (action.name) {
    case 'launch_app':
      return after.currentPackage === action.input.pkg
        ? { ok: true }
        : { ok: false, note: `foreground is ${after.currentPackage}, expected ${action.input.pkg} — the app did not come to front` };
    case 'tap':
    case 'tap_xy':
    case 'long_press':
      return screenChanged
        ? { ok: true }
        : { ok: false, note: `${action.name} caused no visible change — it likely missed; re-read the screenshot before tapping again` };
    case 'swipe':
      return screenChanged
        ? { ok: true }
        : { ok: false, note: 'nothing scrolled — probably already at the end of the list' };
    // type_text / paste_text / submit are deliberately NOT verified by screen-change.
    // A transient frame (screen blanking / 息屏, pre-render lag) reads as "no change" even when
    // the action SUCCEEDED — and for `submit` a false "did not send" would make the model
    // re-send = a DUPLICATE message. Confirmed 2026-06-21: a run that looked failed (no bubble
    // in the post-submit frame) had in fact sent — the frame was a screen-off artifact.
    default:
      return { ok: true };
  }
}
