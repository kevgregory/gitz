// The code generator exports a single function, generate(program), which
// accepts a program representation and returns the JavaScript translation
// as a string.

import { voidType, standardLibrary } from "./core.js";

export default function generate(program) {
  // When generating code for statements, we'll accumulate the lines of
  // the target code here. When we finish generating, we'll join the lines
  // with newlines and return the result.
  const output = [];

  // Variable and function names in JS will be suffixed with _1, _2, _3, etc.
  // This is because some Gitz identifiers (like "switch") aren't legal
  // bare words in JS. So we map each IR entity to a unique JS name.
  const targetName = ((mapping) => {
    return (entity) => {
      if (!mapping.has(entity)) {
        mapping.set(entity, mapping.size + 1);
      }
      return `${entity.name}_${mapping.get(entity)}`;
    };
  })(new Map());

  // gen(node) will either dispatch to a generators[node.kind], or return node.
  const gen = (node) =>
    node && generators[node.kind] ? generators[node.kind](node) : node;

  const generators = {
    // === Top‐level program ===
    Program(p) {
      p.statements.forEach(gen);
    },

    // === Declarations & statements ===

    VariableDeclaration(d) {
      output.push(`let ${gen(d.variable)} = ${gen(d.initializer)};`);
    },

    TypeDeclaration(d) {
      // (If you later support Gitz structs → JS classes)
      output.push(`class ${gen(d.type)} {`);
      output.push(`  constructor(${d.type.fields.map(gen).join(",")}) {`);
      for (let field of d.type.fields) {
        output.push(`    this[${JSON.stringify(gen(field))}] = ${gen(field)};`);
      }
      output.push("  }");
      output.push("}");
    },

    FunctionDeclaration(d) {
      output.push(
        `function ${gen(d.fun)}(${d.fun.params.map(gen).join(", ")}) {`,
      );
      d.fun.body.forEach(gen);
      output.push("}");
    },

    Assignment(s) {
      output.push(`${gen(s.target)} = ${gen(s.source)};`);
    },

    BreakStatement() {
      output.push("break;");
    },

    ContinueStatement() {
      output.push("continue;");
    },

    ReturnStatement(s) {
      // Gitz always uses `give`, so returns always end in `;`
      output.push(
        s.expression != null ? `return ${gen(s.expression)};` : `return;`,
      );
    },

    IfStatement(s) {
      output.push(`if (${gen(s.test)}) {`);
      s.consequent.forEach(gen);
      if (s.alternate?.kind === "IfStatement") {
        // else‐if
        output.push("} else");
        gen(s.alternate);
      } else if (s.alternate) {
        output.push("} else {");
        s.alternate.forEach(gen);
        output.push("}");
      } else {
        output.push("}");
      }
    },

    WhileStatement(s) {
      output.push(`while (${gen(s.test)}) {`);
      s.body.forEach(gen);
      output.push("}");
    },

    ForStatement(s) {
      // Gitz `Keep x in col { … }` = JS `for (const x of col) { … }`
      output.push(`for (const ${gen(s.iterator)} of ${gen(s.collection)}) {`);
      s.body.forEach(gen);
      output.push("}");
    },

    TryCatchStatement(s) {
      output.push("try {");
      s.tryBlock.forEach(gen);
      output.push("} catch (" + s.errorVar + ") {");
      s.catchBlock.forEach(gen);
      output.push("}");
    },

    PrintStatement(s) {
      // Gitz `say(...)` becomes console.log(...)
      output.push(`console.log(${s.args.map(gen).join(", ")});`);
    },

    // === Expressions ===

    NumberLiteral(e) {
      return e.value.toString();
    },

    StringLiteral(e) {
      return JSON.stringify(e.value);
    },

    BooleanLiteral(e) {
      return e.value ? "true" : "false";
    },

    Variable(v) {
      // π is in our standardLibrary
      return targetName(v);
    },

    Function(f) {
      return targetName(f);
    },

    BinaryExpression(e) {
      // map Gitz ops to JS
      const opMap = {
        plus: "+",
        minus: "-",
        times: "*",
        over: "/",
        mod: "%",
        equal: "===",
        notSame: "!==",
        bigger: ">",
        smaller: "<",
        in: "in",
        and: "&&",
        or: "||",
      };
      const op = opMap[e.op] ?? e.op;
      return `(${gen(e.left)} ${op} ${gen(e.right)})`;
    },

    UnaryExpression(e) {
      const opMap = { minus: "-", not: "!" };
      const op = opMap[e.op] ?? e.op;
      return `(${op}${gen(e.operand)})`;
    },

    FunctionCall(c) {
      // expressions vs. statement‐level calls
      const callExpr = `${gen(c.target)}(${c.args.map(gen).join(", ")})`;
      // if it's a void function, emit as statement
      if (c.target.returnType === voidType) {
        output.push(callExpr + ";");
      } else {
        return callExpr;
      }
    },

    ListLiteral(e) {
      return `[${e.elements.map(gen).join(",")}]`;
    },

    SubscriptExpression(e) {
      return `${gen(e.array)}[${gen(e.index)}]`;
    },

    EmptyInitializer() {
      // uninitialized → undefined
      return "undefined";
    },
  };

  // kick off generation
  gen(program);
  return output.join("\n");
}
