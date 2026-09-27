export type Coverage = "full" | "part" | "none";

export interface Goal { id: number; t: string; cov: Coverage }

export interface Card {
  id: string;
  /** learning-goal number; 0 = outside the learning goals */
  g: number;
  q: string;
  /** sanitized HTML, or null when the answer is not in the presentation */
  a: string | null;
  ref: string;
  note: string | null;
  gap: string | null;
  own?: boolean;
  raw?: string;
}

export interface Findings { gaps: string[]; conflicts: string[] }

export interface Exam {
  id: string;
  name: string;
  exam_date: string | null;
  question_count: number | null;
  created_at: string;
}

export interface Subject {
  id: string;
  exam_id: string;
  name: string;
  hint: string | null;
  color: number;
  position: number;
}

export interface Lesson {
  id: string;
  exam_id: string;
  subject_id: string | null;
  name: string;
  goals: Goal[];
  cards: Card[];
  findings: Findings;
  source: { pptx: string; goals: string | null; slides: number } | null;
  created_at: string;
}

export interface OwnCard {
  id: string;
  lesson_id: string;
  goal: number;
  question: string;
  answer_html: string;
  answer_raw: string;
  source: string;
  replaces: string | null;
  created_at: string;
}

export interface Progress {
  lesson_id: string;
  mastered: string[];
  first_try: Record<string, boolean>;
  last_studied_at: string | null;
}

/** What the generation step hands back for review before saving. */
export interface Draft {
  name: string;
  subjectId: string | null;
  why: string;
  goals: Goal[];
  cards: Card[];
  findings: Findings;
  source: { pptx: string; goals: string | null; slides: number };
}

export const MAX_SUBJECTS = 6;
export const METERS_PER_CARD = 10;
