// test/optimizer.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import optimize from "../src/optimizer.js";
import * as core from "../src/core.js";

// A dummy node kind not in optimizers
const Foo = { kind: "Foo" };

describe("optimizer basic pass-through", () => {
  it("returns unknown nodes unchanged", () => {
    const x = { kind: "Bar", foo: 123 };
    assert.strictEqual(optimize(x), x);
  });
});

describe("Program", () => {
  it("recurses into statements", () => {
    const foo1 = { kind: "Foo" };
    const foo2 = { kind: "Foo" };
    const p = { kind: "Program", statements: [foo1, foo2] };
    const out = optimize(p);
    assert.strictEqual(out, p);
    assert.deepEqual(out.statements, [foo1, foo2]);
  });
});

describe("VariableDeclaration", () => {
  it("optimizes the initializer", () => {
    const init = { kind: "Foo" };
    const vd = { kind: "VariableDeclaration", initializer: init };
    const out = optimize(vd);
    assert.strictEqual(out, vd);
    assert.strictEqual(out.initializer, init);
  });
});

describe("FunctionDeclaration", () => {
  it("optimizes the function body", () => {
    const stmt = { kind: "Foo" };
    const fd = { kind: "FunctionDeclaration", fun: { body: [stmt] } };
    const out = optimize(fd);
    assert.strictEqual(out, fd);
    assert.deepEqual(out.fun.body, [stmt]);
  });
});

describe("Increment / Decrement", () => {
  it("recurses into variable on Increment", () => {
    const inc = { kind: "Increment", variable: Foo };
    const out = optimize(inc);
    assert.strictEqual(out, inc);
    assert.strictEqual(out.variable, Foo);
  });
  it("recurses into variable on Decrement", () => {
    const dec = { kind: "Decrement", variable: Foo };
    const out = optimize(dec);
    assert.strictEqual(out, dec);
    assert.strictEqual(out.variable, Foo);
  });
});

describe("Assignment", () => {
  it("drops x = x", () => {
    const a = { kind: "Assignment", source: Foo, target: Foo };
    assert.deepEqual(optimize(a), []);
  });
  it("keeps x = y", () => {
    const a = { kind: "Assignment", source: Foo, target: { kind: "Bar" } };
    assert.strictEqual(optimize(a), a);
  });
});

describe("ReturnStatement / ShortReturnStatement", () => {
  it("optimizes expression in ReturnStatement", () => {
    const expr = { kind: "Foo" };
    const ret = { kind: "ReturnStatement", expression: expr };
    const out = optimize(ret);
    assert.strictEqual(out, ret);
    assert.strictEqual(out.expression, expr);
  });
  it("passes ShortReturnStatement through", () => {
    const sr = { kind: "ShortReturnStatement" };
    assert.strictEqual(optimize(sr), sr);
  });
});

describe("IfStatement / ShortIfStatement", () => {
  it("handles nested else-if", () => {
    const inner = { kind: "ElseIfStatement", test: true, consequent: [], alternate: [] };
    const outer = {
      kind: "IfStatement",
      test: { kind: "Foo" },
      consequent: [],
      alternate: inner
    };
    const out = optimize(outer);
    assert.strictEqual(out, outer);
    assert.strictEqual(out.alternate, inner);
  });

  it("constant-true IfStatement ⇒ consequent", () => {
    const cs = { kind: "Foo" };
    const alt = { kind: "Bar" };
    const st = { kind: "IfStatement", test: true, consequent: [cs], alternate: [alt] };
    assert.deepEqual(optimize(st), [cs]);
  });

  it("constant-false IfStatement ⇒ alternate", () => {
    const cs = { kind: "Foo" };
    const alt = { kind: "Bar" };
    const st = { kind: "IfStatement", test: false, consequent: [cs], alternate: [alt] };
    assert.deepEqual(optimize(st), [alt]);
  });

  it("ShortIfStatement true/false", () => {
    const xpp = { kind: "Foo" };
    const sif = { kind: "ShortIfStatement", test: true, consequent: [xpp] };
    assert.deepEqual(optimize(sif), [xpp]);
    const sif2 = { kind: "ShortIfStatement", test: false, consequent: [xpp] };
    assert.deepEqual(optimize(sif2), []);
  });
});

describe("Loops", () => {
  it("WhileStatement false ⇒ []", () => {
    const w = { kind: "WhileStatement", test: false, body: [Foo] };
    assert.deepEqual(optimize(w), []);
  });
  it("RepeatStatement zero ⇒ []", () => {
    const r = { kind: "RepeatStatement", count: 0, body: [Foo] };
    assert.deepEqual(optimize(r), []);
  });
});

describe("ForRangeStatement / ForStatement", () => {
  it("ForRange low>high ⇒ []", () => {
    const fr = { kind: "ForRangeStatement", low: 5, high: 2, body: [Foo] };
    assert.deepEqual(optimize(fr), []);
  });
  it("ForStatement EmptyArray ⇒ []", () => {
    const fs = { kind: "ForStatement", collection: { kind: "EmptyArray" }, body: [Foo] };
    assert.deepEqual(optimize(fs), []);
  });
});

describe("Conditional", () => {
  it("true ⇒ consequent", () => {
    const c = { kind: "Conditional", test: true, consequent: "A", alternate: "B" };
    assert.strictEqual(optimize(c), "A");
  });
  it("false ⇒ alternate", () => {
    const c = { kind: "Conditional", test: false, consequent: "A", alternate: "B" };
    assert.strictEqual(optimize(c), "B");
  });
});

