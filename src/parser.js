const { isObject, isFunction, isString } = require('./helpers.js');

/*
// simplified SQL grammar
stmts             = {(select | update | insert | delete), ';'} ;

selectStmt        = 'SELECT', selectFieldList, 'FROM', selectTableList, [where],
                      [groupBy], [having], [orderBy], [limit] ;

insertStmt        = 'INSERT', 'INTO', tableName, ['(', fieldList, ')'],
                      'VALUES', '(', valueList, ')' ;

updateStmt        = 'UPDATE', tableName, 'SET', columnValues, [where] ;

deleteStmt        = 'DELETE', 'FROM', tableName, [where] ;

selectFieldList   = selectField, [{',' , selectField}] ;
selectField       = ( fieldName | func ), [alias]
                  | star ;
star              = '*' ;
fieldName         = identifier ;
func              = funcName, '(', ( fieldName | star ) , ')' ;
funcName          = identifier ;
alias             = 'AS', identifier ;
selectTableList   = selectTable, [{',', selectTable}] ;
selectTable       = tableName, [alias] ;
tableName         = identifier ;
where             = 'WHERE', conditionOr,
conditionOr       = conditionAnd, ['OR',  conditionAnd] ;
conditionAnd      = condition, ['AND', condition] ;
condition         = fieldName, operator, value
                  | fieldName, 'IN', '(', valueList, ')' ;
operator          = '<>' | '<=' | '>=' | '<' | '>' | '=' ;
value             = string | number ;
groupBy           = 'GROUP', 'BY', showField, [{',', showField}] ;
showField         = identifier, ['(', (identifier | star) ,')'] ;
having            = 'HAVING', conditionOr  ;
orderBy           = 'ORDER', 'BY', orderByField, [{orderByField}] ;
orderByField      = showField, [orderByASC | orderByDESC] ;
orderByASC        = 'ASC' ;
orderByDESC       = 'DESC' ;
limit             = 'LIMIT', integer, [(',' | 'OFFSET'), integer] ;
fieldList         = 'fieldName', [{',', fieldName}] ;
valueList         = value, [{',', value}] ;
columnValues      = fieldName, '=', value, [{',', fieldName, '=', value}] ;
identifier        = litteral

(* lexer skannar dessa så att de blir terminal nodes *)
litteral          = ('_' | letter), [{letter | digit | '_' }] ;
string            = "'", [ non "'" ], "'"
                  | '"', [ non '"' ], '"' ;
number            = digit, [{digit}], ['.', [{digit}]] ;
integer           = digit, [{digit}] ;
(* hanteras i lexer, finns inte i AST trädet *)
letter            = 'A' | 'a' to 'Z' | 'z' ;
digit             = '0' to '9' ;
*/

const tokens = [null, // dont begin at 0
  'SELECT', 'OFFSET', 'VALUES', 'INSERT',
  'UPDATE', 'DELETE', 'HAVING',
  'WHERE', 'ORDER', 'INTO', 'GROUP', 'LIMIT',
  'FROM', 'DESC', 'ASC', 'SET', 'AND', 'AS',
  'OR', 'IN', 'BY',
  // end of keywords
  ';', ',', '(', ')',
  // end of separators
  '=', '<', '>', '<=', '>=', '<>',
  // end of operators
  '*', 'string', 'number', 'litteral'
],
  tokenKeys = Object.fromEntries(
    tokens.map((t, i) => [tokens[i], i])),
  keywords = tokens.slice(1, tokenKeys['BY'] - 1),
  keywordKeys = Object.fromEntries(
    keywords.map((k, i) => [tokens[i], i])),
  keywdNotCleaned = { 'IN': 1 };


const isDigit = (c) => {
  c = c.charCodeAt(0);
  return c >= 48 && c <= 57
}, isLetter = (c) => {
  c = c.charCodeAt(0)
  return (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122);
}

class Parser {
  #sqlText = '';
  #pos = -1;
  #curTok = null;

  constructor(sql) {
    if (sql) this.scan(sql);
  }

  scan(text) {
    this.#sqlText = text;
    this.#pos = -1;
    this.#curTok = null;
    this.root = this.#stmts();
    this.#cleanTree(this.root);
    this.root = this.#flattenTree(this.root);
    return this.root;
  }

