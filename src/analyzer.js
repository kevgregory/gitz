// Gitz Semantic Analyzer 🧠🔍
// Accepts a CST (match object from Ohm) and produces a typed AST (IR)

import * as core from "./core.js"

class Context {
  constructor({ parent = null, locals = new Map(), inLoop = false, returnType = null }) {
    Object.assign(this, { parent, locals, inLoop, returnType })
  }
  add(name, entity) {
    this.locals.set(name, entity)
  }
  lookup(name) {
    return this.locals.get(name) || this.parent?.lookup(name)
  }
  static root() {
    return new Context({ locals: new Map(Object.entries(core.standardLibrary)) })
  }
  newChildContext(props) {
    return new Context({ ...this, ...props, parent: this, locals: new Map() })
  }
}

export default function analyze(match) {
  let context = Context.root()

  function must(condition, message, errorLocation) {
    if (!condition) {
      const prefix = errorLocation.at.source.getLineAndColumnMessage()
      throw new Error(`${prefix}${message}`)
    }
  }

  function mustNotAlreadyBeDeclared(name, at) {
    must(!context.lookup(name), `Identifier ${name} already declared`, at)
  }

  function mustHaveBeenFound(entity, name, at) {
    must(entity, `Identifier ${name} not declared`, at)
  }

  function mustHaveBooleanType(e, at) {
    must(e.type === core.booleanType, "Expected a boolean", at)
  }

  function mustHaveNumericType(e, at) {
    const expected = [core.intType, core.floatType]
    must(expected.includes(e.type), "Expected a number", at)
  }

  function mustBothHaveSameType(e1, e2, at) {
    must(e1.type === e2.type, "Operands must have same type", at)
  }

  function mustAllHaveSameType(exprs, at) {
    for (let i = 1; i < exprs.length; i++) {
      mustBothHaveSameType(exprs[0], exprs[i], at)
    }
  }

  function mustBeAssignable(source, { toType }, at) {
    must(source.type === toType, `Cannot assign ${source.type} to ${toType}`, at)
  }

  function isMutable(e) {
    return e?.kind === "Variable" && e?.mutable
  }

  function mustBeMutable(e, at) {
    must(isMutable(e), "Cannot assign to immutable variable", at)
  }

  const builder = match.matcher.grammar.createSemantics().addOperation("rep", {
    Program(statements) {
      return core.program(statements.children.map(s => s.rep()))
    },

    VarDecl(_make, id, _colon, type, _eq, exp, _semi) {
      const name = id.sourceString
      mustNotAlreadyBeDeclared(name, id)
      const initializer = exp.rep()
      const variable = core.variable(name, true, type.rep())
      mustBeAssignable(initializer, variable, id)
      context.add(name, variable)
      return core.variableDeclaration(variable, initializer)
    },

    FunDecl(_show, id, _open, params, _close, returnType, body) {
      const name = id.sourceString
      mustNotAlreadyBeDeclared(name, id)
      const paramList = params.asIteration().children.map(p => p.rep())
      const retType = returnType.rep()
      const fun = core.function(name, paramList, retType)
      context.add(name, fun)
      const saved = context
      context = context.newChildContext({ returnType: retType })
      for (const param of paramList) context.add(param.name, param)
      const bodyRep = body.rep()
      context = saved
      return core.functionDeclaration(fun, bodyRep)
    },

    Param(id, _colon, type) {
      return core.variable(id.sourceString, true, type.rep())
    },

    Type(t) {
      const str = t.sourceString
      if (str === "num") return core.intType
      if (str === "bool") return core.booleanType
      if (str === "text") return core.stringType
      throw new Error(`Unknown type ${str}`)
    },

    SayStmt(_say, exp, _semi) {
      return core.printStatement(exp.rep())
    },

    Assignment(id, _eq, exp, _semi) {
      const variable = context.lookup(id.sourceString)
      mustHaveBeenFound(variable, id.sourceString, id)
      mustBeMutable(variable, id)
      const source = exp.rep()
      mustBeAssignable(source, variable, id)
      return core.assignment(variable, source)
    },

    IfStmt(_when, test, cons, _else, alt) {
      const testRep = test.rep()
      mustHaveBooleanType(testRep, test)
      return core.ifStatement(testRep, cons.rep(), alt.rep())
    },

    WhileStmt(_while, test, body) {
      const testRep = test.rep()
      mustHaveBooleanType(testRep, test)
      return core.whileLoop(testRep, body.rep())
    },

    ReturnStmt(_give, exp, _semi) {
      const expr = exp.rep()
      must(expr && context.returnType, "Return used outside of a function", _give)
      mustBeAssignable(expr, { toType: context.returnType }, _give)
      return core.returnStatement(expr)
    },

    IdentifierExp(id) {
      const entity = context.lookup(id.sourceString)
      mustHaveBeenFound(entity, id.sourceString, id)
      return entity
    },

    Call(id, _open, args, _close) {
      const target = context.lookup(id.sourceString)
      mustHaveBeenFound(target, id.sourceString, id)
      const argList = args.asIteration().children.map(a => a.rep())
      return core.functionCall(target, argList)
    },

    Exp(exp) {
      return exp.rep()
    },

    LogicalOrExp(left, _ops, rights) {
      let expr = left.rep()
      mustHaveBooleanType(expr, { at: left })
      for (const r of rights.children) {
        const right = r.rep()
        mustHaveBooleanType(right, { at: r })
        expr = core.binary("or", expr, right, core.booleanType)
      }
      return expr
    },

    LogicalAndExp(left, _ops, rights) {
      let expr = left.rep()
      mustHaveBooleanType(expr, { at: left })
      for (const r of rights.children) {
        const right = r.rep()
        mustHaveBooleanType(right, { at: r })
        expr = core.binary("and", expr, right, core.booleanType)
      }
      return expr
    },

    EqualityExp(left, op, right) {
      const lhs = left.rep()
      const rhs = right.rep()
      mustBothHaveSameType(lhs, rhs, { at: op })
      return core.binary(op.sourceString, lhs, rhs, core.booleanType)
    },

    RelationalExp(left, op, right) {
      const lhs = left.rep()
      const rhs = right.rep()
      mustBothHaveSameType(lhs, rhs, { at: op })
      return core.binary(op.sourceString, lhs, rhs, core.booleanType)
    },

    AdditiveExp(left, _ops, rights) {
      let expr = left.rep()
      mustHaveNumericType(expr, { at: left })
      for (const r of rights.children) {
        const right = r.rep()
        mustHaveNumericType(right, { at: r })
        expr = core.binary(r.sourceString, expr, right, expr.type)
      }
      return expr
    },

    MultiplicativeExp(left, _ops, rights) {
      let expr = left.rep()
      mustHaveNumericType(expr, { at: left })
      for (const r of rights.children) {
        const right = r.rep()
        mustHaveNumericType(right, { at: r })
        expr = core.binary(r.sourceString, expr, right, expr.type)
      }
      return expr
    },

    UnaryExp(op, expr) {
      const operand = expr.rep()
      if (op.children.length === 0) return operand
      const opStr = op.sourceString
      if (opStr === "minus") {
        mustHaveNumericType(operand, { at: expr })
        return core.unary("minus", operand, operand.type)
      }
      if (opStr === "not") {
        mustHaveBooleanType(operand, { at: expr })
        return core.unary("not", operand, core.booleanType)
      }
      throw new Error(`Unsupported unary operator ${opStr}`)
    },

    PrimaryExp_parens(_open, expr, _close) {
      return expr.rep()
    },

    PrimaryExp_identifier(id) {
      return id.rep()
    },

    PrimaryExp_functionCall(call) {
      return call.rep()
    },

    PrimaryExp_listIndexing(indexed) {
      return indexed.rep()
    },

    IndexedAccess(id, _open, index, _close) {
      const list = id.rep()
      const idx = index.rep()
      mustHaveNumericType(idx, { at: index })
      return core.subscript(list, idx)
    },
  })

  return builder(match).rep()
}