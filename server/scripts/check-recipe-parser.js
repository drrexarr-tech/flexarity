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

check(
  'heuristic finds a list nested in a sibling container',
  // nextAll() sees nothing here: the heading and the list have different parents.
  `<html><body>
   <h1>Окрошка</h1>
   <div class="wrapper"><span>Ингредиенты</span></div>
   <ul class="content"><li>Хлеб 1 кусок</li><li>Квашеная капуста 200 г</li><li>Лук</li></ul>
   <div class="wrapper"><span>Приготовление</span></div>
   <ol class="content"><li>Нарезать хлеб</li><li>Залить квасом</li></ol>
   </body></html>`,
  (r) =>
    r.ingredients.length === 3 &&
    r.instructions.length === 2 &&
    r.ingredients[0] === 'Хлеб 1 кусок'
);

check(
  'heuristic reads a two-column ingredient table',
  `<html><body>
   <h1>Рассольник</h1>
   <h2>Ингредиенты</h2>
   <table><tbody>
     <tr><td>Перловка</td><td>100 г</td></tr>
     <tr><td>Картофель</td><td>2 шт</td></tr>
     <tr><td>Огурец солёный</td><td>1 шт</td></tr>
   </tbody></table>
   <h2>Приготовление</h2>
   <p>Отварить перловку.</p>
   <p>Добавить овощи.</p>
   </body></html>`,
  (r) => r.ingredients.length === 3 && r.instructions.length === 2
);

check(
  'heuristic stops at the next heading instead of bleeding into it',
  `<html><body>
   <h1>Борщ классический</h1>
   <h2>Ингредиенты</h2>
   <ul><li>Свёкла 300 г</li><li>Капуста 150 г</li><li>Вода 2 л</li></ul>
   <h2>Отзывы</h2>
   <ul><li>Отличный рецепт</li><li>Вкусно, готовлю каждую неделю</li></ul>
   </body></html>`,
  (r) => r.ingredients.length === 3 && !r.ingredients.includes('Отличный рецепт')
);

check(
  'ignores SEO keyword blocks and a related-recipes rail',
  // Reproduces a real import that came back with "Чем питаться в жару?" as an
  // ingredient and the site promo banner as the title.
  `<html><head><meta property="og:title" content="Овсяноблин с вареньем"></head><body>
   <div class="promo"><h1>Для уютных моментов. Лучшие рецепты ПИРОГОВ (113)</h1></div>
   <main>
     <article>
       <h1>Овсяноблин с клубничным вареньем</h1>
       <h2>Ингредиенты</h2>
       <ul><li>Овсяные хлопья 40 г</li><li>Мягкий творог 100 г</li><li>Клубничное варенье 2 ч. л.</li></ul>
       <h2>Приготовление</h2>
       <ol><li>Измельчить хлопья в блендере.</li><li>Смешать с творогом.</li><li>Обжарить на сковороде.</li></ol>
     </article>
     <aside><h3>Популярные рецепты</h3>
       <ul><li>Как жарить картошку</li><li>Как вкусно приготовить макароны</li></ul>
     </aside>
     <section class="seo"><h3>Как питаться, чтобы жить дольше</h3>
       <ul><li>Чем питаться в жару?</li><li>10 продуктов, которые делают человека красивее</li></ul>
     </section>
   </main>
   </body></html>`,
  (r) =>
    r.source === 'heuristic' &&
    // og:title wins over the in-article h1 by design: the site declares the dish
    // name there, while an h1 is more often a banner.
    r.title === 'Овсяноблин с вареньем' &&
    r.ingredients.length === 3 &&
    r.ingredients[0] === 'Овсяные хлопья 40 г' &&
    !r.ingredients.some((i) => i.includes('?')) &&
    !r.ingredients.includes('Как жарить картошку') &&
    r.instructions.length === 3
);

check('falls back to og:title when h1 is a long promo banner', 
  `<html><head><meta property="og:title" content="Борщ по-домашнему"></head><body>
   <h1>Для уютных вечеров. Подборка из ста рецептов на любой случай и настроение</h1>
   <h2>Ингредиенты</h2>
   <ul><li>Свёкла 300 г</li><li>Капуста 150 г</li><li>Вода 2 л</li></ul>
   <h2>Приготовление</h2>
   <ol><li>Натереть свёклу.</li><li>Сварить овощи.</li><li>Добавить капусту.</li></ol>
   </body></html>`,
  (r) => r.title === 'Борщ по-домашнему' && r.ingredients.length === 3
);

check('reads the image from schema.org or og:image', 
  `<html><head><meta property="og:image" content="https://cdn.example.com/photo.jpg">
   <script type="application/ld+json">
   {"@type":"Recipe","name":"Сырники","image":["https://cdn.example.com/a.jpg","https://cdn.example.com/b.jpg"],
    "recipeIngredient":["Творог 500 г"],"recipeInstructions":["Смешать"]}
   </script></head><body></body></html>`,
  (r) => r.image === 'https://cdn.example.com/a.jpg'
);

check('image falls back to og:image when schema.org omits it', 
  `<html><head><meta property="og:image" content="https://cdn.example.com/photo.jpg">
   <script type="application/ld+json">
   {"@type":"Recipe","name":"Сырники","image":{"url":"data:image/gif;base64,xx"},
    "recipeIngredient":["Творог 500 г"],"recipeInstructions":["Смешать"]}
   </script></head><body></body></html>`,
  (r) => r.image === 'https://cdn.example.com/photo.jpg'
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