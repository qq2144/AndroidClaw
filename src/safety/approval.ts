import type { ActionInput } from '../agent/tools.ts';
import type { Observation } from '../perception/types.ts';

export type ApprovalMode = 'unless-trusted' | 'on-request' | 'never';

// Apps where any destructive-looking action requires approval.
export const SENSITIVE_PACKAGES = new Set<string>([
  'com.tencent.mm',          // WeChat (pay/send)
  'com.tencent.mobileqq',    // QQ
  'com.eg.android.AlipayGphone',
  'com.unionpay',
  'com.alibaba.android.rimet', // DingTalk
  'org.telegram.messenger',  // Telegram
]);

// Element text that suggests a destructive confirmation.
const DESTRUCTIVE_TEXT = /^(发送|发出|确认支付|付款|删除|清空|登出|退出登录|send|pay|confirm|delete|sign out|logout|transfer|确认转账)$/i;

export interface ApprovalDecision {
  needs: boolean;
  reason?: string;
}

export class ApprovalPolicy {
  // NB: explicit fields (not constructor parameter properties) so this module runs under
  // Node's built-in strip-only type stripping — lets `node --test` exercise it with no deps.
  mode: ApprovalMode;
  allowlist: Set<string> | null;
  approvedForSession: Set<string>;
  constructor(
    mode: ApprovalMode = 'on-request',
    allowlist: Set<string> | null = null,
    approvedForSession: Set<string> = new Set(),
  ) {
    this.mode = mode;
    this.allowlist = allowlist;
    this.approvedForSession = approvedForSession;
  }

  evaluate(action: ActionInput, obs: Observation): ApprovalDecision {
    if (this.mode === 'never') return { needs: false };

    // AppAllowlist (= sandbox policy): refuse launches outside the allowlist.
    if (action.name === 'launch_app' && this.allowlist && !this.allowlist.has(action.input.pkg)) {
      return { needs: true, reason: `launching ${action.input.pkg} (not on allowlist)` };
    }

    if (action.name === 'tap') {
      const el = obs.elements.find((e) => e.id === action.input.id);
      const label = el ? (el.text || el.desc) : '';
      if (label && DESTRUCTIVE_TEXT.test(label.trim())) {
        const key = `${obs.currentPackage}::tap::${label}`;
        if (this.approvedForSession.has(key)) return { needs: false };
        return { needs: true, reason: `tap looks destructive: ${JSON.stringify(label)} in ${obs.currentPackage}` };
      }
    }
    if (action.name === 'key' && action.input.name === 'ENTER' && SENSITIVE_PACKAGES.has(obs.currentPackage)) {
      const key = `${obs.currentPackage}::key::ENTER`;
      if (this.approvedForSession.has(key)) return { needs: false };
      return { needs: true, reason: `ENTER in sensitive app ${obs.currentPackage}` };
    }
    // `submit` fires IME_ACTION_SEND — in chat apps this IS the send. Gate it like ENTER,
    // else paste_text+submit would send silently with no approval (the contract for task A).
    if (action.name === 'submit' && SENSITIVE_PACKAGES.has(obs.currentPackage)) {
      const key = `${obs.currentPackage}::submit`;
      if (this.approvedForSession.has(key)) return { needs: false };
      return { needs: true, reason: `submit (send message) in sensitive app ${obs.currentPackage}` };
    }
    return { needs: false };
  }

  approveKey(obs: Observation, action: ActionInput) {
    if (action.name === 'tap') {
      const el = obs.elements.find((e) => e.id === action.input.id);
      const label = el ? (el.text || el.desc) : '';
      this.approvedForSession.add(`${obs.currentPackage}::tap::${label}`);
    } else if (action.name === 'key') {
      this.approvedForSession.add(`${obs.currentPackage}::key::${action.input.name}`);
    } else if (action.name === 'submit') {
      this.approvedForSession.add(`${obs.currentPackage}::submit`);
    } else if (action.name === 'launch_app') {
      this.allowlist?.add(action.input.pkg);
    }
  }
}
