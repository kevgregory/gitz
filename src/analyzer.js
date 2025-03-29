// src/analyzer.js
import * as core from "./core.js";

// Helper: If x is an array with one element, return that element; otherwise, return x.
function unwrap(x) {
  return Array.isArray(x) && x.length === 1 ? x[0] : x;
}

// Helper: Call rep() if available; otherwise, return the node.
function getRep(node) {
  return (node && typeof node.rep === "function") ? node.rep() : node;
}

class Context {
  constructor({ parent = null, locals = new Map(), inLoop = false, currentFunction = null } = {}) {
    this.parent = parent;
    this.locals = locals;
    this.inLoop = inLoop;
    this.currentFunction = currentFunction;
  }

  add(name, entity) {
    if (this.locals.has(name)) {
      throw new Error(`Identifier ${name} already declared`);
    }
    this.locals.set(name, entity);
  }

  lookup(name) {
    if (this.locals.has(name)) {
      return this.locals.get(name);
    }
    if (this.parent) {
      return this.parent.lookup(name);
    }
    throw new Error(`Identifier ${name} is not declared`);
  }

  static root() {
    const ctx = new Context({
      locals: new Map(Object.entries({
        ...core.standardLibrary,
        "π": { kind: "Variable", name: "π", mutable: false, type: core.numType }
      }))
    });
    ctx.add("true", { kind: "BooleanLiteral", value: true, type: core.boolType });
    ctx.add("false", { kind: "BooleanLiteral", value: false, type: core.boolType });
    return ctx;
  }

  newChildContext(props = {}) {
    return new Context({ parent: this, locals: new Map(), ...props });
  }
}

let context;

function must(condition, message, errorLocation) {
  if (!condition) {
    let prefix = "";
    if (errorLocation?.at?.getLineAndColumnMessage) {
      prefix = errorLocation.at.getLineAndColumnMessage();
    }
    throw new Error(`${prefix}${message}`);
  }
}

function mustNotAlreadyBeDeclared(name, at) {
  if (context.locals.has(name)) {
    must(false, `Identifier ${name} already declared`, at);
  }
}

function mustHaveBeenFound(entity, name, at) {
  must(entity, `Identifier ${name} not declared`, at);
}

function mustHaveNumericType(e, at) {
  must(e.type === core.numType, "Expected a number", at);
}

function mustHaveBooleanType(e, at) {
  must(e.type === core.boolType, "Expected a boolean", at);
}

function mustBothHaveSameType(e1, e2, at) {
  must(e1.type === e2.type, "Operands must have same type", at);
}

function mustAllHaveSameType(exprs, at) {
  for (let i = 1; i < exprs.length; i++) {
    mustBothHaveSameType(exprs[0], exprs[i], at);
  }
}

function mustBeAssignable(source, { toType }, at) {
  if (source.type === "any" || toType === "any") return;
  must(source.type === toType, `Cannot assign ${source.type} to ${toType}`, at);
}

function isMutable(e) {
  return e?.kind === "Variable" && e.mutable;
}

function mustBeMutable(e, at) {
  must(isMutable(e), "Cannot assign to immutable variable", at);
}

function mustBeInLoop(statement, at) {
  must(context.inLoop, `${statement} used outside of a loop`, at);
}

