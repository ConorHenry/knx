export type Difficulty = 'yellow' | 'green' | 'blue' | 'purple';

export const DIFFICULTY_ORDER: Difficulty[] = ['yellow', 'green', 'blue', 'purple'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  yellow: 'Straightforward',
  green: 'Moderate',
  blue: 'Tricky',
  purple: 'Devious',
};

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  yellow: '#F9DF6D',
  green: '#A0C35A',
  blue: '#B0C4EF',
  purple: '#BA81C5',
};

export const DIFFICULTY_TEXT_COLORS: Record<Difficulty, string> = {
  yellow: '#5c4a00',
  green: '#1a3d00',
  blue: '#00205c',
  purple: '#2d0047',
};

export type Category = {
  name: string;
  color: Difficulty;
  items: [string, string, string, string];
};

export type Puzzle = {
  categories: [Category, Category, Category, Category];
};
