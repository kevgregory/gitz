// test/analyzer.test.js

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import parse from "../src/parser.js";
import analyze from "../src/analyzer.js";
import {
  program,
  variableDeclaration,
  variable,
  binary,
  numType,
  boolType,
  textType,
  functionDeclaration,
  fun,
  intrinsicFunction,
  functionType,
  functionCall,
  ifStatement,
  whileStatement,
  forStatement,
  tryCatch,
  unary,
  assignment,
  returnStatement,
  listType,
  listLiteral,
  subscript,
  breakStatement,
  continueStatement,
  sayStatement,
  standardLibrary,
  isListType,
  getListElementType,
  emptyInitializer,
} from "../src/core.js";

//
// Group 1: Semantic Checks – valid source programs should be accepted.
//
describe("Semantic Checks", () => {
  const semanticChecks = [
    ["variable declarations",            `Make x: num = 1; Make y: text = "hello";`],
    ["variable without initializer",     `Make a: num;`],
    ["list declarations",                `Make nums: list<num> = [1,2,3];`],
    ["list without initializer",         `Make xs: list<num>;`],
    ["function without return",          `Show f() { }`],
    ["function with return",             `Show f() -> num { give 5; }`],
    ["empty return in void fn",          `Show f() { give; }`],
    ["if statement",                     `When true { say(1); }`],
    ["if-else statement",                `When true { say(1); } orElse { say(2); }`],
    ["if-elseif ladder",                 `When false { say(1); } orWhen true { say(2); } orElse { say(3); }`],
    ["orWhen without orElse",            `When false { say(1);} orWhen true { say(2);}`],
    ["while loop",                       `Keep true { say(1); }`],
    ["foreach loop",                     `Keep x in [1,2,3] { say(x); }`],
    ["invalid-but-accepted Try-Catch",   `Try { say(1);} Catch e { say(e); }`],
    ["standard library usage",           `say(1);`],
    ["list indexing",                    `Make nums: list<num> = [1,2,3]; say(nums[1]);`],
    ["string operations",                `say("hello");`],
    ["multiple statements",              `Make x: num = 1; Make y: num = 2; say(x);`],
    ["empty list",                       `Make empty: list<num> = [];`],
    ["function in function",             `Show outer() { Show inner() { } }`],
    ["parenthesized expression",         `say((1));`],
    ["integer literal",                  `say(123);`],
    ["float literal",                    `say(1.23);`],
    ["string literal",                   `say("test");`],
    ["boolean literal",                  `say(true);`],
    ["list literal expression",          `say([1,2,3]);`],
    ["unary minus",                      `say(minus 5);`],
    ["unary not",                        `say(not false);`],
    ["function call no args",            `Show f() { say(1); } say(f());`],
    ["print with multiple arguments",    `say(1,2,3);`],
    ["Continue in loop",                 `Keep true { Skip; }`],
    ["Break in loop",                    `Keep true { Break; }`],
  ];

  semanticChecks.forEach(([scenario, source]) => {
    it(`recognizes ${scenario}`, () => {
      assert.ok(analyze(parse(source)));
    });
  });
});

//
// Group 2: Semantic Errors – invalid programs should throw expected errors.
//
describe("Semantic Errors", () => {
  const semanticErrors = [
    ["undeclared variable",       "say(x);",                     /Identifier x not declared/],
    ["redeclared variable",       "Make x: num = 1; Make x: num = 2;", /Identifier x already declared/],
    ["invalid return type",       "Show f() -> bool { give 5; }", /Cannot assign/],
    ["break outside loop",        "Break;",                      /Break used outside of loop/],
    ["continue outside loop",     "Skip;",                       /Skip used outside of loop/],
    ["type mismatch",             "Make x: num = true;",        /Cannot assign bool to num/],
    ["invalid assignment",        "1 = 2;",                     /Invalid assignment/],
    ["wrong param count",         "Show f(x:num) {} f(1,2);",    /Expected 1 args but got 2/],
    ["invalid list element type", "Make nums: list<num> = [1, true, 3];", /All list elems must match/],
    ["invalid index type",        "Make nums: list<num> = [1,2,3]; say(nums[true]);", /Expected a number/],
    ["assign to immutable",       "Make x: num = 1; x = 2;",    /Cannot assign to immutable variable/],
    ["call non-function",         "Make x: num = 1; x();",      /is not a function/],
    ["invalid standard lib usage",`say(sin(true));`,             /Expected a number/],
    ["foreach over non-list",     "Keep x in 123 { }",          /Expected a list/],
    ["while with non-boolean",    "Keep 5 { }",                 /Expected a boolean/],
  ];

  semanticErrors.forEach(([scenario, source, errPattern]) => {
    it(`throws on ${scenario}`, () => {
      assert.throws(() => analyze(parse(source)), errPattern);
    });
  });
});

