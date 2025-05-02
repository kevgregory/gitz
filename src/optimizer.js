// src/optimizer.js
import * as core from "./core.js"

export default function optimize(node) {
  return optimizers[node.kind]?.(node) ?? node
}

const isZero = n => n === 0 || n === 0n
const isOne  = n => n === 1 || n === 1n

const optimizers = {
  Program(p) {
    p.statements = p.statements.flatMap(optimize)
    return p
  },

  VariableDeclaration(d) {
    d.initializer = optimize(d.initializer)
    return d
  },

  FunctionDeclaration(d) {
    d.fun.body = d.fun.body.flatMap(optimize)
    return d
  },

  Increment(s) {
    s.variable = optimize(s.variable)
    return s
  },

  Decrement(s) {
    s.variable = optimize(s.variable)
    return s
  },

  Assignment(s) {
    s.source = optimize(s.source)
    s.target = optimize(s.target)
    // x = x ⇒ drop
    if (s.source === s.target) return []
    return s
  },

  BreakStatement(s) {
    return s
  },

  ReturnStatement(s) {
    s.expression = optimize(s.expression)
    return s
  },

  ShortReturnStatement(s) {
    return s
  },

  IfStatement(s) {
    s.test = optimize(s.test)
    s.consequent = s.consequent.flatMap(optimize)
    // nested else-if
    if (s.alternate?.kind?.endsWith("IfStatement")) {
      s.alternate = optimize(s.alternate)
    } else {
      s.alternate = s.alternate.flatMap(optimize)
    }
    // constant-test elimination
    if (s.test === true)  return s.consequent
    if (s.test === false) return s.alternate
    return s
  },

  ShortIfStatement(s) {
    s.test = optimize(s.test)
    s.consequent = s.consequent.flatMap(optimize)
    if (s.test === true)  return s.consequent
    if (s.test === false) return []
    return s
  },

  WhileStatement(s) {
    s.test = optimize(s.test)
    if (s.test === false) return []
    s.body = s.body.flatMap(optimize)
    return s
  },

  RepeatStatement(s) {
    s.count = optimize(s.count)
    if (s.count === 0) return []
    s.body = s.body.flatMap(optimize)
    return s
  },

  ForRangeStatement(s) {
    s.low  = optimize(s.low)
    s.high = optimize(s.high)
    s.body = s.body.flatMap(optimize)
    // if low>high ⇒ no iterations
    if (typeof s.low === "number" && typeof s.high === "number" && s.low > s.high) {
      return []
    }
    return s
  },

  ForStatement(s) {
    s.collection = optimize(s.collection)
    s.body = s.body.flatMap(optimize)
    // empty array ⇒ no iterations
    if (s.collection.kind === "EmptyArray") return []
    return s
  },

  Conditional(e) {
    e.test = optimize(e.test)
    e.consequent = optimize(e.consequent)
    e.alternate = optimize(e.alternate)
    // constant test
    if (e.test === true)  return e.consequent
    if (e.test === false) return e.alternate
    return e
  },

  BinaryExpression(e) {
    e.left  = optimize(e.left)
    e.right = optimize(e.right)

    // unwrap empty-optional: (no T) ?? x ⇒ x
    if (e.op === "??" && e.left.kind === "EmptyOptional") {
      return e.right
    }

    // boolean shortcuts
    if (e.op === "||") {
      if (e.left === false) return e.right
      if (e.right === false) return e.left
    }
    if (e.op === "&&") {
      if (e.left === true) return e.right
      if (e.right === true) return e.left
    }

    // both sides constants ⇒ fold
    const L = e.left, R = e.right
    if ((L.constructor === Number || L.constructor === BigInt) &&
        (R.constructor === Number || R.constructor === BigInt)) {
      switch (e.op) {
        case "+":  return L + R
        case "-":  return L - R
        case "*":  return L * R
        case "/":  return L / R
        case "**": return L ** R
        case "<":  return L < R
        case "<=": return L <= R
        case "==": return L === R
        case "!=": return L !== R
        case ">=": return L >= R
        case ">":  return L > R
      }
    }

    // strength reductions when one side constant
    if (e.left.constructor === Number || e.left.constructor === BigInt) {
      if (isZero(e.left) && e.op === "+") return e.right
      if (isOne(e.left)  && e.op === "*") return e.right
      if (isZero(e.left) && e.op === "-") return core.unary("-", e.right, e.right.type)
      if (isZero(e.left) && ["*", "/"].includes(e.op)) return 0
    }
    if (e.right.constructor === Number || e.right.constructor === BigInt) {
      if (e.op === "+" && isZero(e.right)) return e.left
      if (["*", "/"].includes(e.op) && isOne(e.right)) return e.left
      if (e.op === "*" && isZero(e.right)) return 0
      if (e.op === "**" && isZero(e.right)) return 1
    }

    return e
  },

  UnaryExpression(e) {
    e.operand = optimize(e.operand)
    // constant negation
    if (e.op === "-" && e.operand.constructor === Number) {
      return -e.operand
    }
    return e
  },

  // pass-through for these (no change needed)
  SubscriptExpression(e) { e.index = optimize(e.index); return e },
  ArrayExpression(e)       { e.elements = e.elements.map(optimize); return e },
  MemberExpression(e)      { e.object = optimize(e.object); return e },
  FunctionCall(e)          { e.args = e.args.map(optimize); return e },
  ConstructorCall(e)       { e.args = e.args.map(optimize); return e },
  Print(e)                 { e.args = e.args.map(optimize); return e },
}
