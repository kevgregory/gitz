// src/core.js
// Gitz Core – IR node constructors and standard library definitions

// — Programs and Declarations
export function program(statements) {
  return { kind: "Program", statements };
}

export function variableDeclaration(variable, initializer) {
  return { kind: "VariableDeclaration", variable, initializer };
}

// New: list declarations (“Make x: list<…> = …;”)
export function listDeclaration(name, elementType, initializer) {
  return { kind: "ListDeclaration", name, elementType, initializer };
}

export function variable(name, mutable, type) {
  return { kind: "Variable", name, mutable, type };
}

// When you omit “= …” this provides a no-op initializer
export function emptyInitializer(type = anyType) {
  return { kind: "EmptyInitializer", type };
}

// — Basic Types
export const boolType  = "bool";
export const numType   = "num";
export const textType  = "text";
export const voidType  = "void";
export const anyType   = "any";

// — Functions
export function functionDeclaration(fun) {
  return { kind: "FunctionDeclaration", fun };
}

/**
 * fun(name, params, body, fnType?)
 *   fnType is a FunctionType; if omitted we infer void → void
 */
export function fun(name, params = [], body = [], fnType = null) {
  const type =
    fnType ||
    functionType(params.map((p) => p.type), voidType);
  const returnType = type.returnType;
  return { kind: "Function", name, params, body, type, returnType };
}

export function intrinsicFunction(name, type) {
  return { kind: "Function", name, type, intrinsic: true };
}

export function functionType(paramTypes, returnType = voidType) {
  return { kind: "FunctionType", paramTypes, returnType };
}

// Expression‐level function calls
export function functionCall(target, args) {
  return { kind: "FunctionCall", target, args };
}

// — Control Structures
export function ifStatement(test, consequent, alternate) {
  return { kind: "IfStatement", test, consequent, alternate };
}

export function whileStatement(test, body) {
  return { kind: "WhileStatement", test, body };
}

export function forStatement(iterator, collection, body) {
  return {
    kind: "ForStatement",
    iterator,
    collection,
    body,
    type: voidType,
  };
}

export function tryCatch(tryBlock, errorVar, catchBlock) {
  return {
    kind: "TryCatchStatement",
    tryBlock,
    errorVar,
    catchBlock,
    type: voidType,
  };
}

// — Expressions
export function binary(op, left, right, type) {
  return { kind: "BinaryExpression", op, left, right, type };
}

export function unary(op, operand, type) {
  return { kind: "UnaryExpression", op, operand, type };
}

export function assignment(target, source) {
  return { kind: "Assignment", target, source };
}

export function returnStatement(expression) {
  return { kind: "ReturnStatement", expression };
}

// — List operations
export function listType(baseType = anyType) {
  return `list<${baseType}>`;
}

export function listLiteral(elements, declaredType) {
  let type;
  if (declaredType) {
    type = declaredType;
  } else if (elements.length > 0) {
    type = `list<${elements[0].type}>`;
  } else {
    type = anyType;
  }
  return { kind: "ListLiteral", elements, type };
}

export function subscript(array, index) {
  const base = isListType(array.type)
    ? array.type.slice(5, -1)
    : anyType;
  return {
    kind: "SubscriptExpression",
    array,
    index,
    type: base,
  };
}

// — Control‐flow statements
export function breakStatement() {
  return { kind: "BreakStatement", type: voidType };
}

export function continueStatement() {
  return { kind: "ContinueStatement", type: voidType };
}

// Maps directly to your `say(...)` statement
export function sayStatement(args) {
  // in our IR it's called PrintStatement
  return { kind: "PrintStatement", args, type: voidType };
}

// — Standard Library
// build the one intrinsic once so we can alias for print
const sayIntr = intrinsicFunction("say", functionType([anyType], voidType));

export const standardLibrary = Object.freeze({
  // primitive type names
  num:   numType,
  text:  textType,
  bool:  boolType,
  void:  voidType,
  any:   anyType,

  // built‐in constant π
  π: {
    kind:     "NumberLiteral",
    value:    Math.PI,
    type:     numType,
    mutable:  false,
  },

  // the one “print” analogue in Gitz
  say: sayIntr,
  print: intrinsicFunction("print", functionType([anyType], voidType)),

  // math & miscellany
  sqrt:       intrinsicFunction("sqrt",     functionType([numType], numType)),
  sin:        intrinsicFunction("sin",      functionType([numType], numType)),
  cos:        intrinsicFunction("cos",      functionType([numType], numType)),
  exp:        intrinsicFunction("exp",      functionType([numType], numType)),
  ln:         intrinsicFunction("ln",       functionType([numType], numType)),
  hypot:      intrinsicFunction("hypot",    functionType([numType, numType], numType)),
  bytes:      intrinsicFunction("bytes",    functionType([textType], listType(numType))),
  codepoints: intrinsicFunction("codepoints", functionType([textType], listType(numType))),
  len:        intrinsicFunction("len",       functionType([listType(anyType)], numType)),
  range:      intrinsicFunction("range",     functionType([numType, numType], listType(numType))),
});

// — Utility
export function isListType(type) {
  return typeof type === "string" && type.startsWith("list<");
}

export function getListElementType(type) {
  return isListType(type) ? type.slice(5, -1) : anyType;
}

// Monkey‐patch JS primitives so every literal has a `.type`
String.prototype.type  = textType;
Number.prototype.type  = numType;
Boolean.prototype.type = boolType;
Array.prototype.type   = listType(anyType);
