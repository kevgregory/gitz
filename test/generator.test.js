// test/generator.test.js
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import parse from "../src/parser.js"
import analyze from "../src/analyzer.js"
import optimize from "../src/optimizer.js"
import generate from "../src/generator.js"

function dedent(s) {
  return `${s}`.replace(/(?<=\n)\s+/g, "").trim()
}

const fixtures = [
  {
    name: "simple var + print",
    source: `
      Make x: num = 42;
      say(x);
    `,
    expected: dedent`
      let x_1 = 42;
      console.log(x_1);
    `
  },
  {
    name: "list literal",
    source: `
      Make xs: list<num> = [1, 2];
      say(xs);
    `,
    expected: dedent`
      let xs_1 = [1,2];
      console.log(xs_1);
    `
  },
  {
    name: "list indexing",
    source: `
      Make xs: list<num> = [7];
      say(xs[0]);
    `,
    expected: dedent`
      let xs_1 = [7];
      console.log(xs_1[0]);
    `
  },
  {
    name: "function declaration",
    source: `
      Show hello() { say("hi"); }
    `,
    expected: dedent`
      function hello_1() {
      console.log("hi");
      }
    `
  }
]

describe("Gitz → JavaScript generator", () => {
  for (const { name, source, expected } of fixtures) {
    it(name, () => {
      const js = generate(
        optimize(analyze(parse(source)))
      )
      assert.equal(js, expected)
    })
  }
})
