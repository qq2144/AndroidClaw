export interface Element {
  id: number;
  text: string;
  desc: string;
  klass: string;
  pkg: string;
  bounds: [number, number, number, number];
  clickable: boolean;
  scrollable: boolean;
  editable: boolean;
  focused: boolean;
  password: boolean;
}

export interface Observation {
  step: number;
  ts: string;
  currentPackage: string;
  elements: Element[];
  screenshotPath: string;
  uiXmlPath: string;
  screenWidth: number;
  screenHeight: number;
  /** Where the elements came from. */
  source?: 'uiautomator' | 'ocr' | 'empty';
  /** Milliseconds spent in OCR (only set when source='ocr'). */
  ocrMs?: number;
}

export function centerOf(b: Element['bounds']): [number, number] {
  return [Math.round((b[0] + b[2]) / 2), Math.round((b[1] + b[3]) / 2)];
}
