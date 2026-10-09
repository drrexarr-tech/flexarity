import type { CheerioAPI } from 'cheerio';
import * as cheerio from 'cheerio';

export interface ParsedRecipe {
  title: string;
  ingredients: string[];
  instructions: string[];
  cookingTime?: number;
  image?: string;
  source: 'json-ld' | 'microdata' | 'heuristic';
  /** True when a recipe was found but a part of it is missing. */
  incomplete?: boolean;
  category?: string;
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

/** schema.org often puts the course in a list; take the first usable label. */
function firstString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const text = normalize(raw);
  if (!text || text.length > 60) return undefined;
  return text;
}

function fromJsonLd($: CheerioAPI, pageUrl?: string): Omit<ParsedRecipe, 'source'> | null {
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
    image: imageFromLd(recipe.image, pageUrl) ?? imageFromLd(recipe.thumbnailUrl, pageUrl),
    category: firstString(recipe.recipeCategory ?? recipe.recipeCuisine),
  };
}

function fromMicrodata($: CheerioAPI, pageUrl?: string): Omit<ParsedRecipe, 'source'> | null {
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
    image: imageFromLd($('[itemprop="image"]').attr('content'), pageUrl),
    category: firstString($('[itemprop="recipeCategory"]').attr('content')),
  };
}

const INGREDIENT_HINT = /(ингредиент|ingredient|состав|продукт)/i;
/**
 * "рецепт" was in this pattern and that matched page chrome rather than a
 * section title: russianfood's recipe page opens with <h2>рецепт с фото
 * пошаговый</h2>, and the lookahead from there walked into the comments and
 * returned "цитировать" and author/date lines as the cooking steps. Keep only
 * phrases that actually introduce a method section. "пошагов" is deliberately
 * absent: as an adjective it is part of the same chrome title, and its lookahead
 * then collected the ingredient table instead.
 */
const INSTRUCTION_HINT =
  /(приготовлен|инструкц|ход действия|способ приготов|правила приготов|готовка|instruction|recipe instructions|direction|how to (cook|make|prepare))/i;
/**
 * Heading lines that introduce the ingredient list without being ingredients.
 * No \b here: JS defines a word boundary with \w = [A-Za-z0-9_], and Cyrillic is
 * not \w, so /^(продукты)\b/ never matches "Продукты (на 6 порций)".
 */
