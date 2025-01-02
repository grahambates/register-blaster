import Parser from "web-tree-sitter";
import { getSizeBytes } from "./syntax";

export interface RegReference {
  startIndex: number;
  endIndex: number;
  line: number;
  isRead: boolean;
  isWrite: boolean;
  size: number;
}

export interface RegInfo {
  name: string;
  isRead: boolean;
  isWrite: boolean;
  isInput: boolean;
  maxReadSize?: number;
  maxWriteSize?: number;
  inputSize?: number;
  firstUse: number;
  refs: RegReference[];
}

// Op size is word, with these exceptions:
const longDefault = ["moveq", "exg", "lea", "pea"];
const byteDefault = [
  "nbcd",
  "abcd",
  "sbcd",
  "scc",
  "tas",
  "scc",
  "scs",
  "seq",
  "sge",
  "sgt",
  "shi",
  "sle",
  "slt",
  "smi",
  "sne",
  "spl",
  "svc",
  "svs",
  "st",
  "sf",
  "sls",
];
const bitOps = ["bchg", "bset", "bclr", "btst"];

// Dest register is read/write, with these exceptions:
const readOnlyDest = ["tst", "cmp", "btst"];
const writeOnlyDest = ["lea", "move", "moveq", "movem", "movea"];

export default function getRegInfo(tree: Parser.Tree): RegInfo[] {
  const regUsage: Record<string, RegReference[]> = {
    d0: [],
    d1: [],
    d2: [],
    d3: [],
    d4: [],
    d5: [],
    d6: [],
    d7: [],
    a0: [],
    a1: [],
    a2: [],
    a3: [],
    a4: [],
    a5: [],
    a6: [],
    a7: [],
  };

  const regs = tree.rootNode.descendantsOfType([
    "address_register",
    "data_register",
    "named_register",
  ]);

  for (const {
    startIndex,
    endIndex,
    parent,
    text,
    type,
    startPosition,
  } of regs) {
    let regName = text.toLowerCase();

    // Not interested in named regs other than SP
    if (type === "named_register" && regName !== "sp") {
      continue;
    }
    // Normalise reg name
    if (regName === "sp") {
      regName = "a7";
    }

    let isDest = false;
    let op: string | undefined;
    let opSize: string | undefined;
    const parents: string[] = [];

    for (let p = parent; p; p = p?.parent ?? null) {
      parents.push(p.type);
      if (p.type === "operand_list") {
        isDest = p.lastChild?.startIndex === startIndex;
      }
      if (p.type === "instruction") {
        op = p.childForFieldName("mnemonic")?.text.toLowerCase();
        opSize = p.childForFieldName("size")?.text.toLowerCase();

        // Default op sizes
        if (op && !opSize) {
          if (longDefault.includes(op)) {
            opSize = "l";
          } else if (byteDefault.includes(op)) {
            opSize = "b";
          } else if (bitOps.includes(op)) {
            // longword if dest is register, else byte
            opSize =
              isDest &&
                p.childForFieldName("operands")?.lastChild?.type ===
                "data_register"
                ? "l"
                : "b";
          } else {
            opSize = "w";
          }
        }
        // Special case for div dest
        if ((op === "divs" || op === "divu") && isDest) {
          opSize = "l";
        }
      }
    }

    // Ignore movem for now
    // TODO: find way to handle these
    if (parents.includes("register_list")) {
      continue;
    }

    const isDirect =
      parents[0] === "operand_list" || parents.includes("register_list");
    const isWrite = isDirect && isDest && !!op && !readOnlyDest.includes(op);
    const isRead = !(isDirect && isDest && !!op && writeOnlyDest.includes(op));

    // Indirect will be longword unless offset idx
    let size = isDirect ? opSize : "l";
    if (parent?.type === "idx") {
      size = parent.childForFieldName("size")?.text.toLowerCase() ?? "w";
    }
    if (!size) {
      size = "w";
    }

    regUsage[regName].push({
      startIndex,
      endIndex,
      line: startPosition.row,
      isRead,
      isWrite,
      size: getSizeBytes(size) ?? 2,
    });
  }

  const regInfo: RegInfo[] = [];
  for (const reg in regUsage) {
    const refs = regUsage[reg];
    const reads = refs.filter((r) => r.isRead);
    const writes = refs.filter((r) => r.isWrite);
    const maxReadSize = Math.max(...reads.map((r) => r.size));
    const maxWriteSize = Math.max(...writes.map((r) => r.size));
    const firstUse = Math.min(...refs.map((r) => r.line));
    const input = refs.find(r => r.line === firstUse && r.isRead)
    regInfo.push({
      name: reg,
      isRead: reads.length > 0,
      isWrite: writes.length > 0,
      isInput: !!input,
      maxReadSize,
      maxWriteSize,
      inputSize: input?.size,
      firstUse,
      refs,
    });
  }

  return regInfo;
}