//
// Group 3: Detailed IR Tests – verify that the produced IR has expected structure.
//
describe("Detailed IR Tests", () => {
  it("produces expected IR for a trivial program", () => {
    const analyzed = analyze(parse("Make x: num = 1;"));
    assert.equal(analyzed.kind, "Program");
    assert.equal(analyzed.statements.length, 1);
    const decl = analyzed.statements[0];
    assert.equal(decl.kind, "VariableDeclaration");
    assert.equal(decl.variable.name, "x");
    assert.equal(decl.initializer.value, 1);
  });

  it("handles list literals correctly", () => {
    const analyzed = analyze(parse("Make nums: list<num> = [1, 2, 3];"));
    const stmt = analyzed.statements[0];
    assert.equal(stmt.kind, "VariableDeclaration");
    assert.equal(stmt.variable.type, "list<num>");
    assert.equal(stmt.initializer.kind, "ListLiteral");
    assert.equal(stmt.initializer.elements.length, 3);
    assert.equal(stmt.initializer.type, "list<num>");
  });

  it("handles nested lists correctly", () => {
    const analyzed = analyze(parse("Make matrix: list<list<num>> = [[1,2],[3,4]];"));
    const stmt = analyzed.statements[0];
    assert.equal(stmt.variable.type, "list<list<num>>");
    stmt.initializer.elements.forEach(inner => {
      assert.equal(inner.kind, "ListLiteral");
    });
  });

  it("handles function with return correctly", () => {
    const analyzed = analyze(parse("Show f() -> num { give 5; }"));
    const funDecl = analyzed.statements[0];
    assert.equal(funDecl.kind, "FunctionDeclaration");
    assert.equal(funDecl.fun.name, "f");
    assert.equal(funDecl.fun.body[0].kind, "ReturnStatement");
  });

  it("handles function call with no arguments", () => {
    const analyzed = analyze(parse("Show f() {} f();"));
    const call = analyzed.statements[1];
    assert.equal(call.kind, "FunctionCall");
    assert.deepEqual(call.args, []);
  });

  it("handles unary minus correctly", () => {
    const analyzed = analyze(parse("say(minus 5);"));
    const stmt = analyzed.statements[0];
    assert.equal(stmt.kind, "PrintStatement");
    assert.equal(stmt.args[0].kind, "UnaryExpression");
    assert.equal(stmt.args[0].op, "minus");
  });

  it("handles unary not correctly", () => {
    const analyzed = analyze(parse("say(not false);"));
    const stmt = analyzed.statements[0];
    assert.equal(stmt.args[0].op, "not");
  });

  it("handles expression with multiple arguments", () => {
    const analyzed = analyze(parse("say(1,2,3);"));
    assert.equal(analyzed.statements[0].args.length, 3);
  });

  it("produces a TryCatchStatement IR", () => {
    const analyzed = analyze(parse("Try { say(1); } Catch e { say(e); }"));
    const tc = analyzed.statements[0];
    assert.equal(tc.kind, "TryCatchStatement");
    assert.equal(tc.errorVar, "e");
  });
});

//
// Group 4: Loop Constructs
//
describe("Loop Constructs", () => {
  it("handles while loop with break", () => {
    const analyzed = analyze(parse("Keep true { Break; }"));
    assert.equal(analyzed.statements[0].body[0].kind, "BreakStatement");
  });

  it("handles while loop with continue", () => {
    const analyzed = analyze(parse("Keep true { Skip; }"));
    assert.equal(analyzed.statements[0].body[0].kind, "ContinueStatement");
  });
});

//
// Group 5: Function Parameter and Assignment Checks
//
describe("Function Parameter and Assignment Checks", () => {
  it("throws on assignment to immutable variable", () => {
    assert.throws(() => analyze(parse("Make x: num = 1; x = 2;")),
                  /Cannot assign to immutable variable/);
  });
});

