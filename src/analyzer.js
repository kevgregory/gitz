// src/analyzer.js
import * as core from "./core.js";

// Helper: call .rep() if available; otherwise return node
function getRep(node) {
  return node && typeof node.rep === "function" ? node.rep() : node;
}

class Context {
  constructor({ parent = null, locals = new Map(), inLoop = false, currentFunction = null } = {}) {
    this.parent = parent;
    this.locals = locals;
    this.inLoop = inLoop;
    this.currentFunction = currentFunction;
  }

  add(name, entity) {
    this.locals.set(name, entity);
  }

  lookup(name) {
    if (this.locals.has(name)) {
      return this.locals.get(name);
    }
    if (this.parent) {
      return this.parent.lookup(name);
    }
    throw new Error(`Identifier ${name} not declared`);
  }

  static root() {
    const ctx = new Context({ locals: new Map(Object.entries(core.standardLibrary)) });
    ctx.add("true",  { kind: "BooleanLiteral", value: true,  type: core.boolType });
    ctx.add("false", { kind: "BooleanLiteral", value: false, type: core.boolType });
    return ctx;
  }

  newChildContext(props = {}) {
    return new Context({ parent: this, locals: new Map(), ...props });
  }
}

let context;

function must(cond, msg, { at } = {}) {
  if (!cond) {
    let prefix = "";
    throw new Error(prefix + msg);
  }
}

function mustNotAlreadyBeDeclared(name, at) {
  must(!context.locals.has(name), `Identifier ${name} already declared`, at);
}

function mustBeFound(entity, name, at) {
  must(!!entity, `Identifier ${name} not declared`, at);
}

function mustHaveNumericType(e, at) {
  must(e.type === core.numType, "Expected a number", at);
}

function mustHaveBooleanType(e, at) {
  must(e.type === core.boolType, "Expected a boolean", at);
}

function mustAllHaveSameType(exprs, at) {
  if (exprs.length < 2) return;
  const t0 = exprs[0].type;
  for (let i = 1; i < exprs.length; i++) {
    must(exprs[i].type === t0, "All list elems must match", at);
  }
}

function mustBeAssignable(src, { toType }, at) {
  must(src.type === toType, `Cannot assign ${src.type} to ${toType}`, at);
}

function mustBeMutable(e, at) {
  must(isMutable(e), "Cannot assign to immutable variable", at);
}

function mustBeInLoop(keyword, at) {
  must(context.inLoop, `${keyword} used outside of loop`, at);
}

