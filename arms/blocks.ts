// The last block of the prompt: the only thing that differs between the four arms.
import { MANUAL } from './manual.gen.ts';

export type Arm = 'blank' | 'manual' | 'self' | 'crowd';
export const ARMS: Arm[] = ['blank', 'manual', 'self', 'crowd'];
export const NOTES_MAX_WORDS = 300;

export function lastBlock(arm: Arm, selfNotes: string, lessons: string[]): string {
  switch (arm) {
    case 'blank':
      return 'You have no notes.';
    case 'manual':
      return `Reference manual:\n\n${MANUAL}`;
    case 'self':
      return selfNotes.trim() ? `Your notes from earlier hours:\n\n${selfNotes.trim()}` : 'Your notes from earlier hours: none yet.';
    case 'crowd': {
      const notes = selfNotes.trim() ? selfNotes.trim() : 'none yet.';
      const ls = lessons.length ? lessons.map((l, i) => `${i + 1}. ${l}`).join('\n') : 'none yet.';
      return `Notes from earlier hours:\n\n${notes}\n\nLessons from holders that passed their test:\n${ls}`;
    }
  }
}

export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
export const capWords = (s: string, max = NOTES_MAX_WORDS): string => {
  const words = s.trim().split(/(\s+)/);
  let n = 0, out = '';
  for (const w of words) { if (/\S/.test(w) && ++n > max) break; out += w; }
  return out.trim();
};
