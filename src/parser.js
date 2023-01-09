const {isObject, isFunction, isString} = require('./helpers.js');

/*
// simplified SQL grammar
stmts             = {(select | update | insert | delete), ';'} ;

selectStmt        = 'SELECT', selectFieldList, 'FROM', selectTableList, [where],
                      [groupBy], [having], [orderBy], [limit] ;

insertStmt        = 'INSERT', 'INTO', tableName, ['(', fieldList, ')'],
                      'VALUES', '(', valueList ')' ;

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
orderByField      = showField, ['DESC' | ASC] ;
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
  'WHERE', 'ORDER', 'INTO','GROUP', 'LIMIT',
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
  tokens.map((t,i)=>[tokens[i], i])),
keywords = tokens.slice(1, tokenKeys['BY']-1),
keywordKeys = Object.fromEntries(
  keywords.map((k,i)=>[tokens[i],i])),
keywdNotCleaned = {
  'ASC':1, 'DESC':2, 'IN':3};


const isDigit = (c) => {
  c = c.charCodeAt(0);
  return c >= 48 && c <= 57
}, isLetter = (c) => {
  c = c.charCodeAt(0)
  return (c >= 65 && c <= 90) ||
         (c >= 97 && c <= 122);
}

class Parser {
  _sqlText = '';
  _pos = -1;
  constructor(sql) {
    this.parse = this._parser();
    if (sql) this.scan(sql);
  }

  scan(text) {
    this._sqlText = text;
    this._pos = -1;
    this.root = this.parse.call(this);
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
      const ch = n.ch.map(m=>w(m));
      return {...n, ch, p:undefined};
    }
    return w(tree);
  }

  _genErrMsg(msg, pos = this._pos) {
    const chAdj = 15,
          startPos = pos - chAdj > 0 ? pos -chAdj : 0,
          padLen = (startPos > 0 ? 3 : 0),
          sqlStr = (startPos > 0 ? '...' : '') +
            this._sqlText.slice(startPos, 50),
          posStr = sqlStr.padStart(
            sqlStr.length + padLen + pos - startPos, '-')
             .slice(0, padLen + pos-startPos) + '^'
    return `${msg} vid pos: ${pos}\n ${sqlStr}\n ${posStr}`;
  }

  // begin lexer
  _advance() {return this._sqlText[++this._pos];}
  _peek() {return this._sqlText[this._pos+1];}
  _rewind(tok) {
    this._pos = tok.pos + tok.str.length-1;
    this._curTok = tok;
  };
  _asTok(pos, tokName) {
    const str = this._sqlText.substring(pos, this._pos+1),
          tok = tokenKeys[tokName];
    if (!tokenKeys[tokName])
      throw new SyntaxError(
        this._genErrMsg(`${str} okänd token`, pos));
    return this._curTok = {tok, str, pos};
  }
  _next() {
    let c, pos, str = '';

    while((c = this._advance())) {
      if (c.charCodeAt(0) < 33 /*'!'*/) { // whitespace
        continue;
      }

      if (pos === undefined) pos = this._pos;

      switch (c) {
      case '"': case "'":
        // läs sträng
        const quot = c; let esc = false;
        while((c = this._advance())) {
          if (c === quot) break;
          esc = c === '\\';
        }
        --this._pos; // don't catch trailing '"'
        const ret = this._asTok(pos+1, 'string');
        ++this._pos;
        return ret;

      case '<': case '>':
        const nc = this._peek();
        if (nc === '=' || (c === '<' && nc === '>')) {
          const op = c + this._advance(),
                tok = tokens[tokenKeys[op]];
          return this._asTok(pos, tok);
        }
        // else fallthrough
      case ';': case ',': case '(': case ')':
      case '=': case ';': case '*':
        return this._asTok(pos, c);
      default:
        if (isDigit(c)) {
          while ((c = this._peek()) &&
                 (c === '.' || isDigit(c)))
            this._advance();
          return this._asTok(pos, 'number');
        } else if (isLetter(c) || c === '_') {
          while ((c = this._peek()) &&
                 (c==='_' || isLetter(c) || isDigit(c)))
            this._advance();
          const str = this._sqlText.substring(pos, this._pos+1),
                tok = tokenKeys[str.toUpperCase()];
          return this._asTok(pos,
            tok < tokenKeys['string'] ?
              str.toUpperCase() : 'litteral');
        }
      }
    }
  }

  // begin parser
  _parser() {
    const _t = this,
          next =  _t._next.bind(_t),
          mkNode = (parent, constructor, children = [])=>{
            return {
              p:parent, type: constructor.name,
              ch: children, end: false, tok:null}
          }, mkEndNode = (node, tok = _t._curTok, vlu) => {
            node.end = true;
            node.tok = tok;
            node.value = isFunction(vlu) ?
             vlu : ()=>tok.str;
          }, chAdd = (p, ch)=>{
            if (isObject(ch)) {
              if (p.ch.indexOf(ch) === -1) {
                p.ch.push(ch);
                ch.p = p;
              }
            } else if (Array.isArray(ch)) {
              ch.forEach(c=>chAdd(p, c));
            }
            return ch
          }, init = () => {
            if (!_t._curTok) _t._curTok = _t._next();
            const tok = _t._curTok;
            return {tok, back: ()=>_t._rewind(tok)};
          }, sqlsh = (fn) => {
            return _sqlsh = (p) => {
              try {return fn(p)} catch(e) {
                if (!(e instanceof SyntaxError))
                  throw e;
              }
            }
          }, andSequence = (fncs, parent)=>{
            return _andSequence = ()=>{
              const chs = [];
              let ch, oks = 0;
              for (const fn of fncs) {
                if (!(ch = fn(parent)))
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
          }, orSequence = (fncs, parent) => {
            return _orSequence = () => {
              const chs = [], {back} = init();
              let ch;
              for (const fn of fncs) {
                if ((ch = fn(parent)))
                  return ch;
                back();
              }
              return false;
            }
          }, repetition = (fn, parent) => {
            return _repetition = ()=>{
              const chs = []; let ch;
              while ((ch = fn(parent))) {
                if (isObject(ch))
                  chs.push(ch);
                else if (Array.isArray(ch))
                  chs.push(...ch);
                else if (ch === true)
                  break; // prevent endless loop on optional
              }
              if (!chs.length)
                err(`Förväntade ${fn.name}`);
              return chs.length > 0 ? chs : null;
            }
          }, optional = (fn, parent) => {
            return _optional = ()=>{
              let ch; const {back} = init();
              if (ch = sqlsh(fn)(parent))
                return ch;

              back();
              return  true;
            }
          }, terminal = (name, parent) =>{
            return _terminal = ()=> {
              const tok = _t._curTok
              if (tok?.tok === tokenKeys[name] ||
                  tok?.str=== name)
              {
                const me = mkNode(parent, terminal)
                mkEndNode(me, tok);
                next();
                return me;
              }
              err(`Förväntade '${name}'`, tok);
            }
          }, err = (msg, tok = _t._curTok)=> {
            lastErr = new SyntaxError(
              _t._genErrMsg(`Parsefel: ${msg}`, tok?.pos));
            throw lastErr;
          }, reErr = (msg, tok) => {
            if (lastErr)
              throw lastErr;
            err(msg, tok);
          }
    let lastErr = null;

    // stmts = {(selectStmt | updateStmt | insertStmt | deleteStmt), ';'} ;
    const stmts = ()=>{
      // reset
      lastErr = null;
      init();

      let ch;

      const root = mkNode(null, stmts);
      const seq = [];
      if (ch = repetition(
          orSequence([
            selectStmt, updateStmt,
            insertStmt, deleteStmt
          ], root)
        , root)()
      )
        chAdd(root, ch);
      else
        err("Förväntade ett SELECT, UPDATE, INSERT eller DELETE statement.")
      if (!terminal(';', root)()) err('Förväntade ;');
      if (!root.ch.length) err('Kan inte parsa SQL uttrycket');
      return root;
    }

    //selectStmt        = 'SELECT', selectFieldList, 'FROM', selectTableList, [where],
    //                  [groupBy], [having], [orderBy], [limit] ;
    const selectStmt = (p)=>{
      let ch;
      const me = mkNode(p, selectStmt);

      if (!sqlsh(terminal('SELECT', me))()) return;

      if (ch = andSequence([
          selectFieldList, terminal('FROM', me), selectTableList,
          optional(where, me),
          optional(groupBy, me), optional(having, me),
          optional(orderBy, me), optional(limit, me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //insertStmt        = 'INSERT', 'INTO', identifier, ['(', fieldList, ')'],
    //                      'VALUES', '(', valueList ')' ;
    const insertStmt = (p) => {
      let ch;
      const me = mkNode(p, insertStmt);

      if (ch = andSequence([
          sqlsh(terminal('INSERT', me),me),
          terminal('INTO', me),
          identifier,
          optional(
            andSequence([
              sqlsh(terminal('(', me), me),
              fieldList,
              sqlsh(terminal(')', me), me)
            ], me)
          , me),
          terminal('VALUES', me),
          terminal('(', me), valueList, terminal(')')
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    // updateStmt        = 'UPDATE', identifier, 'SET', columnValues, [where] ;
    const updateStmt = (p) => {
      let ch;
      const me = mkNode(p, updateStmt);

      if (ch = andSequence([
          sqlsh(terminal('UPDATE', me), me),
          identifier, terminal('SET', me), columnValues,
          optional(where, me),
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    // deleteStmt        = 'DELETE', 'FROM', identifier, [where] ;
    const deleteStmt = (p) => {
      let ch;
      const me = mkNode(p, deleteStmt);

      if (ch = andSequence([
          sqlsh(terminal('DELETE', me), me),
          terminal('FROM', me),
          identifier,
          optional(where, me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //selectFieldList   = selectField, [{',' , selectField}] ;
    const selectFieldList = (p) => {
      let ch;
      const me = mkNode(p, selectFieldList);
      if (ch = andSequence([
          selectField,
          optional(
            repetition(
              andSequence([
                sqlsh(terminal(',', me)),
                selectField
              ]
            , me))
          , me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
      err('Förväntade fält');
    }

//  selectField  = (func | identifier ), [alias]
//               | star ;
    const selectField = (p) => {
      let ch;
      const me = mkNode(p, selectField);
      if (ch = orSequence([
          andSequence([
            orSequence([
              func,
              fieldName
            ], me),
            optional(alias, me),
          ], me),
          star
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    // star              = '*' ;
    const star = (p) => {
      let ch;
      const me = mkNode(p, star);
      if (ch = sqlsh(terminal('*', me), me)()) {
        chAdd(me, ch);
        return me;
      }
    }

    const identifierAsName = (p, fn) => {
      let ch;
      const me = mkNode(p, fn);
      if (ch = identifier(me)) {
        chAdd(me, ch);
        return me;
      }
    }

    // fieldName         = identifier ;
    const fieldName = (p) => {
      return identifierAsName(p, fieldName);
    }

    // func  = funcName, '(', ( fieldName | star ) , ')' ;
    const func = (p) => {
      let ch;
      const me = mkNode(p, func);
      if (ch = andSequence([
          funcName,
          sqlsh(terminal('('), me),
          orSequence([
            fieldName,
            star
          ], me),
          sqlsh(terminal(')'), me),
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    // funcName          = identifier ;
    const funcName = (p) => {
      return identifierAsName(p, funcName);
    }

    //alias             = 'AS', identifier ;
    const alias = (p) => {
      let ch;
      const me = mkNode(p, alias);
      if (ch = andSequence([
          sqlsh(terminal('AS', me), me),
          identifier, optional(alias, me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //selectTableList   = selectTable, [{',', selectTable}] ;
    const selectTableList = (p) => {
      let ch;
      const me = mkNode(p, selectTableList);
      if (ch = andSequence([
          selectTable,
          optional(
            repetition( andSequence([
              sqlsh(terminal(',', me)), selectTable
            ], me)
            , me),
          me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
      err('Förväntade en tabell');
    }

    // selectTable       = tableName, [alias] ;
    const selectTable = (p) => {
      let ch;
      const me = mkNode(p, selectTable);
      if (ch = andSequence([
          tableName,
          optional(alias, me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    // selectTable       = tableName, [alias] ;
    const tableName = (p) => {
      return identifierAsName(p, tableName);
    }

    //where             = 'WHERE', conditionOr,
    const where = (p) => {
      let ch;
      const me = mkNode(p, where);
      if (ch = andSequence([
          terminal('WHERE', me),
          conditionOr,
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    // conditionOr = conditionAnd, ['OR',  conditionAnd] ;
    // conditionAnd = condition, ['AND', condition] ;
    const conditionRouter = (p, caller, condFn, type) => {
      let ch;
      const me = mkNode(p, caller);
      if (ch = andSequence([
          condFn,
          optional(
            andSequence([
              sqlsh(terminal(type, me)),
              condFn
            ], me)
          , me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    // conditionOr = conditionAnd, ['OR',  conditionAnd] ;
    const conditionOr = (p) => {
      return conditionRouter(
        p, conditionOr, conditionAnd, 'OR');
    }

    // conditionAnd = condition, ['AND', condition] ;
    const conditionAnd = (p) => {
      return conditionRouter(
        p, conditionAnd, condition, 'AND');
    }

    //condition         = fieldName, operator, value
    //                  | fieldName, 'IN', '(', value, ')' ;
    const condition = (p) => {
      let ch;
      const me = mkNode(p, condition);
      if (ch = orSequence([
            andSequence([fieldName, operator, value], me),
            andSequence([
              fieldName, terminal('IN', me),
              terminal('(', me), valueList, terminal(')', me)
            ], me)
          ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
      return ch
    }

    //operator          = '<>' | '<=' | '<' | '>=' | '>' | '=' ;
    const operator = (p) => {
      let ch;
      const me = mkNode(p, operator);
      const lt = sqlsh(terminal('<', me)),
            gt = sqlsh(terminal('>', me)),
            eq = sqlsh(terminal('=', me)),
            ne = sqlsh(terminal('<>', me)),
            lteq = sqlsh(terminal('<=', me)),
            gteq = sqlsh(terminal('>=', me))

      if (ch = orSequence([
          lt, gt, eq, ne, lteq, gteq
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
      //err("Förväntade en OPERATOR") TODO enhance error reporting, this breaks
    }

    //value             = string | number ;
    const value = (p) => {
      let ch;
      const me = mkNode(p, value);
      if (ch = orSequence([string, number], me)()) {
        chAdd(me, ch);
        return me;
      }
    }

    //groupBy  = 'GROUP', 'BY', showField, [{',', showField}] ;
    const groupBy = (p) => {
      let ch;
      const me = mkNode(p, groupBy);
      if (ch = andSequence([
          terminal('GROUP', me), terminal('BY', me),
          showField,
          optional(
            repetition(
              andSequence([
                sqlsh(terminal(',', me)), showField
              ], me)
            , me)
          , me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    // showField         = identifier, ['(', (identifier | star) ,')'] ;
    const showField = (p) => {
      let ch;
      const me = mkNode(p, showField);
      if (ch = andSequence([
          identifier, optional(
            andSequence([
              sqlsh(terminal('(', me), me),
              orSequence([
                identifier, star
              ], me),
              sqlsh(terminal(')', me), me)
            ], me)
          )
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //having            = 'HAVING', conditionOr  ;
    const having = (p) => {
      let ch;
      const me = mkNode(p, having);
      if (ch = andSequence([
          terminal('HAVING', me),
          conditionOr
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //orderBy           = 'ORDER', 'BY', orderByField, [{orderByField}] ;
    const orderBy = (p) => {
      let ch;
      const me = mkNode(p, orderBy);
      if (ch = andSequence([
          terminal('ORDER', me), terminal('BY', me),
          orderByField,
          optional(
            repetition(
              andSequence([
                sqlsh(terminal(',',me)), orderByField
              ], me)
            , me)
          , me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //orderByField      = showField, ['DESC' | ASC] ;
    const orderByField = (p) => {
      let ch;
      const me = mkNode(p, orderByField);
      if (ch = andSequence([
          showField, optional(
            orSequence([
              sqlsh(terminal('DESC', me)),
              sqlsh(terminal('ASC', me))
            ], me)
          , me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //limit             = 'LIMIT', integer, [(',' | 'OFFSET'), integer] ;
    const limit = (p) => {
      let ch;
      const me = mkNode(p, limit);
      if (ch = andSequence([
          terminal('LIMIT', me), integer,
          optional(
            andSequence([
              orSequence([
                sqlsh(terminal(',', me), me),
                sqlsh(terminal('OFFSET', me), me)
              ], me),
              integer
            ], me)
          , me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //fieldList        = 'fieldName', [{',', fieldName}] ;
    const fieldList = (p) => {
      let ch;
      const me = mkNode(p, fieldList);
      if (ch = andSequence([
          fieldName, optional(
            repetition(
              andSequence([
                sqlsh(terminal(',', me),me),
                fieldName
              ])
            , me)
          , me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //valueList         = value, [{',', value}] ;
    const valueList = (p) => {
      let ch;
      const me = mkNode(p, valueList);
      if (ch = andSequence([
          value, optional(
            repetition(
              andSequence([sqlsh(terminal(',', me)), value])
            , me)
          , me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //columnValues      = fieldName, '=', value, [{',', fieldName, '=', value}] ;
    const columnValues = (p) => {
      let ch;
      const me = mkNode(p, columnValues);
      if (ch = andSequence([
          fieldName,
          sqlsh(terminal('=', me),me),
          value,
          optional(
            repetition(
              andSequence([
                fieldName,
                sqlsh(terminal(',', me), me),
              value])
            , me)
          , me)
        ], me)()
      ) {
        chAdd(me, ch);
        return me;
      }
    }

    //identifier = litteral ;
    const identifier = (p) => {
      let ch;
      const me = mkNode(p, identifier);
      if (ch = litteral(me)) {
        chAdd(me, ch);
        return me;
      }
    }

    // litteral = ('_'  | letter), [{letter | digit | '_' }]
    const litteral = (p) => {
      let {tok} = init();
      const me = mkNode(p, litteral);
      if (tok.tok === tokenKeys['litteral']) {
        mkEndNode(me, tok);
        next();
        return me;
      }
    }

    //string = "'", [ non "'" ], "'"
    //       | '"', [ non '"' ], '"' ;
    const string = (p) => {
      // qoutes handled in lexer
      let {tok} = init();
      const me = mkNode(p, string);
      if (tok.tok === tokenKeys['string']) {
        mkEndNode(me, tok);
        next();
        return me;
      }
    }

    //number = digit, [{digit}], ['.', [{digit}]] ;
    const number = (p) => {
      let {tok} = init();
      const me = mkNode(p, number);
      if (tok.tok === tokenKeys['number']) {
        mkEndNode(me, tok, ()=>+tok.str);
        next();
        return me;
      }
    }

    //integer = digit, [{digit}] ;
    const integer = (p) => {
      let {tok} = init();
      const me = mkNode(p, integer);
      if (tok.tok === tokenKeys['number'] &&
          tok.str.indexOf('.') === -1)
      {
        mkEndNode(me, tok, ()=>+tok.str);
        next();
        return me;
      }
    }
    // handle in lexer
    //letter = 'A' | 'a' to 'Z' | 'z' ;
    //digit = '0' to '9' ;

    return stmts;
  }

  // remove all terminals if they are not of concern hinseforth
  #cleanTree(root) {
    const walk = (ast) => {
      if (!ast) return;
      // all below = are keywords and separators
      // see: tokens and keyWdNotCleaned
      if (ast.end && ast.tok.tok < tokenKeys['='] &&
          !keywdNotCleaned[ast.tok.str])
      {
        return;
      }

      ast.ch = ast.ch.filter(walk);
      return true;
    }

    return walk(root);
  }

  #flattenTree(root) {
    const byPass = (byPassNode, shiftType)=>{
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
      case 'identifier':  case 'tableName':
      case 'fieldName':   case 'funcName':
      case 'operator':    case 'alias':
      case 'star':  // fallthrough
        return byPass(cst, true);
      case 'value':
        return byPass(cst, false);
      case 'func':
        // move funcName tok into func and remove funcName
        const funcName = cst.ch.find(c=>c.type==='funcName');
        cst.tok = funcName.tok;
        cst.ch.splice(cst.ch.indexOf(funcName),1);
        break;
      }

      return cst;
    }
    return walk(root);
  }
}

module.exports = {Parser, tokens, tokenKeys};
