const Parser = require('../src/parser.js').Parser;


test('Should succeed', ()=>{
  expect((new Parser()).scan('SELECT * FROM tbl;'));
});

test('Should work with small caps', ()=>{
  expect((new Parser('select * from tbl;')))
});

test("Should parse with Where", ()=>{
  expect((new Parser('SELECT * FROM tbl WHERE id=1;')));
});

test('Should parse with many cols', ()=>{
  expect((new Parser('SELECT acol_34, _bcol FROM tbl;')));
});

test('Should parse with alias field', ()=>{
  expect((new Parser('SELECT fld as tmp, next as string FROM tbl;')));
})

test('Should parse with alias table', ()=>{
  expect((new Parser('SELECT * FROM tbl as t1;')));
});

test('Should parse with many tables', ()=>{
  expect((new Parser('SELECT f, w, _ FROM tbl, t1;')));
});

test('Should parse with function', ()=>{
  expect((new Parser('SELECT MIN(*) FROM tbl;')));
});

test('Should parse with group by', ()=>{
  expect((new Parser('SELECT text, MIN(*) FROM tbl GROUP BY text;')));
});

test('Should parse with order by', ()=>{
  expect((new Parser('SELECT text FROM tbl ORDER BY text;')));
});

test('Should parse with having', ()=>{
  expect((new Parser('SELECT text FROM tbl HAVING text = "34";')));
});

test('Should parse with limit 1', ()=>{
  expect((new Parser('SELECT text FROM tbl LIMIT 1;')));
});

test('Should parse with limit 1, 20', ()=>{
  expect((new Parser('SELECT text FROM tbl LIMIT 1;')));
});

test('Should parse with limit 1 OFFSET 20', ()=>{
  expect((new Parser('SELECT text FROM tbl LIMIT 1;')));
});

test('Should fail Bad cmd', ()=>{
  expect(()=>{
    (new Parser()).scan('SELCT * FROM tbl;');
  }).toThrow();
});

test('Should fail empty cmd', ()=>{
  expect(()=>{
    (new Parser).scan('');
  }).toThrow();
});

test('Should fail no ; at end', ()=>{
  expect(()=>{
    (new Parser()).scan('SELECT * FROM tbl');
  }).toThrow();
});

test('Should fail bad sql from constructor', ()=>{
  expect(()=>{
    (new Parser('SEL;'));
  }).toThrow();
});



