import type { CheerioAPI } from 'cheerio';
import * as cheerio from 'cheerio';

export interface ParsedRecipe {
  title: string;
  ingredients: string[];
  instructions: string[];
  cookingTime?: number;
  image?: string;
  source: 'json-ld' | 'microdata' | 'heuristic';
}

const NBSP = /[\u00a0\u2007\u202f]/g;

/** Collapse all whitespace so list items read as single clean lines. */
function normalize(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(NBSP, ' ').replace(/\s+/g, ' ').trim();
}

function unique(list: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** Noise that recipe pages mix into their ingredient and step lists. */
const NOISE = /^(skipt?o? recipe|перемотать|показать больше|добавить в (избранное|закладки)|rate this|отзывы|комментарии|read more|show more|see more|реклама)$/i;

function isNoise(item: string): boolean {
  return item.length < 2 || NOISE.test(item);
}

function clean(list: unknown[]): string[] {
  return unique(list.map(normalize).filter((s) => s && !isNoise(s)), 80);
}

/** ISO 8601 duration used by schema.org, e.g. PT1H30M -> 90. */
function parseDuration(value: unknown): number | undefined {
  const text = normalize(value).toUpperCase();
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(text);
  if (!match) return undefined;
  const [, d, h, m] = match;
  if (!d && !h && !m) return undefined;
  return Number(d || 0) * 1440 + Number(h || 0) * 60 + Number(m || 0);
}

/** Flatten @graph / arrays so any nesting level can be searched. */
function flattenLd(value: unknown, depth = 0): Record<string, any>[] {
  if (depth > 6 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((v) => flattenLd(v, depth + 1));
  if (typeof value !== 'object') return [];
  const node = value as Record<string, any>;
  const out: Record<string, any>[] = [node];
  for (const key of ['@graph', 'mainEntity', 'hasPart', 'itemListElement']) {
    if (node[key]) out.push(...flattenLd(node[key], depth + 1));
  }
  return out;
}

function hasType(node: Record<string, any>, type: string): boolean {
  const raw = node['@type'];
  const types = Array.isArray(raw) ? raw : [raw];
  return types.some((t) => typeof t === 'string' && t.toLowerCase().includes(type.toLowerCase()));
}

/**
 * schema.org allows both `"a step"` and `{"@type":"HowToStep","text":"a step"}`
 * for the same field, and recipeIngredient is sometimes shaped like
 * instructions. This walks either shape and pulls the text out.
 */
function stringsFromLd(value: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown, depth = 0) => {
    if (depth > 5 || node == null) return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
      return;
    }
    if (typeof node === 'string') {
      out.push(normalize(node));
      return;
    }
    if (typeof node !== 'object') return;
    const item = node as Record<string, any>;
    if (typeof item.text === 'string') out.push(normalize(item.text));
    else if (item.itemListElement) walk(item.itemListElement, depth + 1);
  };
  walk(value);
  return out;
}

function fromJsonLd($: CheerioAPI): Omit<ParsedRecipe, 'source'> | null {
  const nodes: Record<string, any>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      nodes.push(...flattenLd(JSON.parse($(el).text())));
    } catch {
      // Malformed JSON-LD is common; other blocks may still work.
    }
  });

  const recipe = nodes.find((n) => hasType(n, 'Recipe'));
  if (!recipe) return null;

  const ingredients = clean(stringsFromLd(recipe.recipeIngredient ?? recipe.ingredients ?? []));
  const instructions = clean(stringsFromLd(recipe.recipeInstructions ?? recipe.instructions));
  const title = normalize(recipe.name);
  if (!ingredients.length && !instructions.length) return null;

  return {
    title,
    ingredients,
    instructions,
    cookingTime: parseDuration(recipe.totalTime ?? recipe.cookTime ?? recipe.prepTime),
    image: imageFromLd(recipe.image) ?? imageFromLd(recipe.thumbnailUrl),
  };
}

function fromMicrodata($: CheerioAPI): Omit<ParsedRecipe, 'source'> | null {
  const ingredients = clean($('[itemprop="recipeIngredient"]').toArray().map((el) => $(el).text()));
  const instructionNodes = $('[itemprop="recipeInstructions"]').toArray();

  const instructions = clean(
    instructionNodes.flatMap((el) => {
      const $el = $(el);
      const items = $el.find('li').toArray().map((li) => $(li).text());
      return items.length ? items : [$el.text()];
    })
  );

  if (!ingredients.length && !instructions.length) return null;

  const nameNode = $('[itemprop="name"]').first();
  return {
    title: nameNode.length ? normalize(nameNode.text()) : '',
    ingredients,
    instructions,
    cookingTime: parseDuration($('[itemprop="totalTime"]').attr('content')),
    image: imageFromLd($('[itemprop="image"]').attr('content')),
  };
}