export default function analyze(match) {
  if (!match.succeeded()) {
    throw new Error(match.message);
  }

  context = Context.root();
  const semantics = match.matcher.grammar.createSemantics();

  semantics.addOperation("rep", {
    _terminal() {
      return this.sourceString;
    },
    _iter(...children) {
      return children.map(c => getRep(c));
    },
    _nonterminal(...children) {
      return getRep(children[0]);
    },

    Program_program(statementList) {
      return core.program(statementList.children.map(s => getRep(s)));
    },

    VarDecl_varDecl(make, id, colon, type, initOpt, semi) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });
      const varType = getRep(type);
      const variable = core.variable(name, true, varType);
      if (initOpt.children.length > 0) {
        const initializer = getRep(initOpt.children[0]);
        if (initializer.kind === "ListLiteral" && initializer.elements.length === 0) {
          initializer.type = variable.type;
        }
        mustBeAssignable(initializer, { toType: variable.type }, { at: id });
        context.add(name, variable);
        return core.variableDeclaration(variable, initializer);
      }
      context.add(name, variable);
      return core.variableDeclaration(variable, core.emptyInitializer(varType));
    },

    ListDecl_listDecl(make, id, colon, type, initOpt, semi) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });
      const varType = getRep(type);
      const variable = core.variable(name, true, varType);
      if (initOpt.children.length > 0) {
        const initializer = getRep(initOpt.children[0]);
        if (initializer.kind === "ListLiteral" && initializer.elements.length === 0) {
          initializer.type = variable.type;
        }
        mustBeAssignable(initializer, { toType: variable.type }, { at: id });
        context.add(name, variable);
        return core.variableDeclaration(variable, initializer);
      }
      context.add(name, variable);
      return core.variableDeclaration(variable, core.emptyInitializer(varType));
    },

    Initialiser_init(eq, exp) {
      return getRep(exp);
    },

    // Function declaration rule modified to support recursion
    FunDecl_funDecl(show, id, params, arrowOpt, retTypeOpt, block) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });
      const saved = context;
      // Create a new child context for the function's parameters and body.
      context = context.newChildContext({ inLoop: false });
      // Process parameters (without unwrapping)
      let paramList = params.rep();
      if (!Array.isArray(paramList)) {
        paramList = [paramList];
      }
      // Check for duplicate parameter names.
      const seen = new Set();
      paramList.forEach(param => {
        if (seen.has(param.name)) {
          throw new Error(`Identifier ${param.name} already declared`);
        }
        seen.add(param.name);
      });
      const returnType = retTypeOpt.children.length > 0
        ? retTypeOpt.children[0].rep()
        : core.voidType;
      const fun = core.fun(
        name,
        paramList,
        [], // body will be set below
        core.functionType(paramList.map(p => p.type), returnType),
        returnType
      );
      // Add the function to both the child's and parent's context for recursion.
      context.add(name, fun);
      saved.add(name, fun);
      // Add each parameter to the function's child context.
      paramList.forEach(param => context.add(param.name, param));
      context.currentFunction = fun;
      fun.body = getRep(block);
      context = saved;
      return core.functionDeclaration(fun);
    },

    Params_params(open, paramListOpt, close) {
      return paramListOpt.children.length === 0 ? [] : getRep(paramListOpt);
    },

    ParamList_paramList(first, comma, rest) {
      return [getRep(first), ...rest.children.map(child =>
        child.children[1] ? getRep(child.children[1]) : getRep(child)
      )];
    },

    Param_param(id, colon, type) {
      const param = core.variable(id.sourceString, false, getRep(type));
      mustNotAlreadyBeDeclared(param.name, { at: id });
      return param;
    },

    ReturnStmt_returnStmt(give, exp, semi) {
      const rawExpr = getRep(exp);
      const expr = Array.isArray(rawExpr) && rawExpr.length === 1 ? rawExpr[0] : rawExpr;
      must(context.currentFunction, "Return used outside of a function", { at: give });
      const expectedType = context.currentFunction.returnType;
      if (expectedType === core.voidType) {
        throw new Error(`Cannot assign ${expr.type} to void`, { at: give });
      } else {
        mustBeAssignable(expr, { toType: expectedType }, { at: give });
      }
      return core.returnStatement(expr);
    },

    IfStmt_ifStmt(whenKeyword, exp, block, orWhenClauses, _orElse, orElseBlock) {
      const test = getRep(exp);
      mustHaveBooleanType(test, { at: exp });
      const consequent = getRep(block);
      let alternate = null;
      const orWhenArr = getRep(orWhenClauses);
      if (Array.isArray(orWhenArr) && orWhenArr.length > 0) {
        alternate = core.ifStatement(orWhenArr[0].condition, orWhenArr[0].block, null);
        let current = alternate;
        for (let i = 1; i < orWhenArr.length; i++) {
          current.alternate = core.ifStatement(orWhenArr[i].condition, orWhenArr[i].block, null);
          current = current.alternate;
        }
        if (orElseBlock.numChildren > 0) {
          current.alternate = getRep(orElseBlock);
        }
      } else if (orElseBlock.numChildren > 0) {
        alternate = getRep(orElseBlock);
      }
      return core.ifStatement(test, consequent, alternate);
    },

    OrWhenClause_orWhenClause(_orWhen, exp, block) {
      return { condition: getRep(exp), block: getRep(block) };
    },

    Block_block(open, stmtsOpt, close) {
      if (stmtsOpt.children.length === 0) return [];
      let rep = getRep(stmtsOpt.children[0]);
      if (!Array.isArray(rep)) rep = [rep];
      return rep;
    },

    LoopStmt_loopForEach(keep, id, inKeyword, exp, block) {
      const iterName = id.sourceString;
      const collection = getRep(exp);
      const baseType = collection.type.startsWith("list<")
        ? collection.type.slice(5, -1)
        : "any";
      const variable = core.variable(iterName, true, baseType);
      context.add(iterName, variable);
      const saved = context;
      context = context.newChildContext({ inLoop: true });
      const body = getRep(block);
      context = saved;
      return core.forStatement(variable, collection, body);
    },

    LoopStmt_loopWhile(keep, exp, block) {
      const test = getRep(exp);
      mustHaveBooleanType(test, { at: exp });
      const saved = context;
      context = context.newChildContext({ inLoop: true });
      const body = getRep(block);
      context = saved;
      return core.whileStatement(test, body);
    },

    BreakStmt_breakStmt(breakKeyword, semi) {
      mustBeInLoop("Break", { at: breakKeyword });
      return core.breakStatement();
    },

    ContinueStmt_continueStmt(skipKeyword, semi) {
      mustBeInLoop("Skip", { at: skipKeyword });
      return core.continueStatement();
    },

    SayStmt_sayStmt(say, openParen, argsOpt, closeParen, semi) {
      const argsList = argsOpt.children.length > 0 ? getRep(argsOpt.children[0]) : [];
      return core.sayStatement(argsList);
    },

    Assignment_assignValid(lhs, eq, exp, semi) {
      const leftVal = getRep(lhs);
      const source = getRep(exp);
      mustBeMutable(leftVal, { at: lhs });
      mustBeAssignable(source, { toType: leftVal.type }, { at: lhs });
      return core.assignment(leftVal, source);
    },

    Assignment_assignInvalid(intLit, eq, exp, semi) {
      throw new Error("Invalid assignment");
    },

    IndexedAccess_index(id, open, exp, close) {
      const variable = context.lookup(id.sourceString);
      const index = getRep(exp);
      mustHaveNumericType(index, { at: exp });
      return core.subscript(variable, index);
    },

    FunCallStatement_funCallStmt(call, semi) {
      return getRep(call);
    },

    FunCall_funCallArgs(id, open, argListOpt, close) {
      const target = context.lookup(id.sourceString);
      const args = argListOpt.children.length > 0 ? getRep(argListOpt.children[0]) : [];
      must(target.type.kind === "FunctionType", `${id.sourceString} is not a function`, { at: id });
      must(
        target.type.paramTypes.length === args.length,
        `Expected ${target.type.paramTypes.length} arguments but got ${args.length}`,
        { at: id }
      );
      args.forEach((arg, i) => {
        const expected = target.type.paramTypes[i];
        if (expected === core.numType) {
          mustHaveNumericType(arg, { at: id });
        } else {
          mustBeAssignable(arg, { toType: expected }, { at: id });
        }
      });
      return core.functionCall(target, args);
    },

    FunCall_funCallNoArgs(id, open, close) {
      const target = context.lookup(id.sourceString);
      must(target.type.kind === "FunctionType", `${id.sourceString} is not a function`, { at: id });
      must(target.type.paramTypes.length === 0, `Expected 0 arguments but got ${target.type.paramTypes.length}`, { at: id });
      return core.functionCall(target, []);
    },

    ArgList_argList(first, comma, rest) {
      const results = [getRep(first)];
      if (rest.children.length > 0) {
        results.push(...rest.children.map(child =>
          child.children[1] ? getRep(child.children[1]) : getRep(child)
        ));
      }
      if (results.length > 0) {
        mustAllHaveSameType(results, { at: first });
      }
      return results;
    },

    TryStmt_tryStmt(tryKeyword, block1, catchKeyword, id, block2) {
      const errorVar = id.sourceString;
      mustNotAlreadyBeDeclared(errorVar, { at: id });
      const saved = context;
      context = context.newChildContext();
      context.add(errorVar, core.variable(errorVar, false, core.textType));
      const catchBlock = getRep(block2);
      context = saved;
      return core.tryCatch(getRep(block1), errorVar, catchBlock);
    },

    Exp_exp(exp) {
      return getRep(exp);
    },

    LogicalOrExp_lor(first, op, rest) {
      let expr = getRep(first);
      for (const child of rest.children) {
        let right = getRep(child.children[1]);
        mustHaveBooleanType(expr, { at: first });
        mustHaveBooleanType(right, { at: child.children[1] });
        expr = core.binary("or", expr, right, core.boolType);
      }
      return expr;
    },

    LogicalAndExp_land(first, op, rest) {
      let expr = getRep(first);
      for (const child of rest.children) {
        let right = getRep(child.children[1]);
        mustHaveBooleanType(expr, { at: first });
        mustHaveBooleanType(right, { at: child.children[1] });
        expr = core.binary("and", expr, right, core.boolType);
      }
      return expr;
    },

    EqualityExp_eqExp(first, op, rest) {
      let expr = getRep(first);
      for (const child of rest.children) {
        let right = getRep(child.children[1]);
        mustBothHaveSameType(expr, right, { at: child.children[0] });
        expr = core.binary(child.children[0].sourceString, expr, right, core.boolType);
      }
      return expr;
    },

    RelationalExp_relExp(first, op, rest) {
      let expr = getRep(first);
      for (const child of rest.children) {
        let right = getRep(child.children[1]);
        mustBothHaveSameType(expr, right, { at: child.children[0] });
        expr = core.binary(child.children[0].sourceString, expr, right, core.boolType);
      }
      return expr;
    },

    AdditiveExp_addExp(first, op, rest) {
      let expr = getRep(first);
      for (const child of rest.children) {
        let opToken = child.children[0].sourceString;
        let right = getRep(child.children[1]);
        if (opToken === "plus") {
          must(expr.type === core.numType || expr.type === core.textType, "Expected number or string", { at: first });
        } else {
          mustHaveNumericType(expr, { at: first });
        }
        mustBothHaveSameType(expr, right, { at: child.children[0] });
        expr = core.binary(opToken, expr, right, expr.type);
      }
      return expr;
    },

    MultiplicativeExp_mulExp(first, op, rest) {
      let expr = getRep(first);
      for (const child of rest.children) {
        let opToken = child.children[0].sourceString;
        let right = getRep(child.children[1]);
        mustHaveNumericType(expr, { at: first });
        mustHaveNumericType(right, { at: child.children[1] });
        mustBothHaveSameType(expr, right, { at: child.children[0] });
        expr = core.binary(opToken, expr, right, expr.type);
      }
      return expr;
    },

    UnaryExp_unary(opOpt, primary) {
      if (opOpt.children.length === 0) return getRep(primary);
      const op = opOpt.children[0].sourceString;
      const expr = getRep(primary);
      if (op === "minus") {
        mustHaveNumericType(expr, { at: primary });
        return core.unary("minus", expr, expr.type);
      }
      if (op === "not") {
        mustHaveBooleanType(expr, { at: primary });
        return core.unary("not", expr, core.boolType);
      }
      throw new Error(`Unsupported unary operator ${op}`);
    },

    PrimaryExp_parens(open, exp, close) {
      return getRep(exp);
    },

    PrimaryExp_primaryFunCall(call) {
      return getRep(call);
    },

    PrimaryExp_primaryIndex(indexed) {
      return getRep(indexed);
    },

    PrimaryExp_primaryId(id) {
      const name = id.sourceString;
      const entity = context.lookup(name);
      mustHaveBeenFound(entity, name, { at: id });
      return entity;
    },

    PrimaryExp_primaryFloat(floatLit) {
      return {
        kind: "NumberLiteral",
        value: parseFloat(floatLit.sourceString),
        type: core.numType
      };
    },

    PrimaryExp_primaryInt(intLit) {
      return {
        kind: "NumberLiteral",
        value: parseInt(intLit.sourceString, 10),
        type: core.numType
      };
    },

    PrimaryExp_primaryString(str) {
      return {
        kind: "StringLiteral",
        value: str.sourceString.slice(1, -1),
        type: core.textType
      };
    },

    PrimaryExp_primaryList(listExp) {
      return getRep(listExp);
    },

    PrimaryExp_primaryBool(boolLit) {
      return {
        kind: "BooleanLiteral",
        value: boolLit.sourceString === "true",
        type: core.boolType
      };
    },

    BasicType_basicType(basic) {
      return basic.sourceString;
    },

    ListType_listTypeSquare(listKeyword, open, typeNode, close) {
      const base = getRep(typeNode);
      if (![core.numType, core.textType, core.boolType].includes(base) &&
          !base.startsWith("list<")) {
        throw new Error("Type expected");
      }
      return core.listType(base);
    },

    ListType_listTypeAngle(listKeyword, open, typeNode, close) {
      const base = getRep(typeNode);
      if (![core.numType, core.textType, core.boolType].includes(base) &&
          !base.startsWith("list<")) {
        throw new Error("Type expected");
      }
      return core.listType(base);
    },

    FloatLit_floatFull(whole, point, fraction, expPart) {
      return {
        kind: "NumberLiteral",
        value: parseFloat(whole.sourceString + point.sourceString + fraction.sourceString),
        type: core.numType
      };
    },

    FloatLit_floatTrailingDot(whole, point, expPart) {
      return {
        kind: "NumberLiteral",
        value: parseFloat(whole.sourceString + point.sourceString),
        type: core.numType
      };
    },

    FloatLit_floatLeadingDot(point, fraction, expPart) {
      return {
        kind: "NumberLiteral",
        value: parseFloat(point.sourceString + fraction.sourceString),
        type: core.numType
      };
    },

    StringLit_stringClosed(openQuote, chars, closeQuote) {
      return {
        kind: "StringLiteral",
        value: chars.sourceString,
        type: core.textType
      };
    },

    StringLit_stringUnclosed(openQuote, chars) {
      throw new Error("String literal not closed");
    },

    ListExp_listExp(open, expListOpt, close) {
      const elements = expListOpt.children.length > 0 ? getRep(expListOpt.children[0]) : [];
      const elementType = elements.length > 0 ? elements[0].type : "any";
      if (elements.length > 0) {
        mustAllHaveSameType(elements, { at: open });
      }
      return core.listLiteral(elements, core.listType(elementType));
    },

    ExpList_expList(first, comma, rest) {
      const results = [getRep(first)];
      if (rest.children.length > 0) {
        results.push(...rest.children.map(child =>
          child.children[1] ? getRep(child.children[1]) : getRep(child)
        ));
      }
      if (results.length > 0) {
        mustAllHaveSameType(results, { at: first });
      }
      return results;
    }
  });

  return semantics(match).rep();
}
