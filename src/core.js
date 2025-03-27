// src/core.js
// Gitz Core – IR node constructors and standard library definitions

// Programs and Declarations
export function program(statements) {
    return { kind: "Program", statements };
  }
  
  export function variableDeclaration(variable, initializer) {
    return { kind: "VariableDeclaration", variable, initializer };
  }
  
  export function variable(name, mutable, type) {
    return { kind: "Variable", name, mutable, type };
  }
  
  export function typeDeclaration(type) {
    return { kind: "TypeDeclaration", type };
  }
  
  // Basic Types
  export const boolType = "bool";
  export const numType = "num";
  export const textType = "text";
  export const voidType = "void";
  export const anyType = "any";
  
  // Structured types
  export function structType(name, fields) {
    return { kind: "StructType", name, fields };
  }
  
  export function field(name, type) {
    return { kind: "Field", name, type };
  }
  
  // Functions
  export function functionDeclaration(fun) {
    return { kind: "FunctionDeclaration", fun };
  }
  
  export function fun(name, params = [], body = [], type = null) {
    return { kind: "Function", name, params, body, type };
  }
  
  export function intrinsicFunction(name, type) {
    return { kind: "Function", name, type, intrinsic: true };
  }
  
  // Composite types
  export function arrayType(baseType) {
    return { kind: "ArrayType", baseType };
  }
  
  export function functionType(paramTypes, returnType) {
    return { kind: "FunctionType", paramTypes, returnType };
  }
  
  export function optionalType(baseType) {
    return { kind: "OptionalType", baseType };
  }
  
  // Operations
  export function increment(variable) {
    return { kind: "Increment", variable };
  }
  
  export function decrement(variable) {
    return { kind: "Decrement", variable };
  }
  
  export function assignment(target, source) {
    return { kind: "Assignment", target, source };
  }
  
  export function returnStatement(expression) {
    return { kind: "ReturnStatement", expression };
  }
  
  export const shortReturnStatement = { kind: "ShortReturnStatement" };
  
  export function ifStatement(test, consequent, alternate) {
    return { kind: "IfStatement", test, consequent, alternate };
  }
  
  export function shortIfStatement(test, consequent) {
    return { kind: "ShortIfStatement", test, consequent };
  }
  
  export function whileStatement(test, body) {
    return { kind: "WhileStatement", test, body };
  }
  
  export function repeatStatement(count, body) {
    return { kind: "RepeatStatement", count, body };
  }
  
  export function forRangeStatement(iterator, low, op, high, body) {
    return { kind: "ForRangeStatement", iterator, low, op, high, body };
  }
  
  export function forStatement(iterator, collection, body) {
    return { kind: "ForStatement", iterator, collection, body };
  }
  
  export function conditional(test, consequent, alternate, type) {
    return { kind: "Conditional", test, consequent, alternate, type };
  }
  
  export function binary(op, left, right, type) {
    return { kind: "BinaryExpression", op, left, right, type };
  }
  
  export function unary(op, operand, type) {
    return { kind: "UnaryExpression", op, operand, type };
  }
  
  export function emptyOptional(baseType) {
    return { kind: "EmptyOptional", baseType, type: optionalType(baseType) };
  }
  
  // For list indexing, we assume the array’s type is of the form "list<...>"
  export function subscript(array, index) {
    // A more robust implementation might parse the type string;
    // here we assume it always starts with "list<" and ends with ">"
    const base = array.type.slice(5, -1);
    return { kind: "SubscriptExpression", array, index, type: base };
  }
  
  export function arrayExpression(elements) {
    return { kind: "ArrayExpression", elements, type: arrayType(elements[0].type) };
  }
  
  export function emptyArray(type) {
    return { kind: "EmptyArray", type };
  }
  
  export function memberExpression(object, op, field) {
    return { kind: "MemberExpression", object, op, field, type: field.type };
  }
  
  export function functionCall(callee, args) {
    if (callee.intrinsic) {
      if (callee.type.returnType === voidType) {
        return { kind: callee.name.replace(/^\p{L}/u, c => c.toUpperCase()), args };
      } else if (callee.type.paramTypes.length === 1) {
        return unary(callee.name, args[0], callee.type.returnType);
      } else {
        return binary(callee.name, args[0], args[1], callee.type.returnType);
      }
    }
    return { kind: "FunctionCall", callee, args, type: callee.type.returnType };
  }
  
  export function constructorCall(callee, args) {
    return { kind: "ConstructorCall", callee, args, type: callee };
  }
  
  export function tryCatch(tryBlock, errorVar, catchBlock) {
    return { kind: "TryStatement", tryBlock, errorVar, catchBlock };
  }
  
  export function sayStatement(args) {
    return { kind: "SayStatement", arguments: args };
  }
  
  // Added IR nodes for break and continue statements:
  export function breakStatement() {
    return { kind: "BreakStatement" };
  }
  
  export function continueStatement() {
    return { kind: "ContinueStatement" };
  }
  
  // List types and literals
  export function listType(baseType) {
    return `list<${baseType}>`;
  }
  
  export function listLiteral(elements, type) {
    return { kind: "ListLiteral", elements, type };
  }
  
  // Standard Library definitions and type patching
  export const standardLibrary = Object.freeze({
    num: numType,
    text: textType,
    bool: boolType,
    void: voidType,
    any: anyType,
    π: variable("π", false, numType),
    print: intrinsicFunction("print", functionType([anyType], voidType)),
    sqrt: intrinsicFunction("sqrt", functionType([numType], numType)),
    sin: intrinsicFunction("sin", functionType([numType], numType)),
    cos: intrinsicFunction("cos", functionType([numType], numType)),
    exp: intrinsicFunction("exp", functionType([numType], numType)),
    ln: intrinsicFunction("ln", functionType([numType], numType)),
    hypot: intrinsicFunction("hypot", functionType([numType, numType], numType)),
    bytes: intrinsicFunction("bytes", functionType([textType], listType(numType))),
    codepoints: intrinsicFunction("codepoints", functionType([textType], listType(numType)))
  });
  
  // Patch JavaScript primitives with Gitz types.
  String.prototype.type = textType;
  Number.prototype.type = numType;
  BigInt.prototype.type = numType;
  Boolean.prototype.type = boolType;
  