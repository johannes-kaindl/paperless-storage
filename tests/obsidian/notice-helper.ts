// Typ-Sicht auf die vom Mock aufgezeichneten Notices (der Mock kennt `instances`, die echten Typen nicht).
import { Notice } from "obsidian";

type Recorded = Array<{ message: unknown }>;
const live = (): Recorded => (Notice as unknown as { instances: Recorded }).instances;

export const noticeTexts = (): string[] => live().map((n) => String(n.message));
export const clearNotices = (): void => { live().length = 0; };
