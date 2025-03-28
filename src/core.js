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
  
  export function tupleType(types) {
    return { kind: "TupleType", types };
  }
  
  export function mapType(keyType, valueType) {
    return { kind: "MapType", keyType, valueType };
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
  
  export function some(value) {
    return { kind: "Some", value, type: optionalType(value.type) };
  }
  
  // For list indexing
  export function subscript(array, index) {
    const base = array.type.startsWith("list<") ? array.type.slice(5, -1) : anyType;
    return { kind: "SubscriptExpression", array, index, type: base };
  }
  
  export function arrayExpression(elements) {
    const elementType = elements.length > 0 ? elements[0].type : anyType;
    return { kind: "ArrayExpression", elements, type: arrayType(elementType) };
  }
  
  export function emptyArray(type) {
    return { kind: "EmptyArray", type };
  }
  
  export function memberExpression(object, op, field) {
    return { kind: "MemberExpression", object, op, field, type: field.type };
  }
  
  export function tupleExpression(elements) {
    return { 
      kind: "TupleExpression", 
      elements, 
      type: tupleType(elements.map(e => e.type))
    };
  }
  
  export function mapLiteral(entries, keyType, valueType) {
    return {
      kind: "MapLiteral",
      entries,
      type: mapType(keyType, valueType)
    };
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
    return { 
      kind: "FunctionCall", 
      callee, 
      args, 
      type: callee.type?.returnType || anyType 
    };
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
  
  // Control flow
  export function breakStatement() {
    return { kind: "BreakStatement" };
  }
  
  export function continueStatement() {
    return { kind: "ContinueStatement" };
  }
  
  // Pattern matching
  export function patternMatch(exp, cases) {
    return { kind: "PatternMatch", exp, cases };
  }
  
  export function matchCase(pattern, body) {
    return { kind: "MatchCase", pattern, body };
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
    println: intrinsicFunction("println", functionType([anyType], voidType)),
    sqrt: intrinsicFunction("sqrt", functionType([numType], numType)),
    sin: intrinsicFunction("sin", functionType([numType], numType)),
    cos: intrinsicFunction("cos", functionType([numType], numType)),
    exp: intrinsicFunction("exp", functionType([numType], numType)),
    ln: intrinsicFunction("ln", functionType([numType], numType)),
    hypot: intrinsicFunction("hypot", functionType([numType, numType], numType)),
    bytes: intrinsicFunction("bytes", functionType([textType], listType(numType))),
    codepoints: intrinsicFunction("codepoints", functionType([textType], listType(numType))),
    len: intrinsicFunction("len", functionType([listType(anyType)], numType)),
    keys: intrinsicFunction("keys", functionType([mapType(anyType, anyType)], listType(anyType))),
    values: intrinsicFunction("values", functionType([mapType(anyType, anyType)], listType(anyType)))
  });
  
  // Type checking utilities
  export function isListType(type) {
    return typeof type === 'string' && type.startsWith('list<');
  }
  
  export function getListElementType(type) {
    return isListType(type) ? type.slice(5, -1) : anyType;
  }
  
  // Patch JavaScript primitives with Gitz types
  String.prototype.type = textType;
  Number.prototype.type = numType;
  BigInt.prototype.type = numType;
  Boolean.prototype.type = boolType;
  Array.prototype.type = listType(anyType);