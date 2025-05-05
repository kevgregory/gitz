![Gitz Logo](docs/Gitz.png)

# gitz
Gitz is a programming language that embraces broken English while still being readable and functional. Gitz is designed to be fun, expressive and intuitive. Gitz is designed to so that people can write code as if they were talking, but it still compiles

Gitz is perfect for those who think programming should have more personality. If python is readable, Gitz is vibable

##  Features

- **Say Stuff:** No need for `print()`. Just use `say()`.
- **Make Things:** Declare variables with `Make` and **define their type**.
- **Keep Doing Things:** Use `Keep` for loops.
- **Show How To Do Stuff:** Define functions with `Show()`, return values with `give()`.
- **When This Happens:** Handle conditions with `When` and `orElse`.
- **Compare Things:** Use `bigger`, `smaller`, `equal`, `notSame` for comparisons.
- **Do Math:** Use `plus`, `minus`, `times`, `over`, `mod` for calculations.
- **Keep Lists:** Use `list` to store multiple things.
- **Static Typing:** Even though Gitz **feels casual**, types **must match**.

## Static Analysis and Type Checking
Our compiler for Gitz includes a robust static analyzer (implemented in analyzer.js) that performs several compile-time checks to catch errors before the program runs. The static analyzer ensures that:

**Scope Resolution:**
Variables must be declared before use. Each block or function creates a new context so that identifiers are properly scoped, and redeclarations are prevented.

**Static Type Checking:**
All expressions and assignments are validated to ensure that types are consistent. Arithmetic, boolean expressions, and assignments are checked so that only compatible types are used. For example, assigning a boolean value to a variable declared as a number will trigger an error.

**Function Parameter Matching:**
The analyzer verifies that functions are called with the correct number of arguments and that each argument matches its parameter’s declared type. Additionally, the return statement within a function must produce a value that matches the function’s declared return type.

**Control Flow Enforcement:**
Control flow constructs are rigorously checked. break and continue statements are allowed only within loops, and return statements are only permitted inside functions with a matching return type.

**List Type Consistency:**
For list literals, the analyzer ensures that all elements are of the same type. If a list is declared with a specific element type, every element must conform to that type.

While these static checks catch many common errors at compile time, some dynamic behaviors (like runtime values and certain library operations) are deferred to execution.

---

## Examples

### Variables and Printing

#### JavaScript
```javascript
let name = "Bob";
console.log("Hello", name);
```
#### Gitz
```gitz
Make name: text = "Alice";
say("Hello", name);
```

---

### Loops

#### JavaScript
```javascript
let x = 0;
while (x < 10) {
    console.log(x);
    x += 1;
}
```
#### Gitz
```gitz
Make x: num = 0;
Keep x smaller 10 {
    say(x);
    x = x plus 1;
}
```

---

### If-Else Statements

#### JavaScript
```javascript
if (x > 5) {
    console.log("Big number!");
} else {
    console.log("Small number!");
}
```
#### Gitz
```gitz
When x bigger 5 {
    say("Big number!");
} orElse {
    say("Small number!");
}
```

---

### Functions

#### JavaScript
```javascript
function greet(name) {
    return "Hello " + name;
}
```
#### Gitz
```gitz
Show greet(name: text) -> text {
    give "Hello " plus name;
}
```

---

### Lists

#### JavaScript
```javascript
let fruits = ["apple", "banana", "cherry"];
console.log(fruits[0]);
```
#### Gitz
```gitz
Make fruits: list<text> = ["apple", "banana", "cherry"];
say(fruits[0]);
```

### Generated Code Examples : 
#### circle_area.gitz
```gitz
Make radii: list<num> = [1, 2, 3, 4, 5];

Show area(r: num) -> num {
  give 3.14159 mod r mod r;
}

Keep r in radii {
  say("r equal " plus r plus ": area=" plus area(r));
}
```
```javascript
let radii_1 = [1,2,3,4,5];
function area_2(r_3) {
return ((3.14159 r r_3) r r_3);
}
for (const r_4 of radii_1) {
console.log(((("r equal " r r_4) ": area=" ": area=") area(r) area_2(r_4)));
}
```

#### trial_primes.gitz
```gitz
Make limit: num = 50;

Keep n in range(2, limit) {
  Make isPrime: num = 1;
  Keep d in range(2, n minus 1) {
    When n mod d equal 0 {
      isPrime = 0;
    }
  }
  When isPrime equal 1 {
    say(n);
  }
}
```
```javascript
let limit_1 = 50;
for (const n_2 of range_3(2, limit_1)) {
  let isPrime_4 = 1;
}
```
### Authors
- Kevin Thomas
- Callista Napitupulu
- Stanley Gunawan

### Website Link : 
https://kevgregory.github.io/gitz/
