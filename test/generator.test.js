import { describe, it } from "node:test";
import assert from "node:assert/strict";
import parse from "../src/parser.js";
import analyze from "../src/analyzer.js";
import optimize from "../src/optimizer.js";
import generate from "../src/generator.js";
import {
  program,
  typeDeclaration,
  field,
  assignment,
  variable,
  breakStatement,
  continueStatement,
  ifStatement,
  sayStatement,
  binary,
  unary,
  returnStatement,
  numType,
  boolType,
  tryCatch,
  whileStatement,
  forStatement,
  standardLibrary,
} from "../src/core.js";

function dedent(s) {
  return `${s}`.replace(/(?<=\n)\s+/g, "").trim();
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
    `,
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
    `,
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
    `,
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
    `,
  },
  {
    name: "return with expression",
    source: `
      Show f() -> num { give 5; }
    `,
    expected: dedent`
      function f_1() {
      return 5;
      }
    `,
  },
  {
    name: "print multiple args",
    source: `
      say(1, 2);
    `,
    expected: dedent`
      console.log(1, 2);
    `,
  },
  {
    name: "boolean literal true",
    source: `
      say(true);
    `,
    expected: dedent`
      console.log(true);
    `,
  },
  {
    name: "boolean literal false",
    source: `
      say(false);
    `,
    expected: dedent`
      console.log(false);
    `,
  },
  {
    name: "unary minus",
    source: `
      say(minus 5);
    `,
    expected: dedent`
      console.log((-5));
    `,
  },
  {
    name: "unary not",
    source: `
      say(not false);
    `,
    expected: dedent`
      console.log((!false));
    `,
  },
  {
    name: "pi variable",
    source: `
      say(π);
    `,
    expected: dedent`
      console.log(3.141592653589793);
    `,
  },
  {
    name: "non-void function call in print",
    source: `
      Show f() -> num { give 7; } say(f());
    `,
    expected: dedent`
      function f_1() {
      return 7;
      }
      console.log(f_1());
    `,
  },
  {
    name: "void function call statement",
    source: `
      Show f() { say(1); } f();
    `,
    expected: dedent`
      function f_1() {
      console.log(1);
      }
      f_1();
    `,
  },
  {
    name: "empty initializer",
    source: `
      Make x: num; say(x);
    `,
    expected: dedent`
      let x_1 = undefined;
      console.log(x_1);
    `,
  },
];

describe("Gitz → JavaScript generator (fixtures)", () => {
  for (const { name, source, expected } of fixtures) {
    it(name, () => {
      const js = generate(optimize(analyze(parse(source))));
      assert.equal(js, expected);
    });
  }
});

describe("Gitz → JavaScript generator (direct IR)", () => {
  it("generates assignment IR", () => {
    const v = variable("a", true, numType);
    const as = assignment(v, {
      kind: "NumberLiteral",
      value: 5,
      type: numType,
    });
    assert.equal(generate(program([as])), "a_1 = 5;");
  });

  it("generates break;", () => {
    assert.equal(generate(program([breakStatement()])), "break;");
  });

  it("generates continue;", () => {
    assert.equal(generate(program([continueStatement()])), "continue;");
  });

  it("generates return without expression IR", () => {
    const js = generate(program([returnStatement(null)]));
    assert.equal(js, "return;");
  });

  it("emits the else-if branch when alternate is another IfStatement", () => {
    const inner = ifStatement(
      true,
      [sayStatement([{ kind: "NumberLiteral", value: 1, type: numType }])],
      null,
    );
    const outer = ifStatement(
      false,
      [sayStatement([{ kind: "NumberLiteral", value: 0, type: numType }])],
      inner,
    );
    const js = generate(program([outer]));
    assert.match(js, /\} else\s*if/);
  });

  it("emits the else branch when alternate is a statement array", () => {
    const alt = [
      sayStatement([{ kind: "NumberLiteral", value: 9, type: numType }]),
    ];
    const node = ifStatement(
      false,
      [sayStatement([{ kind: "NumberLiteral", value: 0, type: numType }])],
      alt,
    );
    const js = generate(program([node]));
    assert.match(js, /\} else \{/);
    assert.match(js, /console\.log\(9\);/);
  });

  it("generates while loop IR", () => {
    const testNode = { kind: "BooleanLiteral", value: true, type: boolType };
    const body = [
      sayStatement([{ kind: "NumberLiteral", value: 1, type: numType }]),
    ];
    const ws = whileStatement(testNode, body);
    const js = generate(program([ws]));
    assert.equal(js, "while (true) {\nconsole.log(1);\n}");
  });

  it("generates for loop IR", () => {
    const iter = variable("i", true, numType);
    const coll = {
      kind: "ListLiteral",
      elements: [{ kind: "NumberLiteral", value: 3, type: numType }],
      type: "list<num>",
    };
    const fs = forStatement(iter, coll, [
      sayStatement([{ kind: "NumberLiteral", value: 3, type: numType }]),
    ]);
    const js = generate(program([fs]));
    assert.equal(js, "for (const i_1 of [3]) {\nconsole.log(3);\n}");
  });

  it("generates try-catch IR", () => {
    const tryBody = [
      sayStatement([{ kind: "NumberLiteral", value: 1, type: numType }]),
    ];
    const catchBody = [
      sayStatement([{ kind: "NumberLiteral", value: 2, type: numType }]),
    ];
    const tc = tryCatch(tryBody, "e", catchBody);
    const js = generate(program([tc]));
    assert.equal(
      js,
      "try {\nconsole.log(1);\n} catch (e) {\nconsole.log(2);\n}",
    );
  });

  it("falls back to raw op when it’s not in opMap", () => {
    const fooBin = binary(
      "FOO",
      { kind: "NumberLiteral", value: 3, type: numType },
      { kind: "NumberLiteral", value: 4, type: numType },
      numType,
    );
    const js = generate(program([sayStatement([fooBin])])).trim();
    assert.equal(js, "console.log((3 FOO 4));");
  });

  it("falls back to raw unary op when it’s not in opMap", () => {
    const fooUnary = unary(
      "FOOOP",
      { kind: "NumberLiteral", value: 9, type: numType },
      numType,
    );
    const js = generate(program([sayStatement([fooUnary])])).trim();
    assert.equal(js, "console.log((FOOOP9));");
  });

  it("generates numeric π literal, not Math.PI", () => {
    const js = generate(program([sayStatement([standardLibrary.π])])).trim();
    assert.equal(js, "console.log(3.141592653589793);");
  });

  it("generates JS class shape, exercising the TypeDeclaration loop", () => {
    const td = typeDeclaration({
      name: "MyStruct",
      fields: [field("a", numType), field("b", numType)],
    });
    const js = generate(program([td]));
    assert.match(js, /constructor\([^)]+\)/);
  });
});