const INGREDIENT_HEADING_LINE = /^(продукты|ингредиенты|состав)(\s|\(|$)/i;

/** Section titles and ad slots also carry "step" in their name. */
const NON_STEP_MARKER =
  /(area_?title|title|caption|crumb|banner|fly_|stick|advert|\bad_|_ad\b|comment|otzyv|reply|review|date|author)/i;

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
/** A unit standing on its own. Word boundaries matter: without them "г" matches
 *  inside any Russian word ("пирогов"), which made every page look like a
 *  recipe. */
const UNIT = /(^|\s)(г|кг|мг|мл|л|шт|ст|стак\w*|пуч\w*|головк\w*|щепотк\w*|ч\.?\s*л\.?)(\s|$|\.|,|;)/i;
/** A number followed by a real measure, the signal that a row lists an amount. */
const AMOUNT = /\d+\s*(г|кг|мг|мл|л|шт|ст\.?|стак\w*|пуч\w*|головк\w*|щепотк\w*|ч\.?\s*л\.?)/i;

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
    if (AMOUNT.test(item)) score += 2;
    else if (QUANTITY.test(item)) score += 0.5;
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
 * Cell text for a "ingredient | amount" table row. Joining with a space matters:
 * plain .text() glues the columns into "Овсяные хлопья40 г".
 */
function rowText($: CheerioAPI, row: unknown): string {
  const cells = $(row as never).find('th, td');
  if (!cells.length) return $(row as never).text();
  return cells
    .toArray()
    .map((cell) => $(cell).text().trim())
    .filter(Boolean)
    .join(' ');
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
/**
 * Course or category label for sites that publish no schema.org recipeCategory.
 * russianfood tags each recipe with links such as "Борщ «Классический»" and
 * "Борщ на курином бульоне" in div.tag_recipes; the first one is a reasonable
 * course guess, which is better than leaving the field blank.
 */
function categoryFrom($: CheerioAPI): string | undefined {
  const labelled = $('[class*="tag_recipe" i] a, [class*="category" i] a, [rel="tag"]').first();
  const explicit = $('[itemprop="recipeCategory"], [class*="recipeCategory" i]').first();
  const candidates = [
    firstString(explicit.attr('content') ?? explicit.text()),
    firstString(labelled.text()),
  ];
  return candidates.find(Boolean);
}

function fromHeuristics($: CheerioAPI): Omit<ParsedRecipe, 'source'> | null {
  const ingredientCandidates: string[][] = [];
  const instructionCandidates: string[][] = [];
  // Steps are one element per step, so they have to be gathered into a single
  // candidate: scored individually each list holds one item and is discarded.
  const stepTexts: string[] = [];

  // Class and id names first. russianfood.com recipe pages carry no "Ingredients"
  // heading at all: the list is table.ingr and the method is one div.step_n per
  // step, so heading matching cannot find either without these.
  $('table[class*="ingr" i], table[id*="ingr" i], [class*="ingredient" i], [id*="ingredient" i], [class*="consist" i]').each(
    (_, el) => {
      // These sites nest a layout table inside the recipe table, and the outer
      // row's text is the entire page block. Keep only rows that hold no nested
      // table, otherwise "Продукты (на 6 порций) Говядина - 500 г ..." lands in
      // the ingredient list as one enormous entry.
      const rows = $(el)
        .find('tr')
        .filter((_, row) => $(row).find('table').length === 0)
        .toArray();
      if (rows.length) {
        // "Продукты (на 6 порций)" heads the table but is not an ingredient.
        const values = rows.map((row) => rowText($, row)).filter((row) => !/^(продукты|ингредиенты|состав)\b/i.test(row));
        ingredientCandidates.push(values.filter((row) => !INGREDIENT_HEADING_LINE.test(row)));
        return;
      }
      const items = $(el).find('li').toArray();
      if (items.length) {
        ingredientCandidates.push(textsOf($, items));
        return;
      }
      const paras = $(el).find('p').toArray();
      if (paras.length) ingredientCandidates.push(textsOf($, paras));
    }
  );

  // Keep only the innermost step containers: russianfood wraps each div.step_n
  // inside div.step_images_n, and taking both would repeat every step twice.
  $('[class*="step" i], [id*="step" i], [class*="instruction" i], [id*="instruction" i]').each(
    (_, el) => {
      const $el = $(el);
      const tag = String(el.tagName || '').toLowerCase();
      const marker = `${el.attribs?.class || ''} ${el.attribs?.id || ''}`;
      // A wrapper would double-count, so skip anything holding a nested match.
      if ($el.find('[class*="step" i], [id*="step" i], [class*="instruction" i], [id*="instruction" i]').length) return;
      // "step" also appears in section titles and ad slots. russianfood has
      // div.area_title_stepbystep ("Пошаговый фото рецепт Борщ с говядиной")
      // and div#start_fly_banners_right_step, neither of which is a step.
      if (NON_STEP_MARKER.test(marker)) return;

      const items = $el.find('li').toArray();
      if (items.length) {
        stepTexts.push(...textsOf($, items));
        return;
      }
      const paras = $el.find('p').toArray();
      if (paras.length) {
        stepTexts.push(...textsOf($, paras));
        return;
      }
      if (tag === 'li' || tag === 'p' || tag === 'div') stepTexts.push($el.text());
    }
  );
  if (stepTexts.length) instructionCandidates.push(stepTexts);

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
        for (const row of $(candidate).find('tr').toArray()) listItems.push(rowText($, row));
      }
    }

    if (wantsIngredients) ingredientCandidates.push(listItems.length ? listItems : paragraphs);
    if (wantsInstructions) instructionCandidates.push(listItems.length ? listItems : paragraphs);
  }

  let ingredients = pickBest(ingredientCandidates, ingredientScore)
    // "Продукты (на 6 порций)" introduces the table but is not an ingredient.
    // It can also arrive from the heading path, so filter after selection too.
    .filter((item) => !INGREDIENT_HEADING_LINE.test(item));
  const instructions = pickBest(instructionCandidates, instructionScore);

  // Last resort: the most ingredient-looking list on the page.
  if (!ingredients.length) {
    const lists: string[][] = [];
    $('ul, ol').each((_, el) => {
      lists.push(textsOf($, $(el).find('li').toArray()));
    });
    ingredients = pickBest(lists, ingredientScore);
  }

  return {
    title: titleFrom($),
    ingredients,
    instructions,
    category: categoryFrom($),
    // Surfaced even when empty so the caller can explain the failure instead of
    // storing a half-empty recipe.
    incomplete: !ingredients.length || !instructions.length,
  };
}

