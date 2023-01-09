const Parser = require('../src/parser.js').Parser;
const console = require('console');



describe('Sucessfull parser queries', ()=>{
  test('Should succeed', ()=>{
    expect((new Parser()).scan('SELECT * FROM tbl;'));
  });

  test('Should work with small caps', ()=>{
    expect((new Parser('select * from tbl;')))
  });

  test("Should parse with Where", ()=>{
    expect((new Parser('SELECT * FROM tbl WHERE id=1;')));
  });

  test('Should parse with many where fields', ()=>{
    expect((new Parser('SELECT text FROM tbl WHERE text = "34" AND t>2 OR g<3;')));
  });

  test('Should parse with where in', ()=>{
    expect((new Parser('SELECT id FROM tbl WHERE id IN (1);')));
  });

  test('Should parse with many where in', ()=>{
    expect((new Parser('SELECT id FROM tbl WHERE id IN (1, \n2 ,3);')));
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

  test('Should parse with group by many columns', ()=>{
    expect((new Parser('SELECT text, MIN(*) FROM tbl GROUP BY text, t, b, c;')));
  });

  test('Should parse with order by', ()=>{
    expect((new Parser('SELECT text FROM tbl ORDER BY text;')));
  });

  test('Should parse with order by DESC', ()=>{
    expect((new Parser('SELECT text FROM tbl ORDER BY text DESC;')));
  });

  test('Should parse with order by ASC', ()=>{
    expect((new Parser('SELECT text FROM tbl ORDER BY text ASC;')));
  });

  test('Should parse with order by many fields', ()=>{
    expect((new Parser('SELECT text FROM tbl ORDER BY text, lp;')));
  });

  test('Should parse with having', ()=>{
    expect((new Parser('SELECT text FROM tbl HAVING text = "34";')));
  });

  test('Should parse with having many fields', ()=>{
    expect((new Parser('SELECT text FROM tbl HAVING text = "34" AND t>2 OR g<3;')));
  });

  test('Should parse with limit 1', ()=>{
    expect((new Parser('SELECT text FROM tbl LIMIT 1;')));
  });

  test('Should parse with limit 1, 20', ()=>{
    expect((new Parser('SELECT text FROM tbl LIMIT 1, 10;')));
  });

  test('Should parse with limit 1 OFFSET 20', ()=>{
    expect((new Parser('SELECT text FROM tbl LIMIT 1 OFFSET 20;')));
  });

  test('Should parse insert', ()=>{
    expect((new Parser('INSERT INTO tbl VALUES (2, 2, 3);')));
  });

  test('Should parse insert', ()=>{
    expect((new Parser('INSERT INTO tbl VALUES (2, 2, 3);')));
  });

  test('Should parse insert with fields', ()=>{
    expect((new Parser('INSERT INTO tbl (_1) VALUES (2);')));
  });

  test('Should parse insert with many fields', ()=>{
    expect((new Parser('INSERT INTO tbl (a,b,c) VALUES (2,2,3);')));
  });

  test('Should parse delete', ()=>{
    expect((new Parser('DELETE FROM tbl;')));
  });

  test('Should parse delete', ()=>{
    expect((new Parser('DELETE FROM tbl WHERE id IN(1,2,3);')));
  });

  test('Should parse with update where =', ()=>{
    expect((new Parser('UPDATE tbl SET text=2 WHERE id=1;')));
  });

  test('Should parse with update with many where =', ()=>{
    expect((new Parser('UPDATE tbl SET text=2 WHERE id=1 AND log="öäå";')));
  });

  test('Should parse with update where in', ()=>{
    expect((new Parser('UPDATE tbl SET text=2 WHERE id IN (1);')));
  });

  test('Should parse with update where many in', ()=>{
    expect((new Parser('UPDATE tbl SET text=2 WHERE id IN (1,2,3,4);')));
  });

});

// ---------------- end successfull --------------------

describe('Fail expected queries', ()=>{
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

  test('Should fail bad select', ()=>{
    expect(()=>{
      (new Parser('SELECT * WHERE is=2;'));
    }).toThrow();
  });

  test('Should fail bad select WHERE', ()=>{
    expect(()=>{
      (new Parser('SELECT * FROM tbl WHERE is===2;'));
    }).toThrow();
  });

  test('Should fail bad select ORDER BY', ()=>{
    expect(()=>{
      (new Parser('SELECT * FROM tbl ORDER BY id and b;'));
    }).toThrow();
  });

  test('Should fail bad select GROUP BY', ()=>{
    expect(()=>{
      (new Parser('SELECT * FROM tbl GROUP BY id DESC;'));
    }).toThrow();
  });

  test('Should fail bad select HAVING', ()=>{
    expect(()=>{
      (new Parser('SELECT * FROM tbl HAVING id;'));
    }).toThrow();
  });

  test('Should fail bad select LIMIT', ()=>{
    expect(()=>{
      (new Parser('SELECT * FROM tbl LIMIT _3;'));
    }).toThrow();
  });

  test('Should fail bad select LIMIT', ()=>{
    expect(()=>{
      (new Parser('SELECT * FROM tbl LIMIT 1 3;'));
    }).toThrow();
  });
});

const filterTree = (tree, props = ['type', 'tok.str'])=>{
  props = props.map(p=>p.split('.')); let pr;
  const walk = (n, pCnt = 0) =>{
    if (!n) return;
    const o = {};
    props.forEach(p=>{
      if (Array.isArray(p) && p.length > pCnt){
        if (pr = p[pCnt])
          o[pr] = p.length-1 > pCnt ? walk(n[pr],pCnt+1) : n[pr];
      } else
        return (n[p] && (o[p]=n[p]))
    });

    if (n.ch && n.ch.length)
      o.ch = n.ch?.map((m)=>walk(m))
    return o;
  }
  return walk(tree);
}

describe('Test CST tree', ()=>{
  test('Should match select tree', ()=>{
    const parser = new Parser();
    const tree = parser.scan(
      'SELECT MIN(*) as a, b, * FROM tbl as t1, t2 WHERE a=1 AND b<>"s" OR c IN (1,2);');
    const t = filterTree(tree);
    console.log('hej')
    console.log(JSON.stringify(t,null,2));
    expect(t).toMatchObject({
      type:'stmts',ch:[{
        type:'selectStmt', ch:[{
          type:'selectFieldList', ch:[{
            type:'selectField', ch:[{
              type:'func', tok:{str:'MIN'}, ch:[{
                type:'star', tok:{str:'*'}
              }]
            },{
              type:'alias', tok:{str:'a'}
            }]
          },{
            type:'selectField', ch:[{
              type:'fieldName', tok:{str:'b'}
            }]
          },{
            type:'selectField',ch:[{
              type:'star', tok:{str:'*'}
            }]
          }]
        },{
          type:'selectTableList', ch:[{
            type: 'selectTable', ch:[{
              type: 'tableName', tok:{str:'tbl'}
            },{
              type: 'alias', tok:{str:'t1'}
            }]
          },{
            type:'selectTable', ch:[{
              type: 'tableName', tok:{str:'t2'}
            }]
          }]
        },{
          type:'where', ch:[{
            type:'conditionOr', ch:[{
              type:'conditionAnd', ch:[{
                type:'condition', ch:[{
                  type:'fieldName', tok:{str:'a'},
                },{
                  type:'operator', tok:{str:'='}
                },{
                  type:'number', tok:{str:'1'}
                }]
              },{
                type:'condition', ch:[{
                  type:'fieldName', tok:{str:'b'}
                },{
                  type:'operator', tok:{str:'<>'}
                },{
                  type:'string', tok:{str:'s'}
                }]
              }]
            },{
              type:'conditionAnd', ch:[{
                type:'condition', ch:[{
                  type:'fieldName', tok:{str:'c'}
                },{
                  type:'terminal', tok:{str:'IN'}
                },{
                  type:'valueList', ch:[{
                    type:'number', tok:{str:'1'}
                  },{
                    type:'number', tok:{str:'2'}
                  }]
                }]
              }]
            }]
          }]
        }]
      }]
    });
  });
});