//
// Group 6: Core Functions Tests – directly call core.js functions
//
describe("Core Functions", () => {
  it("program() returns a Program node", () => {
    const p = program([]);
    assert.equal(p.kind, "Program");
  });

  it("variableDeclaration() returns a VariableDeclaration node", () => {
    const v = variable("x", false, numType);
    const decl = variableDeclaration(v, emptyInitializer(numType));
    assert.equal(decl.kind, "VariableDeclaration");
    assert.equal(decl.variable.name, "x");
  });

  it("variable() returns a Variable node", () => {
    const v = variable("y", false, textType);
    assert.equal(v.kind, "Variable");
    assert.equal(v.name, "y");
  });

  it("emptyInitializer() returns an EmptyInitializer node", () => {
    const init = emptyInitializer(numType);
    assert.equal(init.kind, "EmptyInitializer");
  });

  it("functionDeclaration() returns a FunctionDeclaration node", () => {
    const f = fun("f", [], [], functionType([], numType), numType);
    const fd = functionDeclaration(f);
    assert.equal(fd.kind, "FunctionDeclaration");
  });

  it("fun() returns a Function node", () => {
    const f = fun("g", [], [], functionType([], boolType), boolType);
    assert.equal(f.kind, "Function");
    assert.equal(f.returnType, boolType);
  });

  it("intrinsicFunction() marks intrinsic correctly", () => {
    const intr = intrinsicFunction("hi", functionType([numType], textType));
    assert.equal(intr.kind, "Function");
    assert.equal(intr.intrinsic, true);
    assert.deepEqual(intr.type.paramTypes, [numType]);
    assert.equal(intr.type.returnType, textType);
  });

  it("functionType() returns a FunctionType node", () => {
    const ft = functionType([numType], numType);
    assert.equal(ft.kind, "FunctionType");
  });

  it("functionCall() returns a FunctionCall node", () => {
    const f = fun("f", [], [], functionType([], numType), numType);
    const fc = functionCall(f, []);
    assert.equal(fc.kind, "FunctionCall");
  });

  it("ifStatement() returns an IfStatement node", () => {
    const iff = ifStatement(true, ["a"], ["b"]);
    assert.equal(iff.kind, "IfStatement");
  });

  it("whileStatement() returns a WhileStatement node", () => {
    const ws = whileStatement(true, ["body"]);
    assert.equal(ws.kind, "WhileStatement");
  });

  it("forStatement() returns a ForStatement node", () => {
    const it = variable("i", true, numType);
    const fs = forStatement(it, listLiteral([], listType(numType)), ["body"]);
    assert.equal(fs.kind, "ForStatement");
  });

  it("tryCatch() returns a TryCatchStatement node", () => {
    const tc = tryCatch(["try"], "e", ["catch"]);
    assert.equal(tc.kind, "TryCatchStatement");
  });

  it("binary() returns a BinaryExpression node", () => {
    const b = binary("plus",
      { kind:"NumberLiteral",value:1,type:numType },
      { kind:"NumberLiteral",value:2,type:numType },
      numType);
    assert.equal(b.kind, "BinaryExpression");
    assert.equal(b.op, "plus");
  });

  it("unary() returns a UnaryExpression node", () => {
    const u = unary("minus",
      { kind:"NumberLiteral",value:5,type:numType },
      numType);
    assert.equal(u.kind, "UnaryExpression");
    assert.equal(u.op, "minus");
  });

  it("assignment() returns an Assignment node", () => {
    const v = variable("x", false, numType);
    const a = assignment(v, { kind:"NumberLiteral",value:1,type:numType });
    assert.equal(a.kind, "Assignment");
  });

  it("returnStatement() returns a ReturnStatement node", () => {
    const r = returnStatement({ kind:"NumberLiteral",value:5,type:numType });
    assert.equal(r.kind, "ReturnStatement");
  });

  it("listType() returns the proper string", () => {
    const lt = listType(numType);
    assert.equal(lt, "list<num>");
  });

  it("listLiteral() returns a ListLiteral node with declared type", () => {
    const ll = listLiteral([{ kind:"NumberLiteral",value:1,type:numType }], listType(numType));
    assert.equal(ll.kind, "ListLiteral");
    assert.equal(ll.type, "list<num>");
  });

  it("subscript() returns a SubscriptExpression node", () => {
    const arr = { kind:"ListLiteral",elements:[{kind:"NumberLiteral",value:1,type:numType}],type:"list<num>" };
    const s = subscript(arr, { kind:"NumberLiteral",value:0,type:numType });
    assert.equal(s.kind, "SubscriptExpression");
  });

  it("breakStatement() returns a BreakStatement node", () => {
    const br = breakStatement();
    assert.equal(br.kind, "BreakStatement");
  });

  it("continueStatement() returns a ContinueStatement node", () => {
    const c = continueStatement();
    assert.equal(c.kind, "ContinueStatement");
  });

  it("sayStatement() returns a PrintStatement node", () => {
    const s = sayStatement([{ kind:"NumberLiteral",value:1,type:numType }]);
    assert.equal(s.kind, "PrintStatement");
  });

  it("standardLibrary has expected properties", () => {
    assert.equal(standardLibrary.num, numType);
    assert.equal(standardLibrary.text, textType);
    assert.ok(standardLibrary.print.intrinsic);
  });

  it("isListType() and getListElementType() work", () => {
    assert.ok(isListType("list<num>"));
    assert.equal(getListElementType("list<num>"), "num");
  });
});
