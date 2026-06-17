// Incremental-friendly lexer for Solidity 7.6 (Mini §5.5).
// Fixed to 7.6 — no multi-version pragma grammar, no 0.8.x-only constructs.

export type TokenType =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "type"
  | "builtin"
  | "operator"
  | "identifier"
  | "plain";

export interface Token {
  type: TokenType;
  text: string;
}

const KEYWORDS = new Set([
  "pragma", "solidity", "import", "as", "from",
  "contract", "interface", "library", "abstract",
  "function", "modifier", "event", "struct", "enum", "using", "is",
  "constructor", "fallback", "receive",
  "public", "private", "internal", "external",
  "view", "pure", "payable", "nonpayable", "constant", "immutable",
  "memory", "storage", "calldata",
  "returns", "return", "if", "else", "for", "while", "do", "break", "continue",
  "new", "delete", "emit", "try", "catch", "throw", "revert",
  "virtual", "override", "indexed", "anonymous", "assembly",
  "this", "super", "true", "false", "wei", "gwei", "ether",
  "seconds", "minutes", "hours", "days", "weeks",
]);

const BUILTINS = new Set([
  "require", "assert", "revert", "selfdestruct",
  "keccak256", "sha256", "ripemd160", "ecrecover", "addmod", "mulmod",
  "blockhash", "gasleft", "type", "abi", "msg", "block", "tx",
]);

const VALUE_TYPES = new Set([
  "address", "bool", "string", "bytes", "byte", "mapping", "fixed", "ufixed", "var",
]);

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

function classifyWord(word: string): TokenType {
  if (KEYWORDS.has(word)) return "keyword";
  if (BUILTINS.has(word)) return "builtin";
  if (VALUE_TYPES.has(word)) return "type";
  if (/^(u?int)(\d+)?$/.test(word)) return "type"; // uint, uint8..uint256, int...
  if (/^bytes([1-9]|[12]\d|3[0-2])$/.test(word)) return "type"; // bytes1..bytes32
  return "identifier";
}

/** Tokenize a full Solidity source string into a flat token stream (incl. whitespace as "plain"). */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;
  const push = (type: TokenType, text: string) => {
    if (text.length) tokens.push({ type, text });
  };

  while (i < n) {
    const c = source[i]!;

    // Whitespace (kept as plain to preserve layout)
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      let j = i + 1;
      while (j < n && /[ \t\r\n]/.test(source[j]!)) j++;
      push("plain", source.slice(i, j));
      i = j;
      continue;
    }

    // Line comment
    if (c === "/" && source[i + 1] === "/") {
      let j = i + 2;
      while (j < n && source[j] !== "\n") j++;
      push("comment", source.slice(i, j));
      i = j;
      continue;
    }

    // Block comment
    if (c === "/" && source[i + 1] === "*") {
      let j = i + 2;
      while (j < n && !(source[j] === "*" && source[j + 1] === "/")) j++;
      j = Math.min(n, j + 2);
      push("comment", source.slice(i, j));
      i = j;
      continue;
    }

    // String / hex string
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote || source[j] === "\n") {
          break;
        }
        j++;
      }
      if (source[j] === quote) j++;
      push("string", source.slice(i, j));
      i = j;
      continue;
    }

    // Numbers (hex, scientific, underscores, decimals)
    if (isDigit(c) || (c === "." && isDigit(source[i + 1] ?? ""))) {
      let j = i;
      if (c === "0" && (source[i + 1] === "x" || source[i + 1] === "X")) {
        j = i + 2;
        while (j < n && /[0-9a-fA-F_]/.test(source[j]!)) j++;
      } else {
        while (j < n && /[0-9._]/.test(source[j]!)) j++;
        if (source[j] === "e" || source[j] === "E") {
          j++;
          if (source[j] === "+" || source[j] === "-") j++;
          while (j < n && /[0-9_]/.test(source[j]!)) j++;
        }
      }
      push("number", source.slice(i, j));
      i = j;
      continue;
    }

    // Identifiers / keywords
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(source[j]!)) j++;
      const word = source.slice(i, j);
      push(classifyWord(word), word);
      i = j;
      continue;
    }

    // Operators / punctuation
    if (/[-+*/%=<>!&|^~?:.,;(){}\[\]]/.test(c)) {
      // Greedily group operator characters (not braces/brackets/punct that read better solo)
      if (/[-+*/%=<>!&|^~]/.test(c)) {
        let j = i + 1;
        while (j < n && /[-+*/%=<>!&|^~]/.test(source[j]!)) j++;
        push("operator", source.slice(i, j));
        i = j;
      } else {
        push("operator", c);
        i++;
      }
      continue;
    }

    // Anything else
    push("plain", c);
    i++;
  }

  return tokens;
}
