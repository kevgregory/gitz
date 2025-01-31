![Gitz Logo](docs/Gitz.svg)

# gitz
Gitz is a programming language that embraces broken English while still being readable and functional. Gitz is designed to be fun, expressive and intuitive. Gitz is designed to so that people can write code as if they were talking, but it still compiles

Gitz is perfect for those who think programming should have more personality. If python is readable, Gitz is vibable

## Features

- **Say Stuff:** No need for `print()`. Just use `say()`.
- **Make Things:** Declare variables with `Make` and **define their type**.
- **Keep Doing Things:** Use `Keep` for loops.
- **Show How To Do Stuff:** Define functions with `Show()`, return values with `give()`.
- **When This Happens:** Handle conditions with `When` and `orElse`.
- **Compare Things:** Use `bigger`, `smaller`, `equal`, `notSame` for comparisons.
- **Do Math:** Use `plus`, `minus`, `times`, `over`, `mod` for calculations.
- **Keep Lists:** Use `list` to store multiple things.
- **Static Typing:** Even though Gitz **feels casual**, types **must match**.

---

## Examples

### Variables and Printing

#### Python
```python
name = "Bob"
print("Hello", name)
```
#### Gitz
```gitz
Make name: text = "Alice"
say("Hello", name)
```

---

### Loops

#### Python
```python
x = 0
while x < 10:
    print(x)
    x += 1
```
#### Gitz
```gitz
Make x: num = 0
Keep x smaller 10:
    say(x)
    x = x plus 1
```

---

### If-Else Statements

#### Python
```python
if x > 5:
    print("Big number!")
else:
    print("Small number!")
```
#### Gitz
```gitz
When x bigger 5:
    say("Big number!")
orElse:
    say("Small number!")
```

---

### Functions

#### Python
```python
def greet(name):
    return "Hello " + name
```
#### Gitz
```gitz
Show greet(name: text) -> text:
    give "Hello " plus name
```

---

### Lists

#### Python
```python
fruits = ["apple", "banana", "cherry"]
print(fruits[0])
```
#### Gitz
```gitz
list fruits: text = ["apple", "banana", "cherry"]
say(fruits at 0)
```
