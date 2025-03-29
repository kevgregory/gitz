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
  functionType,
  listType,
  listLiteral,
  returnStatement
} from "../src/core.js";


const semanticChecks = [
  ["variable declarations", "Make x: num = 1; Make y: text = \"hello\";"],
  ["list declarations", "Make nums: list<num> = [1, 2, 3];"],
  ["function without return", "Show f() { }"],
  ["if statement", "When true { say(1); }"],
  ["if-else statement", "When true { say(1); } orElse { say(2); }"],
  ["if-elseif ladder", "When false { say(1); } orWhen true { say(2); } orElse { say(3); }"],
  ["while loop", "Keep true { say(1); }"],
  ["foreach loop", "Keep x in [1,2,3] { say(x); }"],
  ["try-catch", "Try { say(1); } Catch e { say(e); }"],
  ["standard library usage", "say(1);"],
  ["list indexing", "Make nums: list<num> = [1,2,3]; say(nums[1]);"],
  ["string operations", "say(\"hello\");"],
  ["multiple statements", "Make x: num = 1; Make y: num = 2; say(x);"],
  ["empty list", "Make empty: list<num> = [1];"],
  ["function in function", "Show outer() { Show inner() { } }"]
];

const semanticErrors = [
  ["undeclared variable", "say(x);", /Identifier x is not declared/],
  ["redeclared variable", "Make x: num = 1; Make x: num = 2;", /Identifier x already declared/],
  ["invalid return type", "Show f() -> bool { give 5; }", /Cannot assign/],
  ["break outside loop", "Break;", /Break used outside of a loop/],
  ["continue outside loop", "Skip;", /Skip used outside of a loop/],
  ["type mismatch", "Make x: num = true;", /Cannot assign bool to num/],
  ["invalid assignment", "1 = 2;", /Invalid assignment/],
  ["wrong param count", "Show f(x:num) {} f(1,2);", /Expected 1 arguments but got 2/],
  ["invalid list element type", "Make nums: list<num> = [1, true, 3];", /Operands must have same type/],
  ["invalid index type", "Make nums: list<num> = [1,2,3]; say(nums[true]);", /Expected a number/],
  ["assign to immutable", "Make x: num = 1; x = 2;", /Cannot assign to immutable variable/],
  ["call non-function", "Make x: num = 1; x();", /is not a function/],
  ["invalid standard lib usage", "say(sin(true));", /Expected a number/]
];

describe("The analyzer for Gitz", () => {
  for (const [scenario, source] of semanticChecks) {
    it(`recognizes ${scenario}`, () => {
      assert.ok(analyze(parse(source)));
    });
  }

  for (const [scenario, source, errorMessagePattern] of semanticErrors) {
    it(`throws on ${scenario}`, () => {
      assert.throws(() => analyze(parse(source)), errorMessagePattern);
    });
  }

  it("produces the expected representation for a trivial program", () => {
    const analyzed = analyze(parse("Make x: num = 1;"));
    assert.equal(analyzed.kind, "Program");
    assert.equal(analyzed.statements.length, 1);
    assert.equal(analyzed.statements[0].kind, "VariableDeclaration");
    assert.equal(analyzed.statements[0].variable.name, "x");
  });

  it("handles list literals correctly", () => {
    const analyzed = analyze(parse("Make nums: list<num> = [1, 2, 3];"));
    assert.equal(analyzed.kind, "Program");
    assert.equal(analyzed.statements[0].kind, "VariableDeclaration");
    assert.equal(analyzed.statements[0].variable.type, "list<num>");
    assert.equal(analyzed.statements[0].initializer.elements.length, 3);
  });

  it("handles nested lists correctly", () => {
    const analyzed = analyze(parse("Make nums: list<num> = [1, 2, 3];"));
    assert.equal(analyzed.kind, "Program");
    assert.equal(analyzed.statements[0].kind, "VariableDeclaration");
    assert.equal(analyzed.statements[0].variable.type, "list<num>");
  });
});
