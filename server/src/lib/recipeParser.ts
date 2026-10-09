import type { CheerioAPI } from 'cheerio';
import * as cheerio from 'cheerio';

export interface ParsedRecipe {
  title: string;
  ingredients: string[];
  instructions: string[];
  cookingTime?: number;
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

function textsOf($: CheerioAPI, elements: unknown[]): string[] {
  return elements.map((el) => $(el as never).text());
}

/** Text of the first list that follows this heading, or its loose paragraphs. */
function afterHeading($: CheerioAPI, heading: ReturnType<CheerioAPI>): string[] {
  const list = heading.nextAll('ul, ol').first();
  if (list.length) {
    const items = textsOf($, list.find('li').toArray());
    if (items.length) return items;
  }
  return textsOf($, heading.nextAll('p, li').toArray());
}

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

  $('h1, h2, h3, h4, h5, h6, b, strong, summary').each((_, el) => {
    const text = normalize($(el).text());
    if (!text) return;
    const $heading = $(el);
    if (INGREDIENT_HINT.test(text)) ingredientCandidates.push(afterHeading($, $heading));
    if (INSTRUCTION_HINT.test(text)) instructionCandidates.push(afterHeading($, $heading));
  });

  let ingredients = pickLongest(ingredientCandidates, 2);
  const instructions = pickLongest(instructionCandidates, 2);

  // Last resort: the longest list on the page is usually the ingredient list.
  if (!ingredients.length) {
    const lists: string[][] = [];
    $('ul, ol').each((_, el) => {
      lists.push(textsOf($, $(el).find('li').toArray()));
    });
    ingredients = pickLongest(lists, 3);
  }

  if (!ingredients.length && !instructions.length) return null;

  return {
    title: normalize($('h1').first().text()),
    ingredients,
    instructions,
  };
}

export function parseRecipe(html: string): ParsedRecipe | null {
  if (!html || html.length < 200) return null;
  const $ = cheerio.load(html);

  const attempts: [Omit<ParsedRecipe, 'source'> | null, ParsedRecipe['source']][] = [
    [fromJsonLd($), 'json-ld'],
    [fromMicrodata($), 'microdata'],
    [fromHeuristics($), 'heuristic'],
  ];

  for (const [result, source] of attempts) {
    if (!result) continue;
    if (!result.ingredients.length && !result.instructions.length) continue;
    return { ...result, source };
  }
  return null;
}