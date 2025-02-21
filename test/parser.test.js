import { describe, it } from "node:test"
import assert from "node:assert/strict"
import parse from "../src/parser.js"

// Programs expected to be syntactically correct
const syntaxChecks = [
  ["simplest statement", 'say("Hello, World!");'],
  ["multiple statements", 'Make x: num = 5;\nsay(x);'],
  ["variable declarations", 'Make e: num = 99 * 1;'],
  ["list declarations", 'list vowels: text = ["a", "e", "i", "o", "u"];'],
  ["function with no params, no return type", `Show hello() -> void:\n  say("Hi");`],
  ["function with one param", `Show f(x: num) -> num:\n  give x;`],
  ["function with two params", `Show f(x: num, y: num) -> num:\n  give x plus y;`],
  ["assignments", 'Make x: num = 5;\nx = x plus 1;'],
  ["call in statement", 'say("Number is", countVowels("Hello"));'],
  ["short if", `When true:\n  say("Yes");`],
  ["if with else", `When false:\n  say("No");\norElse:\n  say("Yes");`],
  ["while loop", `Keep x smaller 10:\n  x = x plus 1;`],
  ["function calls", `Show add(a: num, b: num) -> num:\n  give a plus b;`],
  ["complex expression", 'say(5 plus 3 times 2);'],
  ["logical operations", `When a and b or c:\n  say("Logic works");`],
  ["bitwise operations", 'say(5 bitOr 3 bitAnd 1);'],
  ["comparisons", `When x smaller y or x equal y:\n  say("True");`],
  ["list indexing", 'say(vowels at 2);'],
  ["return statements", `Show f() -> num:\n  give 10;`],
]

// Programs with syntax errors
const syntaxErrors = [
  ["missing semicolon", "Make x: num = 5", /Expected ";"$/],
  ["missing function return type", "Show f(x: num): x = x plus 1;", /Expected "->" Type/],
  ["missing function body", "Show f(x: num) -> num;", /Expected ":"/],
  ["invalid assignment", "5 = x;", /Invalid assignment target/],
  ["unexpected token", "Make x: num = 5 say(x);", /Expected ";" before say/],
  ["missing closing parenthesis", 'say("Hello, World!"', /Expected "\)"/],
  ["missing block for loop", "Keep x smaller 10;", /Expected ":"/],
  ["function missing parameter type", "Show f(x) -> num: give x;", /Expected ":"/],
  ["list missing brackets", "list nums: num = 1, 2, 3;", /Expected "\["/],
]

describe("The Gitz parser", () => {
  for (const [scenario, source] of syntaxChecks) {
    it(`correctly parses ${scenario}`, () => {
      assert(parse(source).succeeded(), `Parsing failed for: ${source}`)
    })
  }
  for (const [scenario, source, errorMessagePattern] of syntaxErrors) {
    it(`detects syntax error for ${scenario}`, () => {
      assert.throws(() => parse(source), errorMessagePattern)
    })
  }
})