describe("BinaryExpression", () => {
  it("unwraps EmptyOptional", () => {
    const be = { kind: "BinaryExpression", op: "??", left: { kind: "EmptyOptional" }, right: 42 };
    assert.strictEqual(optimize(be), 42);
  });
  it("boolean shortcuts || and &&", () => {
    assert.strictEqual(optimize({ kind: "BinaryExpression", op: "||", left: false, right: "R" }), "R");
    assert.strictEqual(optimize({ kind: "BinaryExpression", op: "||", left: "L", right: false }), "L");
    assert.strictEqual(optimize({ kind: "BinaryExpression", op: "&&", left: true, right: "R" }), "R");
    assert.strictEqual(optimize({ kind: "BinaryExpression", op: "&&", left: "L", right: true }), "L");
  });
  it("strength reductions & constant folding", () => {
    // fold all arithmetic and comparisons
    const ops = [
      ["+",  3, 4, 7], ["-", 10, 3, 7], ["*", 5, 6, 30], ["/", 9, 3, 3],
      ["**", 2, 3, 8], ["<", 1, 2, true], ["<=", 2, 2, true],
      ["==", 2, 3, false], ["!=", 2, 2, false], [">=", 2, 3, false],
      [">",  3, 2, true],
    ];
    for (let [op, L, R, want] of ops) {
      assert.strictEqual(
        optimize({ kind: "BinaryExpression", op, left: L, right: R }),
        want,
        `fold ${L} ${op} ${R}`
      );
    }

    // left‐constant strength reductions
    assert.strictEqual(optimize({ kind: "BinaryExpression", op: "*", left: 1, right: "Y" }), "Y");
    assert.strictEqual(optimize({ kind: "BinaryExpression", op: "/", left: 0, right: "X" }), 0);

    // **right**‐constant strength reductions
    assert.strictEqual(optimize({ kind: "BinaryExpression", op: "+", left: "L", right: 0 }), "L");
    assert.strictEqual(optimize({ kind: "BinaryExpression", op: "*", left: "L", right: 1 }), "L");
    assert.strictEqual(optimize({ kind: "BinaryExpression", op: "*", left: "X", right: 0 }), 0);

    // ——— now cover the last three branches ———
    // left‐zero plus
    assert.strictEqual(
      optimize({ kind: "BinaryExpression", op: "+", left: 0, right: "R" }),
      "R"
    );

    // left‐zero minus ⇒ unary negation
    const u = optimize({ kind: "BinaryExpression", op: "-", left: 0, right: "R" });
    assert.equal(u.kind, "UnaryExpression");
    assert.equal(u.op, "-");
    assert.strictEqual(u.operand, "R");

    // exponent zero on right ⇒ 1
    assert.strictEqual(
      optimize({ kind: "BinaryExpression", op: "**", left: "X", right: 0 }),
      1
    );

    // fall‐through raw‐op
    const raw = { kind: "BinaryExpression", op: "FOO", left: Foo, right: Foo };
    assert.strictEqual(optimize(raw), raw);
  });
});

describe("UnaryExpression", () => {
  it("constant negation", () => {
    const ue = { kind: "UnaryExpression", op: "-", operand: 5 };
    assert.strictEqual(optimize(ue), -5);
  });
  it("pass through other", () => {
    const ue2 = { kind: "UnaryExpression", op: "foo", operand: Foo };
    const out = optimize(ue2);
    assert.strictEqual(out, ue2);
    assert.strictEqual(out.operand, Foo);
  });
});

describe("pass-through nodes", () => {
  for (const K of [
    "SubscriptExpression",
    "ArrayExpression",
    "MemberExpression",
    "FunctionCall",
    "ConstructorCall",
    "Print",
  ]) {
    it(`passes through ${K}`, () => {
      const node = { kind: K, foo: 123, args: [Foo], object: Foo, index: Foo, elements: [Foo] };
      assert.strictEqual(optimize(node), node);
    });
  }
});

// ─── extra tests to hit every other branch ───
describe("all other branches", () => {
  it("passes BreakStatement", () => {
    const b = { kind: "BreakStatement" };
    assert.strictEqual(optimize(b), b);
  });

  it("ShortIfStatement non-boolean ⇒ same node", () => {
    const s = { kind: "ShortIfStatement", test: { kind: "Foo" }, consequent: [Foo] };
    assert.strictEqual(optimize(s), s);
  });

  it("WhileStatement true ⇒ same node", () => {
    const w = { kind: "WhileStatement", test: true, body: [Foo] };
    const out = optimize(w);
    assert.strictEqual(out, w);
    assert.deepEqual(out.body, [Foo]);
  });

  it("RepeatStatement non-zero ⇒ same node", () => {
    const r = { kind: "RepeatStatement", count: 2, body: [Foo] };
    const out = optimize(r);
    assert.strictEqual(out, r);
    assert.deepEqual(out.body, [Foo]);
  });

  it("ForRange low≤high ⇒ same node", () => {
    const fr = { kind: "ForRangeStatement", low: 1, high: 3, body: [Foo] };
    assert.strictEqual(optimize(fr), fr);
  });

  it("ForStatement non-empty ⇒ same node", () => {
    const fs = { kind: "ForStatement", collection: { kind: "NotEmpty" }, body: [Foo] };
    assert.strictEqual(optimize(fs), fs);
  });

  it("Conditional non-boolean ⇒ same node", () => {
    const c = { kind: "Conditional", test: { kind: "Foo" }, consequent: 1, alternate: 2 };
    assert.strictEqual(optimize(c), c);
  });

  it("recurses into Print.args", () => {
    const bin = { kind: "BinaryExpression", op: "+", left: 2, right: 3 };
    const p = { kind: "Print", args: [bin] };
    const out = optimize(p);
    assert.strictEqual(out, p);
    assert.deepEqual(out.args, [5]);
  });
});
