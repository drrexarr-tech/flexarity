import { create } from 'zustand';

const KEY = 'bottomNav';

/**
 * Which sections live in the phone's bottom bar, and in what order.
 *
 * The bar was hardcoded to five sections, which meant the two people using this
 * app on a phone had to agree on what is worth a thumb reach. Everyone gets the
 * same five whatever they actually open.
 *
 * Stored as an ordered list of ids rather than a set of booleans, because the
 * order is half the point and a set cannot express it.
 */
export const ALL_SECTIONS = [
  { id: 'home', to: '/', label: 'Главная' },
  { id: 'tasks', to: '/tasks', label: 'Задачи' },
  { id: 'calendar', to: '/calendar', label: 'Календарь' },
  { id: 'shopping', to: '/shopping', label: 'Покупки' },
  { id: 'chats', to: '/chats', label: 'Чаты' },
  { id: 'notes', to: '/notes', label: 'Заметки' },
  { id: 'recipes', to: '/recipes', label: 'Рецепты' },
  { id: 'plans', to: '/plans', label: 'Планы' },
  { id: 'wishes', to: '/wishes', label: 'Хотелки' },
  { id: 'family', to: '/family', label: 'Семья' },
] as const;

export type SectionId = (typeof ALL_SECTIONS)[number]['id'];

const DEFAULT_ORDER: SectionId[] = ['home', 'tasks', 'calendar', 'shopping', 'chats'];

/** Five is what fits legibly across a phone; six starts truncating the labels. */
export const MAX_VISIBLE = 5;

function parse(raw: string | null): SectionId[] {
  if (!raw) return [...DEFAULT_ORDER];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_ORDER];
    const known = new Set(ALL_SECTIONS.map((s) => s.id));
    // Drop anything that no longer exists rather than rendering a dead tab, and
    // drop duplicates so a hand-edited value cannot render the same section twice.
    const clean = parsed.filter((id): id is SectionId => known.has(id as SectionId));
    // An empty bar would strand someone on a phone with no navigation at all,
    // so it falls back rather than rendering a row of nothing.
    const unique = [...new Set(clean)];
    return unique.length ? unique : [...DEFAULT_ORDER];
  } catch {
    return [...DEFAULT_ORDER];
  }
}

interface NavState {
  order: SectionId[];
  toggle: (id: SectionId) => void;
  move: (id: SectionId, direction: -1 | 1) => void;
  reset: () => void;
  init: () => void;
}

export const useNavStore = create<NavState>((set, get) => ({
  order: [...DEFAULT_ORDER],

  toggle: (id) => {
    const { order } = get();
    if (order.includes(id)) {
      // An empty bar would leave the app with no way back to the other
      // sections from a phone, so the last one cannot be removed.
      if (order.length === 1) return;
      const next = order.filter((x) => x !== id);
      localStorage.setItem(KEY, JSON.stringify(next));
      set({ order: next });
      return;
    }

    // The bar is full. Slicing here used to silently drop the section being
    // added, so tapping "add" did nothing at all and looked broken.
    if (order.length >= MAX_VISIBLE) return;

    const next = [...order, id];
    localStorage.setItem(KEY, JSON.stringify(next));
    set({ order: next });
  },

  move: (id, direction) => {
    const { order } = get();
    const from = order.indexOf(id);
    if (from === -1) return;
    const to = from + direction;
    if (to < 0 || to >= order.length) return;

    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    localStorage.setItem(KEY, JSON.stringify(next));
    set({ order: next });
  },

  reset: () => {
    localStorage.setItem(KEY, JSON.stringify(DEFAULT_ORDER));
    set({ order: [...DEFAULT_ORDER] });
  },

  init: () => {
    set({ order: parse(localStorage.getItem(KEY)) });
  },
}));