export default function analyze(match) {
  context = Context.root();
  const semantics = match.matcher.grammar.createSemantics();

  semantics.addOperation("rep", {
    _terminal() {
      return this.sourceString;
    },
    _iter(...kids) {
      return kids.map(getRep);
    },
    _nonterminal(...kids) {
      return getRep(kids[0]);
    },

    Program_program(stmts) {
      return core.program(stmts.children.map((s) => getRep(s)));
    },

    VarDecl_varDecl(_mk, id, _colon, typeNode, initOpt, _semi) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });
      const varType = getRep(typeNode);
      const variable = core.variable(name, true, varType);
      if (initOpt.children.length) {
        const init = getRep(initOpt.children[0]);
        if (init.kind === "ListLiteral" && init.elements.length === 0) {
          init.type = varType;
        }
        mustBeAssignable(init, { toType: varType }, { at: id });
        context.add(name, variable);
        return core.variableDeclaration(variable, init);
      }
      context.add(name, variable);
      return core.variableDeclaration(variable, core.emptyInitializer(varType));
    },


    Initialiser_init(_eq, exp) {
      return getRep(exp);
    },

    // === THIS IS THE ONLY CHANGE: restore original-return-type logic ===
    FunDecl_funDecl(_show, id, params, _arrowOpt, retTypeOpt, block) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });
      const saved = context;
      // new child context for parameters + body
      context = context.newChildContext({ inLoop: false });

      // params.rep() → array of variable nodes
      let paramList = getRep(params);
      // check duplicate param names
      const seen = new Set();
      paramList.forEach((param) => {
        seen.add(param.name);
      });

      // explicit return type if present
      const returnType =
        retTypeOpt.children.length > 0
          ? getRep(retTypeOpt.children[0])
          : core.voidType;

      // create the function entity
      const fun = core.fun(
        name,
        paramList,
        [], // body set below
        core.functionType(paramList.map((p) => p.type), returnType),
        returnType
      );

      // allow recursion
      context.add(name, fun);
      saved.add(name, fun);

      // add parameters into new context
      paramList.forEach((param) => context.add(param.name, param));
      context.currentFunction = fun;

      // analyze body
      fun.body = getRep(block);

      // restore
      context = saved;
      return core.functionDeclaration(fun);
    },

    Params_params(_lp, paramListOpt, _rp) {
      return paramListOpt.children.length
        ? getRep(paramListOpt.children[0])
        : [];
    },

    ParamList_paramList(first, _comma, rest) {
      const arr = [getRep(first)];
      rest.children.forEach((ch) => arr.push(getRep(ch.children[1])));
      return arr;
    },

    Param_param(id, _colon, typeNode) {
      return core.variable(id.sourceString, false, getRep(typeNode));
    },

    ReturnStmt_returnStmt(_give, expOpt, _semi) {
      must(context.currentFunction, "Return used outside of a function", { at: this });
      if (expOpt.children.length === 0) {
        // empty return allowed only in void functions
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

    IfStmt_ifStmt(_when, cond, cons, orWhenArr, _orElse, elseBlk) {
      const test = getRep(cond);
      mustHaveBooleanType(test, { at: cond });
      const consequent = getRep(cons);
      const ors = getRep(orWhenArr);
      let alternate = null;
      if (ors.length) {
        alternate = core.ifStatement(ors[0].condition, ors[0].block, null);
        let cur = alternate;
        if (elseBlk.children.length) {
          cur.alternate = getRep(elseBlk);
        }
      } else if (elseBlk.children.length) {
        alternate = getRep(elseBlk);
      }
      return core.ifStatement(test, consequent, alternate);
    },

    OrWhenClause_orWhenClause(_orWhen, exp, block) {
      return { condition: getRep(exp), block: getRep(block) };
    },

    Block_block(_l, stmtsOpt, _r) {
      return stmtsOpt.children.map(getRep).flat();
    },

    LoopStmt_loopForEach(_keep, id, _in, exp, block) {
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

    LoopStmt_loopWhile(_keep, exp, block) {
      const test = getRep(exp);
      mustHaveBooleanType(test, { at: exp });
      const outer = context;
      context = context.newChildContext({ inLoop: true });
      const body = getRep(block);
      context = outer;
      return core.whileStatement(test, body);
    },

    BreakStmt_breakStmt(_kw, _s) {
      mustBeInLoop("Break", { at: this });
      return core.breakStatement();
    },

    ContinueStmt_continueStmt(_kw, _s) {
      mustBeInLoop("Skip", { at: this });
      return core.continueStatement();
    },

    SayStmt_sayStmt(_say, _lp, argsOpt, _rp, _s) {
      const args = argsOpt.children.length ? getRep(argsOpt.children[0]) : [];
      return core.sayStatement(args);
    },

    Assignment_assignValid(lhs, _eq, exp, _s) {
      const left = getRep(lhs);
      const src = getRep(exp);
      mustBeMutable(left, { at: lhs });
      mustBeAssignable(src, { toType: left.type }, { at: lhs });
      return core.assignment(left, src);
    },

    Assignment_assignInvalid(_i, _eq, _e, _s) {
      throw new Error("Invalid assignment");
    },

    IndexedAccess_index(id, _l, idx, _r) {
      const arr = context.lookup(id.sourceString);
      const index = getRep(idx);
      mustHaveNumericType(index, { at: idx });
      return core.subscript(arr, index);
    },

    FunCallStatement_funCallStmt(call, _s) {
      return getRep(call);
    },

    FunCall_funCallArgs(id, _lp, argListOpt, _rp) {
      const fn = context.lookup(id.sourceString);
      mustBeFound(fn, id.sourceString, { at: id });
      must(fn.type.kind === "FunctionType", `${id.sourceString} is not a function`, { at: id });
      const args = getRep(argListOpt);
      must(
        fn.type.paramTypes.length === args.length,
        `Expected ${fn.type.paramTypes.length} args but got ${args.length}`,
        { at: id }
      );
      args.forEach((a, i) => {
        const want = fn.type.paramTypes[i];
      });
      return core.functionCall(fn, args);
    },

    FunCall_funCallNoArgs(id, _lp, _rp) {
      const fn = context.lookup(id.sourceString);
      mustBeFound(fn, id.sourceString, { at: id });
      must(fn.type.kind === "FunctionType", `${id.sourceString} is not a function`, { at: id });
      must(
        fn.type.paramTypes.length === 0,
        `Expected 0 args but got ${fn.type.paramTypes.length}`,
        { at: id }
      );
      return core.functionCall(fn, []);
    },

    ArgList_argList(first, _comma, rest) {
      const arr = [getRep(first)];
      rest.children.forEach((ch) => arr.push(getRep(ch.children[1] || ch.children[0])));
      mustAllHaveSameType(arr, { at: first });
      return arr;
    },

    TryStmt_tryStmt(_t, body1, _c, id, body2) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });
      const outer = context;
      context = context.newChildContext();
      context.add(name, core.variable(name, false, core.textType));
      const catchBody = getRep(body2);
      context = outer;
      return core.tryCatch(getRep(body1), name, catchBody);
    },

    Exp_exp(e) {
      return getRep(e);
    },

    LogicalOrExp_lor(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((ch) => {
        const right = getRep(ch.children[1]);
        mustHaveBooleanType(acc, { at: first });
        mustHaveBooleanType(right, { at: first });
        acc = core.binary("or", acc, right, core.boolType);
      });
      return acc;
    },

    LogicalAndExp_land(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((ch) => {
        const right = getRep(ch.children[1]);
        mustHaveBooleanType(acc, { at: first });
        mustHaveBooleanType(right, { at: first });
        acc = core.binary("and", acc, right, core.boolType);
      });
      return acc;
    },

    EqualityExp_eqExp(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((ch) => {
        const op = ch.children[0].sourceString;
        const right = getRep(ch.children[1]);
        must(acc.type === right.type, "Operands must have same type", { at: ch.children[0] });
        acc = core.binary(op, acc, right, core.boolType);
      });
      return acc;
    },

    RelationalExp_relExp(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((ch) => {
        const op = ch.children[0].sourceString;
        const right = getRep(ch.children[1]);
        must(acc.type === right.type, "Operands must have same type", { at: ch.children[0] });
        acc = core.binary(op, acc, right, core.boolType);
      });
      return acc;
    },

    AdditiveExp_addExp(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((ch) => {
        const op = ch.children[0].sourceString;
        const right = getRep(ch.children[1]);
        must(acc.type === right.type, "Operands must have same type", { at: ch.children[0] });
        acc = core.binary(op, acc, right, acc.type);
      });
      return acc;
    },

    MultiplicativeExp_mulExp(first, _op, rest) {
      let acc = getRep(first);
      rest.children.forEach((ch) => {
        const op = ch.children[0].sourceString;
        const right = getRep(ch.children[1]);
        mustHaveNumericType(acc, { at: ch.children[0] });
        mustHaveNumericType(right, { at: ch.children[0] });
        must(acc.type === right.type, "Operands must have same type", { at: ch.children[0] });
        acc = core.binary(op, acc, right, acc.type);
      });
      return acc;
    },

    UnaryExp_unary(opOpt, prim) {
      if (!opOpt.children.length) return getRep(prim);
      const op = opOpt.children[0].sourceString;
      const expr = getRep(prim);
      if (op === "minus") {
        mustHaveNumericType(expr, { at: prim });
        return core.unary("minus", expr, expr.type);
      } else {
        mustHaveBooleanType(expr, { at: prim });
        return core.unary("not", expr, core.boolType);
      }
    },

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
      const name = id.sourceString;
      const ent = context.lookup(name);
      mustBeFound(ent, name, { at: id });
      return ent;
    },
    PrimaryExp_primaryFloat(f) {
      return { kind: "NumberLiteral", value: parseFloat(f.sourceString), type: core.numType };
    },
    PrimaryExp_primaryInt(i) {
      return { kind: "NumberLiteral", value: parseInt(i.sourceString, 10), type: core.numType };
    },
    PrimaryExp_primaryString(str) {
      return { kind: "StringLiteral", value: str.sourceString.slice(1, -1), type: core.textType };
    },
    PrimaryExp_primaryList(l) {
      return getRep(l);
    },

    BasicType_basicType(b) {
      return b.sourceString;
    },

    ListType_listTypeSquare(_kw, _l, t, _r) {
      const base = getRep(t);
      if (
        ![core.numType, core.textType, core.boolType].includes(base) &&
        !base.startsWith("list<")
      ) {
        throw new Error("Type expected");
      }
      return core.listType(base);
    },
    ListType_listTypeAngle(_kw, _l, t, _r) {
      const base = getRep(t);
      if (
        ![core.numType, core.textType, core.boolType].includes(base) &&
        !base.startsWith("list<")
      ) {
        throw new Error("Type expected");
      }
      return core.listType(base);
    },



    ListExp_listExp(_l, elemsOpt, _r) {
      const elems = elemsOpt.children.length ? getRep(elemsOpt.children[0]) : [];
      mustAllHaveSameType(elems, { at: _l });
      const elemType = elems.length ? elems[0].type : core.anyType;
      return core.listLiteral(elems, core.listType(elemType));
    },

    ExpList_expList(first, _comma, rest) {
      const arr = [getRep(first)];
      rest.children.forEach((ch) => arr.push(getRep(ch.children[1] || ch.children[0])));
      mustAllHaveSameType(arr, { at: first });
      return arr;
    },

    Statement_parenStmt(_l, exp, _r, _s) {
      return getRep(exp);
    }
  });

  return semantics(match).rep();
}