const INGREDIENT_HINT = /(ингредиент|ingredient|состав|продукт)/i;
const INSTRUCTION_HINT = /(приготовлен|инструкц|ход действия|рецепт|готовка|instruction|direction|method|step|how to)/i;

function pickLongest(candidates: string[][], min: number): string[] {
  let best: string[] = [];
  for (const list of candidates) {
    const cleaned = clean(list);
    if (cleaned.length >= min && cleaned.length > best.length) best = cleaned;
  }
  return best;
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'b', 'strong', 'summary']);
/** How far past a heading to keep looking for its list. */
const LOOKAHEAD = 30;

const SIDEBAR_TAGS = 'nav, aside, header, footer, script, style, noscript, form, iframe';
const QUANTITY = /\d/;
const UNIT = /(г|кг|мг|мл|л|шт|ст|ч\.?\s*л|стак|пуч|головк|кг\.?)/i;

/**
 * Restrict parsing to the page body proper. Without this, any recipe page with a
 * sidebar of "other recipes" or an SEO block yields those lists instead: a real
 * report imported a page whose ingredients were things like "Чем питаться в
 * жару?" because the popular-recipes rail was parsed as the recipe.
 */
function scopeToContent($: CheerioAPI): void {
  // Deliberately narrow: an earlier version also matched ".content", which on one
  // fixture hit a <ul class="content"> and deleted the h1 along with everything
  // else outside that list.
  const main = $('main, article, [role="main"]').first();
  if (main.length) {
    const keep = main.find('*').add(main);
    $('body > *').not(keep).remove();
    return;
  }
  $(SIDEBAR_TAGS).remove();
}

/**
 * Score how much a candidate list looks like ingredients rather than navigation,
 * reviews or SEO copy. Questions and long sentences are strong negatives; an
 * amount with a unit is the strongest positive.
 */
function ingredientScore(items: string[]): number {
  if (items.length < 2) return -Infinity;
  let score = Math.min(items.length, 12) / 2;
  for (const item of items) {
    if (item.includes('?')) score -= 3;
    if (item.length > 120) score -= 2;
    if (item.length < 3) score -= 1;
    if (QUANTITY.test(item)) score += 1;
    if (UNIT.test(item)) score += 1;
  }
  return score;
}

function instructionScore(items: string[]): number {
  if (items.length < 2) return -Infinity;
  let score = Math.min(items.length, 12) / 2;
  for (const item of items) {
    if (item.length < 8) score -= 1;
    if (item.length > 600) score -= 2;
    if (/^\d+[.)]/.test(item)) score += 1;
  }
  return score;
}

function pickBest(candidates: string[][], score: (items: string[]) => number): string[] {
  let best: string[] = [];
  let bestScore = -Infinity;
  for (const list of candidates) {
    const cleaned = clean(list);
    const value = score(cleaned);
    if (value > bestScore) {
      bestScore = value;
      best = cleaned;
    }
  }
  return bestScore === -Infinity ? [] : best;
}

/**
 * og:title first: sites set it to the dish name, whereas an h1 is often a
 * promo banner ("Лучшие рецепты недели (113)"), and that banner can be well
 * under any sensible length limit. h1 and <title> are the fallbacks.
 */
function titleFrom($: CheerioAPI): string {
  const og = $('meta[property="og:title"]').attr('content');
  if (normalize(og)) return normalize(og);

  const h1 = normalize($('h1').first().text());
  if (h1) return h1;

  const raw = normalize($('title').first().text());
  return normalize(raw.split(/\s+[|—–-]\s+/)[0]) || raw;
}

function textsOf($: CheerioAPI, elements: unknown[]): string[] {
  return elements.map((el) => $(el as never).text());
}

/**
 * Text belonging to this element alone, not to its descendants. A <div> that
 * only wraps a <span>Ингредиенты</span> has empty own text, so using this to
 * recognise a heading avoids treating every wrapper on the page as one.
 */
function ownText($: CheerioAPI, element: any): string {
  let out = '';
  for (const node of element.childNodes || []) {
    if (node.type === 'text') out += node.data ?? '';
  }
  return normalize(out);
}

function looksLikeHeading($: CheerioAPI, element: any): boolean {
  const tag = String(element.tagName || '').toLowerCase();
  if (HEADING_TAGS.has(tag)) return true;
  // Real sites also label sections with a bare <span> or <div> holding only the
  // caption, so accept an element whose own text is short and looks like one.
  const own = ownText($, element);
  return own.length > 0 && own.length <= 40 && (INGREDIENT_HINT.test(own) || INSTRUCTION_HINT.test(own));
}

/**
 * Walk the document in order rather than using jQuery's nextAll(), which only
 * inspects siblings. Plenty of pages wrap the heading and its list in separate
 * containers, and nextAll() then finds nothing at all.
 */