  /**
   * Only usefull for tracing cst tree generation
   * @param {cstNode} [tree]
   * @returns {cstNode} // the tree without parent
   */
  noParentTree(tree = this.root) {
    const w = (n) => {
      const ch = n.ch.map(m => w(m));
      return { ...n, ch, p: undefined };
    }
    return w(tree);
  }

  #genErrMsg(msg, pos = this.#pos) {
    const chAdj = 15,
      startPos = pos - chAdj > 0 ? pos - chAdj : 0,
      padLen = (startPos > 0 ? 3 : 0),
      sqlStr = (startPos > 0 ? '...' : '') +
        this.#sqlText.slice(startPos, 50),
      posStr = sqlStr.padStart(
        sqlStr.length + padLen + pos - startPos, '-')
        .slice(0, padLen + pos - startPos) + '^'
    return `${msg} vid pos: ${pos}\n ${sqlStr}\n ${posStr}`;
  }

  // begin lexer
  #advance() { return this.#sqlText[++this.#pos]; }
  #peek() { return this.#sqlText[this.#pos + 1]; }
  #rewind(tok) {
    this.#pos = tok.pos + tok.str.length - 1;
    this.#curTok = tok;
  };
  #asTok(pos, tokName, str) {
    const tok = tokenKeys[tokName];
    if (!str)
      str = this.#sqlText.substring(pos, this.#pos + 1);
    if (!tokenKeys[tokName])
      throw new SyntaxError(
        this.#genErrMsg(`${str} okänd token`, pos));
    return this.#curTok = { tok, str, pos };
  }
  #next() {
    let c, pos, str = '';

    while ((c = this.#advance())) {
      if (c.charCodeAt(0) < 33 /*'!'*/) { // whitespace
        continue;
      }

      if (pos === undefined) pos = this.#pos;

      switch (c) {
        case '"': case "'":
          // läs sträng
          const quot = c; let esc = false, str = '';
          while ((c = this.#advance())) {
            if (c === quot && !esc) break;
            esc = c === '\\' && !esc;
            if (!esc)
              str += c;
          }
          --this.#pos; // don't catch trailing '"'
          const ret = this.#asTok(pos + 1, 'string', str);
          ++this.#pos;
          return ret;

        case '<': case '>':
          const nc = this.#peek();
          if (nc === '=' || (c === '<' && nc === '>')) {
            const op = c + this.#advance(),
              tok = tokens[tokenKeys[op]];
            return this.#asTok(pos, tok);
          }
        // else fallthrough
        case ';': case ',': case '(': case ')':
        case '=': case ';': case '*':
          return this.#asTok(pos, c);
        default:
          if (isDigit(c)) {
            while ((c = this.#peek()) &&
              (c === '.' || isDigit(c)))
              this.#advance();
            return this.#asTok(pos, 'number');
          } else if (isLetter(c) || c === '_') {
            while ((c = this.#peek()) &&
              (c === '_' || isLetter(c) || isDigit(c)))
              this.#advance();
            const str = this.#sqlText.substring(pos, this.#pos + 1),
              tok = tokenKeys[str.toUpperCase()];
            return this.#asTok(pos,
              tok < tokenKeys['string'] ?
                str.toUpperCase() : 'litteral');
          }
      }
    }
  }

  // begin parser
  // begin parser helper functions
  #mkNode(parent, constructor, children = []) {
    return {
      p: parent, type: constructor.name,
      ch: children, end: false, tok: null
    }
  }
  #mkEndNode(node, tok = this.#curTok, vlu) {
    node.end = true;
    node.tok = tok;
    node.value = isFunction(vlu) ?
      vlu : () => tok.str;
  }
  #chAdd(p, ch) {
    if (isObject(ch)) {
      if (p.ch.indexOf(ch) === -1) {
        p.ch.push(ch);
        ch.p = p;
      }
    } else if (Array.isArray(ch)) {
      ch.forEach(c => this.#chAdd(p, c));
    }
    return ch
  }
  #init() {
    if (!this.#curTok) this.#curTok = this.#next();
    const tok = this.#curTok;
    return { tok, back: () => this.#rewind(tok) };
  }

  #squelsh(fn) {
    return _squelsh = (p) => {
      try { return fn.call(this, p) } catch (e) {
        if (!(e instanceof SyntaxError))
          throw e;
      }
    }
  }

  #andSequence = (fncs) => {
    return _andSequence = (parent) => {
      const chs = [];
      let ch, oks = 0;
      for (const fn of fncs) {
        if (!(ch = fn.call(this, parent)))
          break;
        if (isObject(ch))
          chs.push(ch);
        else if (Array.isArray(ch))
          chs.push(...ch);
        ++oks;
      }
      if (oks === fncs.length)
        return chs;
    }
  }
  #orSequence(fncs) {
    return _orSequence = (parent) => {
      const chs = [], { back } = this.#init();
      let ch;
      for (const fn of fncs) {
        if ((ch = fn.call(this, parent)))
          return ch;
        back();
      }
      return false;
    }
  }

  #repetition(fn) {
    return _repetition = (parent) => {
      const chs = []; let ch;
      while ((ch = fn.call(this, parent))) {
        if (isObject(ch))
          chs.push(ch);
        else if (Array.isArray(ch))
          chs.push(...ch);
        else if (ch === true)
          break; // prevent endless loop on this.#optional
      }
      if (!chs.length)
        this.#err(`Förväntade ${fn.name}`);
      return chs.length > 0 ? chs : null;
    }
  }

  #optional(fn) {
    return _optional = (parent) => {
      let ch; const { back } = this.#init();
      if (ch = this.#squelsh(fn)(parent))
        return ch;

      back();
      return true;
    }
  }
  #terminal(name, expect = false) {
    return _terminal = (parent) => {
      const tok = this.#curTok
      if (tok?.tok === tokenKeys[name] ||
        tok?.str === name) {
        const me = this.#mkNode(parent, this.#terminal)
        this.#mkEndNode(me, tok);
        this.#next();
        return me;
      }
      if (expect)
        this.#err(`Förväntade '${name}'`, tok);
    }
  }

  #err(msg, tok = this.#curTok) {
    throw new SyntaxError(
      this.#genErrMsg(`Parsefel: ${msg}`, tok?.pos));
  }

  // begin recursive decent functions

  // stmts = {(selectStmt | updateStmt | insertStmt | deleteStmt), ';'} ;
  #stmts() {
    // reset
    this.#init();

    let ch;

    const root = this.#mkNode(null, this.#stmts);
    const seq = [];
    if (ch = this.#repetition(
      this.#orSequence([
        this.#selectStmt,
        this.#updateStmt,
        this.#insertStmt,
        this.#deleteStmt
      ])
    )(root)
    )
      this.#chAdd(root, ch);
    else
      this.#err("Förväntade ett SELECT, UPDATE, INSERT eller DELETE statement.")
    this.#terminal(';', true)(root)
    if (!root.ch.length)
      this.#err('Kan inte parsa SQL uttrycket');
    return root;
  }

  //selectStmt        = 'SELECT', selectFieldList, 'FROM', selectTableList, [where],
  //                  [groupBy], [having], [orderBy], [limit] ;
  #selectStmt(p) {
    let ch;
    const me = this.#mkNode(p, this.#selectStmt);

    if (ch = this.#andSequence([
      this.#terminal('SELECT'),
      this.#selectFieldList,
      this.#terminal('FROM', true),
      this.#selectTableList,
      this.#optional(this.#where),
      this.#optional(this.#groupBy),
      this.#optional(this.#having),
      this.#optional(this.#orderBy),
      this.#optional(this.#limit)
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  //insertStmt        = 'INSERT', 'INTO', tableName, ['(', fieldList, ')'],
  //                      'VALUES', '(', valueList, ')' ;
  #insertStmt(p) {
    let ch;
    const me = this.#mkNode(p, this.#insertStmt);

    if (ch = this.#andSequence([
      this.#terminal('INSERT'),
      this.#terminal('INTO', true),
      this.#tableName,
      this.#optional(
        this.#andSequence([
          this.#terminal('('),
          this.#fieldList,
          this.#terminal(')', true)
        ])
      ),
      this.#terminal('VALUES', true),
      this.#terminal('(', true),
      this.#valueList,
      this.#terminal(')', true)
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // updateStmt        = 'UPDATE', tableName, 'SET', columnValues, [where] ;
  #updateStmt(p) {
    let ch;
    const me = this.#mkNode(p, this.#updateStmt);

    if (ch = this.#andSequence([
      this.#terminal('UPDATE'),
      this.#tableName,
      this.#terminal('SET', true),
      this.#columnValues,
      this.#optional(this.#where),
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // deleteStmt        = 'DELETE', 'FROM', tableName, [where] ;
  #deleteStmt(p) {
    let ch;
    const me = this.#mkNode(p, this.#deleteStmt);

    if (ch = this.#andSequence([
      this.#terminal('DELETE'),
      this.#terminal('FROM', true),
      this.#tableName,
      this.#optional(this.#where)
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  //selectFieldList   = selectField, [{',' , selectField}] ;
  #selectFieldList(p) {
    let ch;
    const me = this.#mkNode(p, this.#selectFieldList);
    if (ch = this.#andSequence([
      this.#selectField,
      this.#optional(
        this.#repetition(
          this.#andSequence([
            this.#terminal(','),
            this.#selectField
          ]
          ))
      )
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
    this.#err('Förväntade fält');
  }

  //  selectField  = (func | identifier ), [alias]
  //               | star ;
  #selectField = (p) => {
    let ch;
    const me = this.#mkNode(p, this.#selectField);
    if (ch = this.#orSequence([
      this.#andSequence([
        this.#orSequence([
          this.#func,
          this.#fieldName
        ]),
        this.#optional(this.#alias),
      ]),
      this.#star
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // star              = '*' ;
  #star(p) {
    let ch;
    const me = this.#mkNode(p, this.#star);
    if (ch = this.#terminal('*')(me)) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  #identifierAsName(p, fn) {
    let ch;
    const me = this.#mkNode(p, fn);
    if (ch = this.#identifier(me)) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // fieldName         = identifier ;
  #fieldName(p) {
    return this.#identifierAsName(p, this.#fieldName);
  }

  // func  = funcName, '(', ( fieldName | star ) , ')' ;
  #func(p) {
    let ch;
    const me = this.#mkNode(p, this.#func);
    if (ch = this.#andSequence([
      this.#funcName,
      this.#terminal('('),
      this.#orSequence([
        this.#fieldName,
        this.#star
      ]),
      this.#terminal(')'),
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // funcName          = identifier ;
  #funcName(p) {
    return this.#identifierAsName(p, this.#funcName);
  }

  //alias             = 'AS', identifier ;
  #alias(p) {
    let ch;
    const me = this.#mkNode(p, this.#alias);
    if (ch = this.#andSequence([
      this.#terminal('AS'),
      this.#identifier,
      this.#optional(this.#alias)
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  //selectTableList   = selectTable, [{',', selectTable}] ;
  #selectTableList(p) {
    let ch;
    const me = this.#mkNode(p, this.#selectTableList);
    if (ch = this.#andSequence([
      this.#selectTable,
      this.#optional(
        this.#repetition(
          this.#andSequence([
            this.#terminal(','),
            this.#selectTable
          ])
        ),
        me)
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
    this.#err('Förväntade en tabell');
  }

  // selectTable       = tableName, [alias] ;
  #selectTable(p) {
    let ch;
    const me = this.#mkNode(p, this.#selectTable);
    if (ch = this.#andSequence([
      this.#tableName,
      this.#optional(this.#alias)
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // selectTable       = tableName, [alias] ;
  #tableName(p) {
    return this.#identifierAsName(p, this.#tableName);
  }

  //where = 'WHERE', conditionOr,
  #where(p) {
    let ch;
    const me = this.#mkNode(p, this.#where);
    if (ch = this.#andSequence([
      this.#terminal('WHERE'),
      this.#conditionOr,
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // conditionOr = conditionAnd, ['OR',  conditionAnd] ;
  // conditionAnd = condition, ['AND', condition] ;
  #conditionRouter(p, caller, condFn, type) {
    let ch;
    const me = this.#mkNode(p, caller);
    if (ch = this.#andSequence([
      condFn,
      this.#optional(
        this.#andSequence([
          this.#terminal(type),
          condFn
        ])
      )
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // conditionOr = conditionAnd, ['OR',  conditionAnd] ;
  #conditionOr(p) {
    return this.#conditionRouter(
      p, this.#conditionOr, this.#conditionAnd, 'OR');
  }

  // conditionAnd = condition, ['AND', condition] ;
  #conditionAnd(p) {
    return this.#conditionRouter(
      p, this.#conditionAnd, this.#condition, 'AND');
  }

  //condition         = fieldName, operator, value
  //                  | fieldName, 'IN', '(', value, ')' ;
  #condition(p) {
    let ch;
    const me = this.#mkNode(p, this.#condition);
    if (ch = this.#orSequence([
      this.#andSequence([
        this.#fieldName,
        this.#operator,
        this.#value
      ]),
      this.#andSequence([
        this.#fieldName,
        this.#terminal('IN'),
        this.#terminal('('),
        this.#valueList,
        this.#terminal(')')
      ])
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  //operator          = '<>' | '<=' | '<' | '>=' | '>' | '=' ;
  #operator(p) {
    let ch;
    const me = this.#mkNode(p, this.#operator);
    const lt = this.#terminal('<'),
      gt = this.#terminal('>'),
      eq = this.#terminal('='),
      ne = this.#terminal('<>'),
      lteq = this.#terminal('<='),
      gteq = this.#terminal('>=');

    if (ch = this.#orSequence([
      lt, gt, eq, ne, lteq, gteq
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  //value             = string | number ;
  #value(p) {
    let ch;
    const me = this.#mkNode(p, this.#value);
    if (ch = this.#orSequence([
      this.#string,
      this.#number
    ])(me)) {
      this.#chAdd(me, ch);
      return me;
    } else
      this.#err("Expected a value");
  }

  //groupBy  = 'GROUP', 'BY', showField, [{',', showField}] ;
  #groupBy(p) {
    let ch;
    const me = this.#mkNode(p, this.#groupBy);
    if (ch = this.#andSequence([
      this.#terminal('GROUP'),
      this.#terminal('BY', true),
      this.#showField,
      this.#optional(
        this.#repetition(
          this.#andSequence([
            this.#terminal(','),
            this.#showField
          ])
        )
      )
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // showField         = identifier, ['(', (identifier | star) ,')'] ;
  #showField(p) {
    let ch;
    const me = this.#mkNode(p, this.#showField);
    if (ch = this.#andSequence([
      this.#identifier,
      this.#optional(
        this.#andSequence([
          this.#terminal('('),
          this.#orSequence([
            this.#identifier,
            this.#star
          ]),
          this.#terminal(')', true)
        ])
      )
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  //having            = 'HAVING', conditionOr  ;
  #having(p) {
    let ch;
    const me = this.#mkNode(p, this.#having);
    if (ch = this.#andSequence([
      this.#terminal('HAVING'),
      this.#conditionOr
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // orderBy = 'ORDER', 'BY', orderByField, [{orderByField}] ;
  #orderBy(p) {
    let ch;
    const me = this.#mkNode(p, this.#orderBy);
    if (ch = this.#andSequence([
      this.#terminal('ORDER'),
      this.#terminal('BY', true),
      this.#orderByField,
      this.#optional(
        this.#repetition(
          this.#andSequence([
            this.#terminal(','),
            this.#orderByField
          ])
        )
      )
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  //orderByField      = showField, [orderByASC | orderByDESC] ;
  #orderByField(p) {
    let ch;
    const me = this.#mkNode(p, this.#orderByField);
    if (ch = this.#andSequence([
      this.#showField,
      this.#optional(
        this.#orSequence([
          this.#orderByASC,
          this.#orderByDESC
        ])
      )
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // orderByDirection  = 'DESC' | 'ASC' ;
  #orderByDirection(p, caller, type) {
    let ch;
    const me = this.#mkNode(p, caller);
    if (ch = this.#terminal(type)(me)) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // orderByASC = 'ASC' ;
  #orderByASC(p) {
    return this.#orderByDirection(p, this.#orderByASC, 'ASC');
  }

  // orderByDESC = 'DESC' ;
  #orderByDESC(p) {
    return this.#orderByDirection(p, this.#orderByDESC, 'DESC');
  }

  //limit             = 'LIMIT', integer, [(',' | 'OFFSET'), integer] ;
  #limit(p) {
    let ch;
    const me = this.#mkNode(p, this.#limit);
    if (ch = this.#andSequence([
      this.#terminal('LIMIT'),
      this.#integer,
      this.#optional(
        this.#andSequence([
          this.#orSequence([
            this.#terminal(','),
            this.#terminal('OFFSET')
          ]),
          this.#integer
        ])
      )
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  #listRouter(p, caller, type) {
    let ch;
    const me = this.#mkNode(p, caller);
    if (ch = this.#andSequence([
      type,
      this.#optional(
        this.#repetition(
          this.#andSequence([
            this.#terminal(','),
            type
          ])
        )
      )
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  //fieldList        = 'fieldName', [{',', fieldName}] ;
  #fieldList(p) {
    return this.#listRouter(p, this.#fieldList, this.#fieldName);
  }

  //valueList         = value, [{',', value}] ;
  #valueList(p) {
    return this.#listRouter(p, this.#valueList, this.#value);
  }

  //columnValues      = fieldName, '=', value, [{',', fieldName, '=', value}] ;
  #columnValues(p) {
    let ch;
    const me = this.#mkNode(p, this.#columnValues);
    if (ch = this.#andSequence([
      this.#fieldName,
      this.#terminal('='),
      this.#value,
      this.#optional(
        this.#repetition(
          this.#andSequence([
            this.#terminal(','),
            this.#fieldName,
            this.#terminal('='),
            this.#value
          ])
        )
      )
    ])(me)
    ) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  //identifier = litteral ;
  #identifier(p) {
    let ch;
    const me = this.#mkNode(p, this.#identifier);
    if (ch = this.#litteral(me)) {
      this.#chAdd(me, ch);
      return me;
    }
  }

  // litteral = ('_'  | letter), [{letter | digit | '_' }]
  #litteral(p) {
    let { tok } = this.#init();
    const me = this.#mkNode(p, this.#litteral);
    if (tok.tok === tokenKeys['litteral']) {
      this.#mkEndNode(me, tok);
      this.#next();
      return me;
    }
  }

  //string = "'", [ non "'" ], "'"
  //       | '"', [ non '"' ], '"' ;
  #string(p) {
    // qoutes handled in lexer
    let { tok } = this.#init();
    const me = this.#mkNode(p, this.#string);
    if (tok.tok === tokenKeys['string']) {
      this.#mkEndNode(me, tok);
      this.#next();
      return me;
    }
  }

  //number = digit, [{digit}], ['.', [{digit}]] ;
  #number(p) {
    let { tok } = this.#init();
    const me = this.#mkNode(p, this.#number);
    if (tok.tok === tokenKeys['number']) {
      this.#mkEndNode(me, tok, () => +tok.str);
      this.#next();
      return me;
    }
  }

  //integer = digit, [{digit}] ;
  #integer(p) {
    let { tok } = this.#init();
    const me = this.#mkNode(p, this.#integer);
    if (tok.tok === tokenKeys['number'] &&
      tok.str.indexOf('.') === -1) {
      this.#mkEndNode(me, tok, () => +tok.str);
      this.#next();
      return me;
    }
  }

  // handle these in lexer
  //letter = 'A' | 'a' to 'Z' | 'z' ;
  //digit = '0' to '9' ;


  // begin AST clean up
  // remove all terminals if they are not of concern hinseforth
  #cleanTree(root) {
    const walk = (ast) => {
      if (!ast) return;
      // all below = are keywords and separators
      // see: tokens and keyWdNotCleaned
      if (ast.end && ast.tok.tok < tokenKeys['='] &&
        !keywdNotCleaned[ast.tok.str]) {
        return;
      }

      ast.ch = ast.ch.filter(walk);
      return true;
    }

    return walk(root);
  }

  #flattenTree(root) {
    const byPass = (byPassNode, shiftType) => {
      const shiftIn = byPassNode.ch[0];
      byPassNode.p.ch[
        byPassNode.p.ch.indexOf(byPassNode)] = shiftIn;
      shiftIn.p = byPassNode.p;
      if (shiftType)
        shiftIn.type = byPassNode.type;
      return shiftIn;
    }

    const walk = (cst) => {
      if (!cst) return;
      cst.ch.forEach(walk);

      switch (cst.type) {
        case '#identifier': case '#tableName':
        case '#fieldName': case '#funcName':
        case '#operator': case '#alias':
        case '#star':  // fallthrough
          return byPass(cst, true);
        case '#value':
          return byPass(cst, false);
        case '#func':
          // move funcName tok into func and remove funcName
          const funcName = cst.ch.find(c => c.type === '#funcName');
          cst.tok = funcName.tok;
          cst.ch.splice(cst.ch.indexOf(funcName), 1);
          break;
        case '#columnValues':
          // remove = from children
          cst.ch = cst.ch.filter(c => c.type !== '#terminal');
      }

      return cst;
    }
    return walk(root);
  }
}

module.exports = { Parser, tokens, tokenKeys };