/** schema.org image is a string, an array, or an object with url/contentUrl. */
function imageFromLd(value: unknown, baseUrl?: string): string | undefined {
  const candidates: unknown[] = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const url = absoluteImage(candidate, baseUrl);
      if (url) return url;
    }
    if (candidate && typeof candidate === 'object') {
      const obj = candidate as Record<string, unknown>;
      for (const key of ['url', 'contentUrl']) {
        const raw = obj[key];
        if (typeof raw === 'string') {
          const url = absoluteImage(raw, baseUrl);
          if (url) return url;
        }
      }
    }
  }
  return undefined;
}

/**
 * Resolve an image reference against the page it came from. Sites routinely
 * emit protocol-relative or root-relative values: russianfood's og:image is
 * "//www.russianfood.com/dycontent/images_upl/64/big_63397.jpg", which the
 * old absolute-only check discarded, so the photo was never carried over.
 */
function absoluteImage(value: string, baseUrl?: string): string | undefined {
  const raw = normalize(value);
  if (!raw || /^(data|javascript|blob):/i.test(raw)) return undefined;

  if (/^https?:\/\//i.test(raw)) return raw;

  try {
    if (!baseUrl) return raw.startsWith('//') ? `https:${raw}` : undefined;
    return new URL(raw, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function imageFromMeta($: CheerioAPI, baseUrl?: string): string | undefined {
  const candidates = [
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('meta[itemprop="image"]').attr('content'),
    $('link[rel="image_src"]').attr('href'),
  ];
  for (const candidate of candidates) {
    const url = absoluteImage(candidate ?? '', baseUrl);
    if (url) return url;
  }
  return undefined;
}

export function parseRecipe(html: string, pageUrl?: string): ParsedRecipe | null {
  // Reject stubs and empty shells before spending time on them.
  if (!html || html.length < 120) return null;
  const $ = cheerio.load(html);

  // The image is looked up before scoping, because social tags usually live in
  // the head while the body markup is what needs narrowing down.
  const metaImage = imageFromMeta($, pageUrl);

  const attempts: [Omit<ParsedRecipe, 'source'> | null, ParsedRecipe['source']][] = [
    [fromJsonLd($, pageUrl), 'json-ld'],
    [fromMicrodata($, pageUrl), 'microdata'],
  ];

  for (const [result, source] of attempts) {
    if (!result) continue;
    if (!result.ingredients.length && !result.instructions.length) continue;
    return { ...result, image: result.image ?? metaImage, source };
  }

  scopeToContent($);

  const heuristic = fromHeuristics($);

  // A roundup or SEO article links to other recipes and carries keyword lists,
  // not ingredients. Verified on russianfood.com/reading/?post_id=26531: no
  // <ol>, no list item with a measurement, and the sidebar holds links to other
  // recipes (rid=...). Heuristics still find something there, so this gate has
  // to come before accepting their output, otherwise SEO questions such as
  // "Чем питаться в жару?" get saved as ingredients.
  if (!looksLikeRecipePage($)) return null;

  if (heuristic && (heuristic.ingredients.length || heuristic.instructions.length)) {
    return { ...heuristic, image: metaImage, source: 'heuristic' };
  }
  return { title: titleFrom($), ingredients: [], instructions: [], incomplete: true, source: 'heuristic' };
}

/**
 * Cheap structural test for a page that plausibly contains a recipe body.
 * Deliberately structural rather than keyword based: russianfood's roundup
 * mentions "рецепт" fifteen times yet has no ingredients at all.
 */
function looksLikeRecipePage($: CheerioAPI): boolean {
  if ($('[itemprop="recipeIngredient"], [itemprop="recipeInstructions"]').length) return true;

  let measured = 0;
  $('li, td, p').each((_, el) => {
    if (measured >= 2) return;
    if (AMOUNT.test($(el).text())) measured++;
  });
  if (measured >= 2) return true;

  // Numbered or bullet steps in the body are a strong hint even without units.
  return $('ol > li').length >= 2;
}