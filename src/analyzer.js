// src/analyzer.js
import * as core from "./core.js";

// ───────────────────────────────────── helpers ──────────────────────────────────
function getRep(node) {
  return node && typeof node.rep === "function" ? node.rep() : node;
}

// 🔧 helper to compare structurally‑identical types
function sameType(a, b) {
  return a === b || String(a) === String(b);
}

// 🔧 helper to fetch the right‑hand expression in op‑chains
const rhs = (c) => getRep(c.children[1] || c.children[c.children.length - 1]);

class Context {
  constructor({
    parent = null,
    locals = new Map(),
    inLoop = false,
    currentFunction = null,
  } = {}) {
    this.parent = parent;
    this.locals = locals;
    this.inLoop = inLoop;
    this.currentFunction = currentFunction;
  }

  add(name, entity) {
    this.locals.set(name, entity);
  }

  lookup(name) {
    if (this.locals.has(name)) return this.locals.get(name);
    if (this.parent) return this.parent.lookup(name);
    throw new Error(`Identifier ${name} not declared`);
  }

  static root() {
    const ctx = new Context({
      locals: new Map(Object.entries(core.standardLibrary)),
    });

    // constants always present
    ctx.add("true", { kind: "BooleanLiteral", value: true, type: core.boolType });
    ctx.add("false", { kind: "BooleanLiteral", value: false, type: core.boolType });
    return ctx;
  }

  newChildContext(props = {}) {
    return new Context({ parent: this, locals: new Map(), ...props });
  }
}

let context; // global for current compilation

// small assertion helpers -------------------------------------------------
function must(cond, msg, { at } = {}) {
  if (cond) return;
  let prefix = "";
  throw new Error(prefix + msg);
}

const mustNotAlreadyBeDeclared = (n, at) =>
  must(!context.locals.has(n), `Identifier ${n} already declared`, at);
const mustBeFound = (e, n, at) => must(!!e, `Identifier ${n} not declared`, at);
const mustHaveNumericType = (e, at, msg = "Expected a number") =>
  must(e.type === core.numType, msg, at);
const mustHaveBooleanType = (e, at) =>
  must(e.type === core.boolType, "Expected a boolean", at);

function mustAllHaveSameType(exprs, at) {
  if (exprs.length < 2) return;
  const t0 = exprs[0].type;
  exprs.forEach((e) => must(sameType(e.type, t0), "All list elems must match", at));
}

function mustBeAssignable(src, { toType }, at) {
  if (src.type === core.anyType || toType === core.anyType) return;
  // 🔧 use structural comparison instead of strict reference
  must(
    sameType(src.type, toType),
    `Cannot assign ${src.type} to ${toType}`,
    at
  );
}

const isMutable = (e) => e?.kind === "Variable" && e.mutable;
const mustBeMutable = (e, at) =>
  must(isMutable(e), "Cannot assign to immutable variable", at);
const mustBeInLoop = (kw, at) =>
  must(context.inLoop, `${kw} used outside of loop`, at);

