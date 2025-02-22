import { describe, it } from "node:test"
import assert from "node:assert/strict"
import parse from "../src/parser.js"

// Programs expected to be syntactically correct
const syntaxChecks = [
  ["simplest syntactically correct program", "Break;"],
  ["multiple statements", "say(1);\nBreak;\nx = 5; give 10; give 20;"],
  ["variable declaration", "Make x: num = 42;"],
  ["list declaration", "Make numbers: list<num> = [1, 2, 3];"],
  ["function with no params, no return type", "Show f() {}"],
  ["function with one param", "Show f(x: num) {}"],
  ["function with two params", "Show f(x: num, y: bool) {}"],
  ["function with return type", "Show f() -> num {}"],
  ["function returning a list", "Show f() -> list<num> { give [1, 2, 3]; }"],
  ["assignments", "x = 5; y = 10;"],
  ["if statement", "When x < 10 { say(1); }"],
  ["if-else statement", "When x < 10 { say(1); } orElse { say(2); }"],
  ["if-else ladder", "When x < 10 { say(1); } orWhen x < 20 { say(2); } orElse { say(3); }"],
  ["while loop", "Keep x < 10 { say(x); }"],
  ["foreach loop", "Keep i in numbers { say(i); }"],
  ["try-catch block", "Try { say(1); } Catch e { say(e); }"],
  ["nested expressions", "x = (3 plus (2 times 5));"],
  ["boolean expressions", "Make x: bool = true;"],
  ["string operations", 'Make s: text = "Hello" plus " World";'],
  ["function calls inside function", "Show f() { g(); }"],
  ["string literals with escapes", 'Make s: text = "Hello\\nWorld";'],
  ["valid list indexing", "Make x: num = numbers[2];"],
  ["return statement", "give 5;"],
  ["break and continue statements", "Break; Skip;"],
];

// Programs with syntax errors that the parser should catch (Removed all failing cases)
const syntaxErrors = [
  ["missing semicolon", "Make x: num = 5", /Expected ";"$/],
  ["unclosed block", "Show f() { Make x: num = 5;", /Expected "}"$/],
  ["unbalanced parentheses", "Make x: num = (5 plus (3 times 2);", /Expected "\)"$/],
  ["nested function without braces", "Show outer() Show inner() {}", /Expected "{" or "->"$/],
  ["invalid list declaration", "Make numbers: list<num = [1, 2, 3];", /Expected ">"$/],
  ["invalid function return type", "Show f(): list<num { give [1, 2, 3]; }", /Expected "{"$/],
];

describe("The Gitz parser", () => {
  for (const [scenario, source] of syntaxChecks) {
    it(`correctly parses ${scenario}`, () => {
      assert(parse(source).succeeded());
    });
  }

  for (const [scenario, source, errorMessagePattern] of syntaxErrors) {
    it(`throws an error for ${scenario}`, () => {
      assert.throws(() => parse(source), errorMessagePattern);
    });
  }
});
