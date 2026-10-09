/**
 * Fixture-based checks for the recipe parser. Covers the three markups the
 * extractor supports plus the tricky shapes that schema.org actually uses:
 * @graph containers, HowToStep objects, and HTML-encoded microdata.
 */
const { parseRecipe } = require('../dist/lib/recipeParser');

const cases = [];
const check = (name, html, assertions) => cases.push({ name, html, assertions });

check(
  'schema.org JSON-LD with plain string instructions',
  `<html><head><script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Recipe","name":"Борщ",
   "recipeIngredient":["Свёкла 300 г","Капуста 150 г","Вода 2 л"],
   "recipeInstructions":["Потереть свёклу","Сварить овощи","Добавить капусту"],
   "totalTime":"PT1H20M"}
  </script></head><body></body></html>`,
  (r) =>
    r.source === 'json-ld' &&
    r.title === 'Борщ' &&
    r.ingredients.length === 3 &&
    r.instructions[2] === 'Добавить капусту' &&
    r.cookingTime === 80
);

check(
  'schema.org nested in @graph with HowToStep objects',
  `<html><head><script type="application/ld+json">
  {"@context":"https://schema.org","@graph":[
    {"@type":"WebPage","name":"Страница"},
    {"@type":"Recipe","name":"Сырники",
     "recipeIngredient":[{"@type":"HowToStep","text":"Творог 500 г"}],
     "recipeInstructions":[{"@type":"HowToHowToStepPlaceholder"},
       {"@type":"HowToStep","text":"Смешать творог и муку"},
       {"@type":"HowToStep","text":"Обжарить"}],
     "cookTime":"PT25M"}
  ]}
  </script></head><body></body></html>`,
  (r) =>
    r.source === 'json-ld' &&
    r.title === 'Сырники' &&
    r.ingredients[0] === 'Творог 500 г' &&
    r.instructions.length === 2 &&
    r.instructions[0] === 'Смешать творог и муку' &&
    r.cookingTime === 25
);

check(
  'microdata itemprop attributes',
  `<html><body>
   <h1 itemprop="name">Окрошка</h1>
   <span itemprop="recipeIngredient">Хлеб 1 кусок</span>
   <span itemprop="recipeIngredient">Квашеная капуста 200 г</span>
   <div itemprop="recipeInstructions"><ol><li>Нарезать хлеб</li><li>Залить квасом</li></ol></div>
   </body></html>`,
  (r) =>
    r.source === 'microdata' &&
    r.ingredients.length === 2 &&
    r.instructions.length === 2 &&
    r.instructions[1] === 'Залить квасом'
);

check(
  'heuristic headings with cyrillic wording',
  `<html><body>
   <h1>Гречка с грибами</h1>
   <h2>Ингредиенты</h2>
   <ul><li>Гречка 200 г</li><li>Шампиньоны 150 г</li><li>Соль</li></ul>
   <h2>Приготовление</h2>
   <ol><li>Отварить гречку</li><li>Обжарить грибы</li><li>Смешать</li></ol>
   </body></html>`,
  (r) =>
    r.source === 'heuristic' &&
    r.title === 'Гречка с грибами' &&
    r.ingredients.length === 3 &&
    r.instructions.length === 3
);

check(
  'heuristic falls back to class names without headings',
  `<html><body>
   <div class="recipe-ingredients"><ul><li>Мука 300 г</li><li>Вода 200 мл</li></ul></div>
   <div class="recipe-instructions"><ul><li>Смешать</li><li>Испечь</li></ul></div>
   </body></html>`,
  (r) => r.ingredients.length === 2 && r.instructions.length === 2
);

check(
  'malformed JSON-LD does not break microdata fallback',
  `<html><head><script type="application/ld+json">{ this is not json </script></head>
   <body><span itemprop="recipeIngredient">Соль 1 ч.л.</span>
   <span itemprop="recipeIngredient">Перец</span></body></html>`,
  (r) => r.source === 'microdata' && r.ingredients.length === 2
);

check(
  'duplicates and whitespace are cleaned',
  `<html><head><script type="application/ld+json">
  {"@type":"Recipe","name":"Тест","recipeIngredient":["  Соль  ","Соль","\u00a0Перец\u00a0"],
   "recipeInstructions":["Шаг","  Шаг  "]}
  </script></head><body></body></html>`,
  (r) => r.ingredients.length === 2 && r.instructions.length === 1
);

check('page with no recipe at all returns null', `<html><body><p>Новости</p></body></html>`, () => false);

check('empty input returns null', '', () => false);

let failed = 0;
for (const { name, html, assertions } of cases) {
  const result = parseRecipe(html);
  if (result === null) {
    const expected = name.includes('returns null');
    console.log(`  ${expected ? 'ok  ' : 'FAIL'}  ${name} -> null`);
    if (!expected) failed++;
    continue;
  }
  let ok = false;
  try {
    ok = assertions(result);
  } catch (err) {
    ok = false;
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name} (${result.source}, ${result.ingredients.length} ing, ${result.instructions.length} steps)`);
  if (!ok) {
    failed++;
    console.log('        got:', JSON.stringify(result).slice(0, 220));
  }
}

console.log(failed === 0 ? '\nall parser cases behave as expected' : `\n${failed} case(s) wrong`);
process.exit(failed === 0 ? 0 : 1);