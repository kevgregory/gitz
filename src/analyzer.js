// src/analyzer.js
import * as core from "./core.js";

class Context {
  constructor({ parent = null, locals = new Map(), inLoop = false, currentFunction = null } = {}) {
    this.parent = parent;
    this.locals = locals;
    this.inLoop = inLoop;
    this.currentFunction = currentFunction;
  }

  add(name, entity) {
    if (this.locals.has(name)) {
      throw new Error(`Identifier '${name}' already declared`);
    }
    this.locals.set(name, entity);
  }

  lookup(name) {
    if (this.locals.has(name)) {
      return this.locals.get(name);
    } else if (this.parent) {
      return this.parent.lookup(name);
    }
    throw new Error(`Identifier '${name}' is not declared`);
  }

  static root() {
    return new Context({ locals: new Map(Object.entries(core.standardLibrary)) });
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
  try {
    context.lookup(name);
    must(false, `Identifier ${name} already declared`, at);
  } catch (e) {
    // Not declared - OK
  }
}

function mustHaveBeenFound(entity, name, at) {
  must(entity, `Identifier ${name} not declared`, at);
}

function mustHaveNumericType(e, at) {
  must(e.type === core.numType, "Expected a number", at);
}

function mustHaveBooleanType(e, at) {
  must(e.type === core.bool, "Expected a boolean", at);
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
    Program_program(statementList) {
      return core.program(statementList.children.map(s => s.rep()));
    },

    VarDecl_varDecl(make, id, colon, type, init, semi) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });
      const initializer = init.rep();
      const varType = type.rep();
      const variable = core.variable(name, true, varType);
      mustBeAssignable(initializer, { toType: variable.type }, { at: id });
      context.add(name, variable);
      return core.variableDeclaration(variable, initializer);
    },

    ListDecl_listDecl(make, id, colon, type, init, semi) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });
      const initializer = init.rep();
      const varType = type.rep();
      const variable = core.variable(name, true, varType);
      mustBeAssignable(initializer, { toType: variable.type }, { at: id });
      context.add(name, variable);
      return core.variableDeclaration(variable, initializer);
    },

    Initialiser_init(eq, exp) {
      return exp.rep();
    },

    FunDecl_funDecl(show, id, params, arrow, retType, block) {
      const name = id.sourceString;
      mustNotAlreadyBeDeclared(name, { at: id });
      const paramList = params.rep();
      const returnType = retType ? retType.rep() : core.voidType;
      
      // Corrected function call with proper parentheses
      const fun = core.fun(
        name,
        paramList,
        [],
        core.functionType(paramList.map(p => p.type)),
        returnType
      );
      
      context.add(name, fun);
      const saved = context;
      context = context.newChildContext({ inLoop: false, currentFunction: fun });
      paramList.forEach(param => context.add(param.name, param));
      fun.body = block.rep();
      context = saved;
      return core.functionDeclaration(fun);
    },

    Params_params(open, paramListOpt, close) {
      return paramListOpt.children.length === 0 ? [] : paramListOpt.rep();
    },

    ParamList_paramList(first, comma, rest) {
      return [first.rep(), ...rest.children.map(child => child.children[1].rep())];
    },

    Param_param(id, colon, type) {
      const param = core.variable(id.sourceString, false, type.rep());
      mustNotAlreadyBeDeclared(param.name, { at: id });
      context.add(param.name, param);
      return param;
    },

    ReturnStmt_returnStmt(give, exp, semi) {
      const expr = exp.rep();
      must(context.currentFunction, "Return used outside of a function", { at: give });
      mustBeAssignable(expr, { toType: context.currentFunction.type.returnType }, { at: give });
      return core.returnStatement(expr);
    },

    IfStmt_ifStmt(whenKeyword, exp, block, orWhenClauses, orElseGroup) {
      const test = exp.rep();
      mustHaveBooleanType(test, { at: exp });
      const consequent = block.rep();
      
      let alternate = null;
      if (orWhenClauses.children.length > 0) {
        const firstOrWhen = orWhenClauses.children[0];
        alternate = core.ifStatement(
          firstOrWhen.children[1].rep(), // Exp of the first orWhen
          firstOrWhen.children[2].rep(), // Block of the first orWhen
          null
        );
    
        let current = alternate;
        for (let i = 1; i < orWhenClauses.children.length; i++) {
          const nextOrWhen = orWhenClauses.children[i];
          current.alternate = core.ifStatement(
            nextOrWhen.children[1].rep(), // Exp of next orWhen
            nextOrWhen.children[2].rep(), // Block of next orWhen
            null
          );
          current = current.alternate;
        }
    
        // Handle orElse if present
        if (orElseGroup) {
          current.alternate = orElseGroup.children[1].rep(); // The else Block
        }
      } else if (orElseGroup) {
        alternate = orElseGroup.children[1].rep(); // The else Block
      }
    
      return core.ifStatement(test, consequent, alternate);
    },

    LoopStmt_loopForEach(keep, id, inKeyword, exp, block) {
      const iterName = id.sourceString;
      const collection = exp.rep();
      const baseType = collection.type.startsWith("list<") 
        ? collection.type.slice(5, -1) 
        : "any";
      const variable = core.variable(iterName, true, baseType);
      context.add(iterName, variable);
      const saved = context;
      context = context.newChildContext({ inLoop: true });
      const body = block.rep();
      context = saved;
      return core.forStatement(variable, collection, body);
    },

    LoopStmt_loopWhile(keep, exp, block) {
      const test = exp.rep();
      mustHaveBooleanType(test, { at: exp });
      const saved = context;
      context = context.newChildContext({ inLoop: true });
      const body = block.rep();
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

    SayStmt_sayStmt(say, openParen, args, closeParen, semi) {
      const argsList = args.children.length > 0 ? args.rep() : [];
      return core.sayStatement(argsList);
    },

    Assignment_assignValid(lhs, eq, exp, semi) {
      const leftVal = lhs.rep();
      const source = exp.rep();
      mustBeMutable(leftVal, { at: lhs });
      mustBeAssignable(source, { toType: leftVal.type }, { at: lhs });
      return core.assignment(leftVal, source);
    },

    Assignment_assignInvalid(intLit, eq, exp, semi) {
      throw new Error("Invalid assignment");
    },

    IndexedAccess_index(id, open, exp, close) {
      const variable = context.lookup(id.sourceString);
      const index = exp.rep();
      mustHaveNumericType(index, { at: exp });
      return core.subscript(variable, index);
    },

    FunCallStatement_funCallStmt(call, semi) {
      return call.rep();
    },

    FunCall_funCallArgs(id, open, argList, close) {
      const target = context.lookup(id.sourceString);
      const args = argList.rep();
      must(target.type.kind === "FunctionType", `${id.sourceString} is not a function`, { at: id });
      must(
        target.type.paramTypes.length === args.length,
        `Expected ${target.type.paramTypes.length} arguments but got ${args.length}`,
        { at: id }
      );
      args.forEach((arg, i) => mustBeAssignable(arg, { toType: target.type.paramTypes[i] }, { at: id }));
      return core.functionCall(target, args);
    },

    FunCall_funCallNoArgs(id, open, close) {
      const target = context.lookup(id.sourceString);
      must(target.type.kind === "FunctionType", `${id.sourceString} is not a function`, { at: id });
      must(target.type.paramTypes.length === 0, `Expected 0 arguments but got ${target.type.paramTypes.length}`, { at: id });
      return core.functionCall(target, []);
    },

    ArgList_argList(first, comma, rest) {
      return [first.rep(), ...rest.children.map(child => child.children[1].rep())];
    },

    TryStmt_tryStmt(tryKeyword, block1, catchKeyword, id, block2) {
      const errorVar = id.sourceString;
      mustNotAlreadyBeDeclared(errorVar, { at: id });
      const saved = context;
      context = context.newChildContext();
      context.add(errorVar, core.variable(errorVar, false, core.textType));
      const catchBlock = block2.rep();
      context = saved;
      return core.tryCatch(block1.rep(), errorVar, catchBlock);
    },

    Block_block(open, stmts, close) {
      const saved = context;
      context = context.newChildContext({ 
        inLoop: saved.inLoop,
        currentFunction: saved.currentFunction
      });
      const statements = stmts.children.map(s => s.rep());
      context = saved;
      return statements;
    },

    Exp_exp(exp) {
      return exp.rep();
    },

    LogicalOrExp_lor(first, op, rest) {
      let expr = first.rep();
      for (const child of rest.children) {
        const right = child.children[1].rep();
        mustHaveBooleanType(expr, { at: first });
        mustHaveBooleanType(right, { at: child.children[1] });
        expr = core.binary("or", expr, right, core.bool);
      }
      return expr;
    },

    LogicalAndExp_land(first, op, rest) {
      let expr = first.rep();
      for (const child of rest.children) {
        const right = child.children[1].rep();
        mustHaveBooleanType(expr, { at: first });
        mustHaveBooleanType(right, { at: child.children[1] });
        expr = core.binary("and", expr, right, core.bool);
      }
      return expr;
    },

    EqualityExp_eqExp(first, op, rest) {
      let expr = first.rep();
      for (const child of rest.children) {
        const right = child.children[1].rep();
        mustBothHaveSameType(expr, right, { at: child.children[0] });
        expr = core.binary(child.children[0].sourceString, expr, right, core.bool);
      }
      return expr;
    },

    RelationalExp_relExp(first, op, rest) {
      let expr = first.rep();
      for (const child of rest.children) {
        const right = child.children[1].rep();
        mustBothHaveSameType(expr, right, { at: child.children[0] });
        expr = core.binary(child.children[0].sourceString, expr, right, core.bool);
      }
      return expr;
    },

    AdditiveExp_addExp(first, op, rest) {
      let expr = first.rep();
      for (const child of rest.children) {
        const right = child.children[1].rep();
        if (child.children[0].sourceString === "plus") {
          must(expr.type === core.numType || expr.type === core.textType, "Expected number or string", { at: first });
        } else {
          mustHaveNumericType(expr, { at: first });
        }
        mustBothHaveSameType(expr, right, { at: child.children[0] });
        expr = core.binary(child.children[0].sourceString, expr, right, expr.type);
      }
      return expr;
    },

    MultiplicativeExp_mulExp(first, op, rest) {
      let expr = first.rep();
      for (const child of rest.children) {
        const right = child.children[1].rep();
        mustHaveNumericType(expr, { at: first });
        mustHaveNumericType(right, { at: child.children[1] });
        mustBothHaveSameType(expr, right, { at: child.children[0] });
        expr = core.binary(child.children[0].sourceString, expr, right, expr.type);
      }
      return expr;
    },

    UnaryExp_unary(opOpt, primary) {
      if (opOpt.children.length === 0) return primary.rep();
      const op = opOpt.children[0].sourceString;
      const expr = primary.rep();
      if (op === "minus") {
        mustHaveNumericType(expr, { at: primary });
        return core.unary("minus", expr, expr.type);
      }
      if (op === "not") {
        mustHaveBooleanType(expr, { at: primary });
        return core.unary("not", expr, core.bool);
      }
      throw new Error(`Unsupported unary operator ${op}`);
    },

    PrimaryExp_parens(open, exp, close) {
      return exp.rep();
    },

    PrimaryExp_primaryFunCall(call) {
      return call.rep();
    },

    PrimaryExp_primaryIndex(indexed) {
      return indexed.rep();
    },

    PrimaryExp_primaryId(id) {
      const name = id.sourceString;
      const entity = context.lookup(name);
      mustHaveBeenFound(entity, name, { at: id });
      return entity;
    },

    PrimaryExp_primaryFloat(floatLit) {
      const num = parseFloat(floatLit.sourceString);
      num.type = core.numType;
      return num;
    },

    PrimaryExp_primaryInt(intLit) {
      const num = parseInt(intLit.sourceString, 10);
      num.type = core.numType;
      return num;
    },

    PrimaryExp_primaryString(str) {
      const s = str.sourceString.slice(1, -1);
      s.type = core.textType;
      return s;
    },

    PrimaryExp_primaryList(listExp) {
      return listExp.rep();
    },

    BasicType_basicType(basic) {
      return basic.sourceString;
    },

    ListType_listTypeSquare(listKeyword, open, typeNode, close) {
      return core.listType(typeNode.rep());
    },

    ListType_listTypeAngle(listKeyword, open, typeNode, close) {
      return core.listType(typeNode.rep());
    },

    FloatLit_floatFull(whole, point, fraction, expPart) {
      const num = parseFloat(whole.sourceString + point.sourceString + fraction.sourceString);
      num.type = core.numType;
      return num;
    },

    FloatLit_floatTrailingDot(whole, point, expPart) {
      const num = parseFloat(whole.sourceString + point.sourceString);
      num.type = core.numType;
      return num;
    },

    FloatLit_floatLeadingDot(point, fraction, expPart) {
      const num = parseFloat(point.sourceString + fraction.sourceString);
      num.type = core.numType;
      return num;
    },

    StringLit_stringClosed(openQuote, chars, closeQuote) {
      const s = chars.sourceString;
      s.type = core.textType;
      return s;
    },

    StringLit_stringUnclosed(openQuote, chars) {
      throw new Error("String literal not closed");
    },

    ListExp_listExp(open, expListOpt, close) {
      if (expListOpt.children.length === 0) {
        return core.listLiteral([], core.listType("any"));
      }
      const elements = expListOpt.rep();
      const elementType = elements.length > 0 ? elements[0].type : "any";
      mustAllHaveSameType(elements, { at: open });
      return core.listLiteral(elements, core.listType(elementType));
    },

    ExpList_expList(first, comma, rest) {
      const results = [first.rep(), ...rest.children.map(child => child.children[1].rep())];
      mustAllHaveSameType(results, { at: first });
      return results;
    }
  });

  return semantics(match).rep();
}