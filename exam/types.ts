export type Kind =
  | 'curve' | 'creator' | 'launch_block'                 // level 1: lookups on one token
  | 'creator_tax' | 'graduated' | 'hour_launch_count'    // level 2
  | 'creator_24h'                                        // level 3: needs data across hours
  | 'creator_7d';                                        // level 4

export const KIND_LEVEL: Record<Kind, number> = {
  curve: 1, creator: 1, launch_block: 1,
  creator_tax: 2, graduated: 2, hour_launch_count: 2,
  creator_24h: 3, creator_7d: 4,
};
export const LEVEL_BUDGET: Record<number, number> = { 1: 8, 2: 12, 3: 16, 4: 20 };

export interface Question {
  id: string;
  kind: Kind;
  level: number;
  official: boolean;
  text: string;
  /** Answer shape the grader normalises to. */
  format: 'address' | 'integer' | 'yesno';
  key: string;
  key_sources: string[];
  budget: number;
}

export interface Dropped { id: string; kind: Kind; reason: string }

export interface ExamWindow {
  hour: number;
  /** launches counted for the hour: [start_block, end_block] */
  start_block: number;
  end_block: number;
  /** chain head when the keys were read; questions are asked "as of" this block */
  key_block: number;
}
