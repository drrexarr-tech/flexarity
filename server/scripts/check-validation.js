const { optionalText, optionalNumber, optionalAmount } = require('../dist/lib/validation');
const { z } = require('zod');

const schema = z.object({
  title: z.string().min(1),
  description: optionalText(),
  price: optionalAmount(0, 'negative'),
  quantity: optionalNumber(),
  target: optionalAmount(0, 'negative'),
});

const cases = [
  ['absent price',            { title: 'a' },                                  'pass'],
  ['null price',              { title: 'a', price: null },                     'pass'],
  ['empty-string price',      { title: 'a', price: '' },                       'pass'],
  ['numeric price',           { title: 'a', price: 500 },                      'pass'],
  ['string price',            { title: 'a', price: '500' },                    'pass'],
  ['negative price',          { title: 'a', price: -5 },                      'fail'],
  ['null description',        { title: 'a', description: null },               'pass'],
  ['absent description',      { title: 'a' },                                  'pass'],
  ['empty description',       { title: 'a', description: '' },                 'pass'],
  ['absent quantity',         { title: 'a', quantity: null },                  'pass'],
  ['absent target',           { title: 'a' },                                  'pass'],
  ['null target',             { title: 'a', target: null },                    'pass'],
  ['empty missing title',     { price: 10 },                                   'fail'],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  const r = schema.safeParse(input);
  const got = r.success ? 'pass' : 'fail';
  const ok = got === expected;
  if (!ok) failed++;
  const detail = !r.success && expected === 'fail'
    ? ' (' + (r.error.issues[0].message || r.error.issues[0].code) + ')'
    : '';
  console.log(
    (ok ? '  ok  ' : '  FAIL') + '  ' + name.padEnd(24) + ' -> ' + got + (detail || '')
  );
}
console.log(failed === 0 ? '\nall cases behave as expected' : `\n${failed} case(s) wrong`);
process.exit(failed === 0 ? 0 : 1);