function fromHeuristics($: CheerioAPI): Omit<ParsedRecipe, 'source'> | null {
  const ingredientCandidates: string[][] = [
    textsOf($, $('[class*="ingredient" i] li, [id*="ingredient" i] li').toArray()),
    textsOf($, $('[class*="ingredient" i] p, [id*="ingredient" i] p').toArray()),
  ];
  const instructionCandidates: string[][] = [
    textsOf($, $('[class*="instruction" i] li, [id*="instruction" i] li').toArray()),
    textsOf($, $('[class*="step" i] li, [id*="step" i] li').toArray()),
    textsOf($, $('[class*="instruction" i] p, [id*="instruction" i] p').toArray()),
  ];

  const flow = $(
    'h1, h2, h3, h4, h5, h6, b, strong, summary, span, ul, ol, p, li, div, table'
  ).toArray();

  for (let i = 0; i < flow.length; i++) {
    const el = flow[i];
    if (!looksLikeHeading($, el)) continue;

    const text = normalize($(el).text());
    if (!text) continue;
    const wantsIngredients = INGREDIENT_HINT.test(text);
    const wantsInstructions = INSTRUCTION_HINT.test(text);
    if (!wantsIngredients && !wantsInstructions) continue;

    // Collect everything that follows until the next heading, skipping the
    // wrapper elements so nested markup does not hide the list.
    const listItems: string[] = [];
    const paragraphs: string[] = [];
    for (let j = i + 1; j < flow.length && j <= i + LOOKAHEAD; j++) {
      const candidate = flow[j];
      const ctag = String(candidate.tagName || '').toLowerCase();
      if (looksLikeHeading($, candidate)) break;

      if (ctag === 'li') {
        listItems.push($(candidate).text());
      } else if (ctag === 'ul' || ctag === 'ol') {
        listItems.push(...textsOf($, $(candidate).find('li').toArray()));
      } else if (ctag === 'p') {
        paragraphs.push($(candidate).text());
      } else if (ctag === 'table') {
        // Many Russian sites use a two-column "ingredient | amount" table.
        const rows = textsOf($, $(candidate).find('tr').toArray());
        for (const row of rows) listItems.push(row);
      }
    }

    if (wantsIngredients) ingredientCandidates.push(listItems.length ? listItems : paragraphs);
    if (wantsInstructions) instructionCandidates.push(listItems.length ? listItems : paragraphs);
  }

  let ingredients = pickBest(ingredientCandidates, ingredientScore);
  const instructions = pickBest(instructionCandidates, instructionScore);

  // Last resort: the most ingredient-looking list on the page.
  if (!ingredients.length) {
    const lists: string[][] = [];
    $('ul, ol').each((_, el) => {
      lists.push(textsOf($, $(el).find('li').toArray()));
    });
    ingredients = pickBest(lists, ingredientScore);
  }

  if (!ingredients.length && !instructions.length) return null;

  return { title: titleFrom($), ingredients, instructions };
}

/** schema.org image is a string, an array, or an object with url/contentUrl. */
function imageFromLd(value: unknown): string | undefined {
  const candidates: unknown[] = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const obj = candidate as Record<string, unknown>;
      for (const key of ['url', 'contentUrl']) {
        const url = obj[key];
        if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url;
      }
    }
  }
  return undefined;
}

function imageFromMeta($: CheerioAPI): string | undefined {
  const candidates = [
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('meta[itemprop="image"]').attr('content'),
    $('link[rel="image_src"]').attr('href'),
  ];
  for (const candidate of candidates) {
    const url = normalize(candidate);
    if (/^https?:\/\//i.test(url)) return url;
  }
  return undefined;
}

export function parseRecipe(html: string): ParsedRecipe | null {
  // Reject stubs and empty shells before spending time on them.
  if (!html || html.length < 120) return null;
  const $ = cheerio.load(html);

  // The image is looked up before scoping, because social tags usually live in
  // the head while the body markup is what needs narrowing down.
  const metaImage = imageFromMeta($);

  const attempts: [Omit<ParsedRecipe, 'source'> | null, ParsedRecipe['source']][] = [
    [fromJsonLd($), 'json-ld'],
    [fromMicrodata($), 'microdata'],
  ];

  for (const [result, source] of attempts) {
    if (!result) continue;
    if (!result.ingredients.length && !result.instructions.length) continue;
    return { ...result, image: result.image ?? metaImage, source };
  }

  scopeToContent($);

  const heuristic = fromHeuristics($);
  if (heuristic && (heuristic.ingredients.length || heuristic.instructions.length)) {
    return { ...heuristic, image: metaImage, source: 'heuristic' };
  }
  return null;
}