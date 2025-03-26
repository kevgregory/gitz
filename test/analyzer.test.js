import { describe, it } from "node:test"
import assert from "node:assert/strict"
import parse from "../src/parser.js"
import analyze from "../src/analyzer.js"
import { program, variableDeclaration, variable, binary, numType } from "../src/core.js"

// Gitz-compatible test cases (semanticChecks)
const semanticChecks = [
  ["simple variable declaration", "Make x: num = 1;"],
  ["boolean assignment", "Make y: bool = true;"],
  ["function with return", "Show f(): num { give 5; }"],
  ["nested if", "Show f() { When true { give; } }"],
  ["list indexing", "Make a: list[num] = [1]; Make x: num = a[0];"],
  ["optional assignment", "Make x: num = 2; Make y: num = x;"],
  ["binary arithmetic", "Make x: num = 1 + 2 * 3;"],
  ["function call with param", "Show f(x: num) {} f(3);"],
  ["list initialization", "Make a: list[num] = [1,2,3];"],
  ["struct creation", "Make x: num = 1;"],
  ["function returning function", "Show f(): (num)->num { give f; }"],
]

// Failing tests expected to throw with specific error patterns
const semanticErrors = [
  ["undeclared variable", "say(x);", /Identifier x not declared/],
  ["redeclared variable", "Make x: num = 1; Make x: num = 2;", /Identifier x already declared/],
  ["invalid return", "give;", /Return used outside of a function/],
  ["type mismatch in return", "Show f(): num { give true; }", /Cannot assign bool to num/],
  ["assign to const", "const x = 1; x = 2;", /Cannot assign to immutable/],
  ["call with wrong param", "Show f(x: num) {} f(true);", /Cannot assign bool to num/],
  ["bad optional unwrap", "say(1 ?? 2);", /Expected an optional/],
  ["wrong type in conditional", "say(true ? 1 : false);", /Operands must have same type/],
  ["assign wrong type", "Make x: num = 1; x = true;", /Cannot assign bool to num/],
  ["access non-existent field", "Make x: num = 1; say(x.y);", /No such field/],
]

describe("The analyzer", () => {
  for (const [scenario, source] of semanticChecks) {
    it(`recognizes ${scenario}`, () => {
      assert.ok(analyze(parse(source)))
    })
  }
  for (const [scenario, source, errorMessagePattern] of semanticErrors) {
    it(`throws on ${scenario}`, () => {
      assert.throws(() => analyze(parse(source)), errorMessagePattern)
    })
  }
  it("produces the expected representation for a trivial program", () => {
    assert.deepEqual(
      analyze(parse("Make x: num = π plus 2.2;")),
      program([
        variableDeclaration(
          variable("x", true, numType),
          binary("plus", variable("π", false, numType), 2.2, numType)
        ),
      ])
    )
  })
})