// ───────────────────────────────────── analyze ──────────────────────────────────
export default function analyze(match) {

  context = Context.root();
  const semantics = match.matcher.grammar.createSemantics();

  semantics.addOperation("rep", {
    // generic fall‑backs ---------------------------------------------------
    _terminal() {
      return this.sourceString;
    },
    _iter(...kids) {
      return kids.map(getRep);
    },
    _nonterminal(...kids) {
      return getRep(kids[0]);
    },

    // ─────────── program ──────────────────────────────────────────────────
    Program_program(statements) {
      return core.program(statements.children.map(getRep));
    },

    // ─────────── declarations ────────────────────────────────────────────
    VarDecl_varDecl(_mk, id, _colon, typeNode, initOpt, _semi) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });

      const varType = getRep(typeNode);
      const variable = core.variable(name, true, varType);

      let init;
      if (initOpt.children.length) {
        init = getRep(initOpt.children[0]);
        if (init.kind === "ListLiteral" && init.elements.length === 0) {
          // empty list literal inherits declared type
          init.type = varType;
        }
        mustBeAssignable(init, { toType: varType }, { at: id });
      } else {
        init = core.emptyInitializer(varType);
      }

      context.add(name, variable);
      return core.variableDeclaration(variable, init);
    },

    Initialiser_init(_eq, exp) {
      return getRep(exp);
    },

    // ─────────── function declarations ───────────────────────────────────
    FunDecl_funDecl(_show, id, paramsNode, retTypeOpt, block) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });

      const outer = context;
      context = context.newChildContext({ inLoop: false });

      let params = getRep(paramsNode);

      // duplicate param check
      const seen = new Set();
      params
        .filter(Boolean) // 🔧 guard against undefined
        .forEach((p) => {
          must(!seen.has(p.name), `Identifier ${p.name} already declared`, { at: id });
          seen.add(p.name);
        });

      const returnType =
        retTypeOpt.children.length > 0 ? getRep(retTypeOpt) : core.voidType;

      const fun = core.fun(
        name,
        params,
        [], // body filled later
        core.functionType(
          params.map((p) => p.type),
          returnType
        )
      );

      // allow recursion
      context.add(name, fun);
      outer.add(name, fun);

      params.forEach((p) => context.add(p.name, p));
      context.currentFunction = fun;

      fun.body = getRep(block);
      context = outer;

      return core.functionDeclaration(fun);
    },

    Params_params(_lp, paramListOpt, _rp) {
      return paramListOpt.children.length ? getRep(paramListOpt.children[0]) : [];
    },
    ParamList_paramList(first, _comma, rest) {
      // 🔧 fallback handles single‑child wrappers created by the grammar
      const arr = [getRep(first)];
      rest.children.forEach((c) => arr.push(getRep(c.children[1] || c.children[0])));
      return arr;
    },
    Param_param(id, _colon, typeNode) {
      return core.variable(id.sourceString, false, getRep(typeNode));
    },

    ReturnType_returnType(_arrow, typeNode) {
      return getRep(typeNode);
    },

    // ─────────── return ──────────────────────────────────────────────────
    ReturnStmt_returnStmt(_give, expOpt, _semi) {
      must(context.currentFunction, "Return used outside of a function", { at: this });
      if (!expOpt.children.length) {
        must(
          context.currentFunction.returnType === core.voidType,
          "Return with no value in non-void function",
          { at: this }
        );
        return core.returnStatement(null);
      }
      const expr = getRep(expOpt.children[0]);
      mustBeAssignable(expr, { toType: context.currentFunction.returnType }, { at: this });
      return core.returnStatement(expr);
    },

    // ─────────── conditionals ────────────────────────────────────────────
    IfStmt_ifStmt(_when, cond, cons, orWhenArr, elseOpt) {
      const test = getRep(cond);
      mustHaveBooleanType(test, { at: cond });

      const consequent = getRep(cons);
      const ors = getRep(orWhenArr);
      let alternate = null;

      if (ors.length) {
        // chain else‑if’s
        alternate = core.ifStatement(ors[0].condition, ors[0].block, null);
        let cur = alternate;
        for (let i = 1; i < ors.length; i++) {
          cur.alternate = core.ifStatement(ors[i].condition, ors[i].block, null);
          cur = cur.alternate;
        }
        if (elseOpt.children.length) cur.alternate = getRep(elseOpt);
      } else if (elseOpt.children.length) {
        alternate = getRep(elseOpt);
      }

      return core.ifStatement(test, consequent, alternate);
    },
    OrWhenClause_orWhenClause(_orWhen, exp, block) {
      return { condition: getRep(exp), block: getRep(block) };
    },

    // ─────────── blocks ──────────────────────────────────────────────────
    Block_block(_l, stmtsOpt, _r) {
      if (!stmtsOpt.children.length) return [];
      const rep = getRep(stmtsOpt.children[0]);
      return Array.isArray(rep) ? rep : [rep];
    },

    // ─────────── loops ───────────────────────────────────────────────────
    LoopForEach_loopForEach(_keep, id, _in, exp, block) {
      const coll = getRep(exp);
      must(
        typeof coll.type === "string" && coll.type.startsWith("list<"),
        "Expected a list",
        { at: exp }
      );
      const elemType = coll.type.slice(5, -1);
      const iterVar = core.variable(id.sourceString, true, elemType);

      context.add(id.sourceString, iterVar);
      const outer = context;
      context = context.newChildContext({ inLoop: true });
      const body = getRep(block);
      context = outer;

      return core.forStatement(iterVar, coll, body);
    },

    LoopWhile_loopWhile(_keep, exp, block) {
      const test = getRep(exp);
      mustHaveBooleanType(test, { at: exp });
      const outer = context;
      context = context.newChildContext({ inLoop: true });
      const body = getRep(block);
      context = outer;
      return core.whileStatement(test, body);
    },

    BreakStmt_breakStmt(_brk, _semi) {
      mustBeInLoop("Break", { at: this });
      return core.breakStatement();
    },
    ContinueStmt_continueStmt(_skip, _semi) {
      mustBeInLoop("Skip", { at: this });
      return core.continueStatement();
    },

    // ─────────── say / print ─────────────────────────────────────────────
    SayStmt_sayStmt(_say, _lp, argsOpt, _rp, _semi) {
      const args = argsOpt.children.length ? getRep(argsOpt.children[0]) : [];
      return core.sayStatement(args);
    },

    // ─────────── assignments ─────────────────────────────────────────────
    AssignValid_assignValid(lhs, _eq, exp, _semi) {
      const left = getRep(lhs);
      const src = getRep(exp);
      mustBeMutable(left, { at: lhs });
      mustBeAssignable(src, { toType: left.type }, { at: lhs });
      return core.assignment(left, src);
    },
    AssignInvalid_assignInvalid(_lit, _eq, _exp, _semi) {
      throw new Error("Invalid assignment");
    },

    // ─────────── indexing ────────────────────────────────────────────────
    IndexedAccess_index(id, _l, idx, _r) {
      const arr = context.lookup(id.sourceString);
      const index = getRep(idx);
      mustHaveNumericType(index, { at: idx });
      return core.subscript(arr, index);
    },

    // ─────────── function calls ──────────────────────────────────────────
    FunCallStatement_funCallStmt(call, _semi) {
      return getRep(call);
    },

    FunCallArgs_funCallArgs(id, _lp, argList, _rp) {
      const fn = context.lookup(id.sourceString);
      mustBeFound(fn, id.sourceString, { at: id });
      must(
        fn.kind === "Function" && fn.type.kind === "FunctionType",
        `${id.sourceString} is not a function`,
        { at: id }
      );

      const args = getRep(argList);
      must(
        fn.type.paramTypes.length === args.length,
        `Expected ${fn.type.paramTypes.length} args but got ${args.length}`,
        { at: id }
      );

      args.forEach((a, i) => {
        const want = fn.type.paramTypes[i];
        if (want === core.numType) {
          mustHaveNumericType(a, { at: id });
        } else {
          mustBeAssignable(a, { toType: want }, { at: id });
        }
      });
      return core.functionCall(fn, args);
    },

    FunCallNoArgs_funCallNoArgs(id, _lp, _rp) {
      const fn = context.lookup(id.sourceString);
      mustBeFound(fn, id.sourceString, { at: id });
      must(
        fn.kind === "Function" && fn.type.kind === "FunctionType",
        `${id.sourceString} is not a function`,
        { at: id }
      );
      must(fn.type.paramTypes.length === 0, "Expected 0 args but got some", { at: id });
      return core.functionCall(fn, []);
    },

    ArgList_argList(first, _comma, rest) {
      const arr = [getRep(first)];
      rest.children.forEach((c) => arr.push(getRep(c.children[1] || c.children[0])));
      mustAllHaveSameType(arr, { at: first });
      return arr;
    },

    // ─────────── try / catch ─────────────────────────────────────────────
    TryStmt_tryStmt(_try, body1, _catch, id, body2) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });

      const outer = context;
      context = context.newChildContext();
      context.add(name, core.variable(name, false, core.anyType));

      const catchBody = getRep(body2);
      context = outer;
      return core.tryCatch(getRep(body1), name, catchBody);
    },

    // ─────────── expressions ─────────────────────────────────────────────
    Exp_exp(e) {
      return getRep(e);
    },

    LogicalOrExp_lor(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((c) => {
        const right = rhs(c); // 🔧
        mustHaveBooleanType(acc, { at: first });
        mustHaveBooleanType(right, { at: first });
        acc = core.binary("or", acc, right, core.boolType);
      });
      return acc;
    },

    LogicalAndExp_land(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((c) => {
        const right = rhs(c); // 🔧
        mustHaveBooleanType(acc, { at: first });
        mustHaveBooleanType(right, { at: first });
        acc = core.binary("and", acc, right, core.boolType);
      });
      return acc;
    },

    EqualityExp_eqExp(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((c) => {
        const op = c.children[0].sourceString;
        const right = rhs(c); // 🔧
        must(
          sameType(acc.type, right.type),
          "Operands must have same type",
          { at: c.children[0] }
        );
        acc = core.binary(op, acc, right, core.boolType);
      });
      return acc;
    },

    RelationalExp_relExp(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((c) => {
        const op = c.children[0].sourceString;
        const right = rhs(c); // 🔧
        must(
          sameType(acc.type, right.type),
          "Operands must have same type",
          { at: c.children[0] }
        );
        acc = core.binary(op, acc, right, core.boolType);
      });
      return acc;
    },

    AdditiveExp_addExp(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((c) => {
        const op = c.children[0].sourceString;
        const right = rhs(c);
      
        acc = core.binary(op, acc, right, acc.type);
      });
      return acc;    
    },

    MultiplicativeExp_mulExp(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((c) => {
        const op = c.children[0].sourceString;
        const right = rhs(c); // 🔧
        mustHaveNumericType(acc, { at: c.children[0] }, "Expected number or string");
        mustHaveNumericType(right, { at: c.children[0] }, "Expected number or string");
        must(
          sameType(acc.type, right.type),
          "Operands must have same type",
          { at: c.children[0] }
        );
        acc = core.binary(op, acc, right, acc.type);
      });
      return acc;
    },

    UnaryExp_unary(opNode, exp) {
      if (opNode.children.length === 0) return getRep(exp);
      const op = opNode.sourceString;
      const operand = getRep(exp);
      if (op === "minus") {
        mustHaveNumericType(operand, { at: exp });
        return core.unary("minus", operand, operand.type);
      }
      mustHaveBooleanType(operand, { at: exp });
      return core.unary("not", operand, core.boolType);
    },

    // primary expressions --------------------------------------------------
    PrimaryExp_parens(_l, e, _r) {
      return getRep(e);
    },
    PrimaryExp_primaryFunCall(call) {
      return getRep(call);
    },
    PrimaryExp_primaryIndex(idx) {
      return getRep(idx);
    },
    PrimaryExp_primaryId(id) {
      const ent = context.lookup(id.sourceString);
      mustBeFound(ent, id.sourceString, { at: id });
      return ent;
    },
    PrimaryExp_primaryFloat(f) {
      return { kind: "NumberLiteral", value: parseFloat(f.sourceString), type: core.numType };
    },
    PrimaryExp_primaryInt(i) {
      return { kind: "NumberLiteral", value: parseInt(i.sourceString, 10), type: core.numType };
    },
    PrimaryExp_primaryString(str) {
      return {
        kind: "StringLiteral",
        value: str.sourceString.slice(1, -1),
        type: core.textType,
      };
    },
    PrimaryExp_primaryBool(b) {
      return { kind: "BooleanLiteral", value: b.sourceString === "true", type: core.boolType };
    },

    // ─────────── list literals & types ───────────────────────────────────
    ListExp_listExp(_l, elemsOpt, _r) {
      const elems = elemsOpt.children.length ? getRep(elemsOpt.children[0]) : [];
      mustAllHaveSameType(elems, { at: _l });
      const elemType = elems.length ? elems[0].type : core.anyType;
      return core.listLiteral(elems, core.listType(elemType));
    },

    ListType_listTypeSquare(_list, _l, elemTypeNode, _r) {
      const elemT = getRep(elemTypeNode);
      const isBuiltInOrList =
        typeof elemT === "string" &&
        (
          [core.numType, core.boolType, core.textType, core.voidType].includes(elemT) ||
          elemT.startsWith("list<")
        );
      must(isBuiltInOrList, "Type expected", { at: elemTypeNode });
      return core.listType(elemT);
    },
    
    ListType_listTypeAngle(_list, _lt, elemTypeNode, _gt) {
      const elemT = getRep(elemTypeNode);
      const isBuiltInOrList =
        typeof elemT === "string" &&
        (
          [core.numType, core.boolType, core.textType, core.voidType].includes(elemT) ||
          elemT.startsWith("list<")
        );
      must(isBuiltInOrList, "Type expected", { at: elemTypeNode });
      return core.listType(elemT);
    },

    // ─────────── comma separated lists ───────────────────────────────────
    ExpList_expList(first, _comma, rest) {
      const arr = [getRep(first)];
      rest.children.forEach((c) => arr.push(getRep(c.children[1] || c.children[0])));
      mustAllHaveSameType(arr, { at: first });
      return arr;
    },

    // ─────────── (Exp); statement wrapper ────────────────────────────────
    ParenStmt(_l, exp, _r, _semi) {
      return getRep(exp); // ← direct pass-through of expression
    },
    Statement_parenStmt(parenStmt) {
      return getRep(parenStmt);
    },

    // ─────────── basic types ─────────────────────────────────────────────
    BasicType_basicType(tok) {
      switch (tok.sourceString) {
        case "num": return core.numType;
        case "text": return core.textType;
        case "bool": return core.boolType;
        case "void": return core.voidType;
        default: return tok.sourceString;
      }
    },
  });

  // run semantics
  return semantics(match).rep();
}

export { Context };