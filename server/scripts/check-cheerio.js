const cheerio = require('cheerio');

const $ = cheerio.load('<html><body><h1>Test</h1><ul><li>Соль</li></ul></body></html>');
console.log('cheerio require: OK');
console.log('version:', require('cheerio/package.json').version);
console.log('h1 =', JSON.stringify($('h1').text()));
console.log('li =', JSON.stringify($('li').first().text()));