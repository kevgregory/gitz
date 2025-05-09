const regexes = {
    canadianPostalCode: /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVXY] [0-9][ABCEGHJKLMNPRSTVXY][0-9]$/,
    visa: /^4(?:\d{12}|\d{15})$/,
    masterCard: /^(?:5[1-5]\d{14}|(?:222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)\d{12})$/,
    notThreeEndingInOO:  /^(?![A-Za-z]oo$)[A-Za-z]*$/iu,
    divisibleBy16:  /^(?:0+|[01]*0000)$/,
    eightThroughThirtyTwo:  /^(?:[89]|[12]\d|3[0-2])$/,
    notPythonPycharmPyc:  /^(?!(?:python|pycharm|pyc)$)[\p{L}]*$/u,
    restrictedFloats:  /^\d+(?:\.\d*)?[eE][+-]?\d{1,3}$/i,
    palindromes2358: /^(?:([abc])\1|([abc])([abc])\2|([abc])([abc])([abc])\5\4|([abc])([abc])([abc])([abc])\10\9\8\7)$/,
    pythonStringLiterals: /^[fF]?(?:"""(?:\\.|(?!""")[\s\S])*?"""|'''(?:\\.|(?!''')[\s\S])*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/,
  }
  
  export function matches(name, string) {
    return regexes[name].test(string)
  }  