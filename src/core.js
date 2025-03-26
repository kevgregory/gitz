// Gitz Core 🧠🧱
// IR node constructors and standard library definitions

export function program(statements) {
    return { kind: "Program", statements }
  }
  
  export function variableDeclaration(variable, initializer) {
    return { kind: "VariableDeclaration", variable, initializer }
  }
  
  export function variable(name, mutable, type) {
    return { kind: "Variable", name, mutable, type }
  }
  
  export function functionDeclaration(fun) {
    return { kind: "FunctionDeclaration", fun }
  }
  
  export function fun(name, params = [], body = [], type = null) {
    return { kind: "Function", name, params, body, type }
  }
  
  export function functionCall(callee, args) {
    if (callee.intrinsic) {
      if (callee.type.returnType === voidType) {
        return { kind: callee.name.replace(/^\p{L}/u, c => c.toUpperCase()), args }
      } else if (callee.type.paramTypes.length === 1) {
        return unary(callee.name, args[0], callee.type.returnType)
      } else {
        return binary(callee.name, args[0], args[1], callee.type.returnType)
      }
    }
    return { kind: "FunctionCall", callee, args, type: callee.type.returnType }
  }
  
  export function assignment(target, source) {
    return { kind: "Assignment", target, source }
  }
  
  export function returnStatement(expression) {
    return { kind: "ReturnStatement", expression }
  }
  
  export function breakStatement() {
    return { kind: "BreakStatement" }
  }
  
  export function continueStatement() {
    return { kind: "ContinueStatement" }
  }
  
  export function ifStatement(test, consequent, alternate = null) {
    return { kind: "IfStatement", test, consequent, alternate }
  }
  
  export function whileStatement(test, body) {
    return { kind: "WhileStatement", test, body }
  }
  
  export function forEachStatement(iterator, collection, body) {
    return { kind: "ForEachLoop", iterator, collection, body }
  }
  
  export function tryCatch(tryBlock, errorVar, catchBlock) {
    return { kind: "TryStatement", tryBlock, errorVar, catchBlock }
  }
  
  export function sayStatement(args) {
    return { kind: "SayStatement", arguments: args }
  }
  
  export function binary(op, left, right, type) {
    return { kind: "BinaryExpression", op, left, right, type }
  }
  
  export function unary(op, operand, type) {
    return { kind: "UnaryExpression", op, operand, type }
  }
  
  export function subscript(list, index) {
    return { kind: "ListAccess", list, index, type: list.type.slice(5, -1) }
  }
  
  export function listLiteral(elements, type) {
    return { kind: "ListLiteral", elements, type }
  }
  
  export const numType = "num"
  export const textType = "text"
  export const boolType = "bool"
  export const voidType = "void"
  export const anyType = "any"
  
  export function listType(baseType) {
    return `list<${baseType}>`
  }
  
  export function intrinsicFunction(name, type) {
    return { kind: "Function", name, type, intrinsic: true }
  }
  
  const floatToFloat = functionType([numType], numType)
  const floatFloatToFloat = functionType([numType, numType], numType)
  const anyToVoid = functionType([anyType], voidType)
  
  export function functionType(paramTypes, returnType) {
    return { kind: "FunctionType", paramTypes, returnType }
  }
  
  export const standardLibrary = Object.freeze({
    num: numType,
    text: textType,
    bool: boolType,
    void: voidType,
    any: anyType,
    π: variable("π", false, numType),
    say: intrinsicFunction("say", anyToVoid),
    sqrt: intrinsicFunction("sqrt", floatToFloat),
    sin: intrinsicFunction("sin", floatToFloat),
    cos: intrinsicFunction("cos", floatToFloat),
    hypot: intrinsicFunction("hypot", floatFloatToFloat)
  })
  
  // Patch primitive JS values with Gitz types
  String.prototype.type = textType
  Number.prototype.type = numType
  BigInt.prototype.type = numType
  Boolean.prototype.type = boolType
  