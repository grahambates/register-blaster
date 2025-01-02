import { FC } from "react";
import SimpleEditor from "react-simple-code-editor";
import "./theme.css";
import Parser from "web-tree-sitter";

export interface EditorProps {
  source: string
  hoverReg?: string
  tree?: Parser.Tree
  onChange: (s: string) => void
}

// Node type to syntax class name
const highlightMappings = {
  symbol: "variable",
  instruction_mnemonic: "function",
  directive_mnemonic: "function",
  control_mnemonic: "keyword",
  size: "attr-name",
  string_literal: "string",
  decimal_literal: "number",
  hexadecimal_literal: "number",
  octal_literal: "number",
  binary_literal: "number",
  reptn: "variable",
  carg: "variable",
  narg: "variable",
  macro_arg: "variable",
  address_register: "keyword",
  data_register: "keyword",
  float_register: "keyword",
  named_register: "keyword",
  comment: "comment",
  operator: "operator",
};

const Editor: FC<EditorProps> = ({ source, hoverReg, tree, onChange }) => {
  const highlight = (source: string) => {
    const highlights: [number, number, string][] = [];

    // Can only highlight when syntax tree has been parsed
    if (!tree) {
      return source;
    }

    // Get all symbol types used in mapping
    const symbols = tree.rootNode.descendantsOfType(Object.keys(highlightMappings));
    for (const { startIndex, endIndex, type } of symbols) {
      highlights.push([
        startIndex,
        endIndex,
        highlightMappings[type as keyof typeof highlightMappings],
      ]);
    }

    // Additional string based matches
    const punctuation = source.matchAll(/([(),])/g);
    for (const match of punctuation) {
      highlights.push([match.index, match.index + 1, "punctuation"]);
    }
    const operators = source.matchAll(/([=#])/g);
    for (const match of operators) {
      highlights.push([match.index, match.index + 1, "operator"]);
    }

    // Splice in token wrappers in reverse order
    highlights
      .sort((a, b) => b[0] - a[0])
      .forEach(([startIndex, endIndex, type]) => {
        const keyword = source.substring(startIndex, endIndex);
        if (type === "keyword") {
          let regName = keyword.toLowerCase();
          if (regName === "sp") {
            regName = "a7";
          }
          type = "reg reg-" + regName;
          if (regName === hoverReg) {
            type += " reg-hover";
          }
        }
        source =
          source.substring(0, startIndex) +
          `<span class="token ${type}">${keyword}</span>` +
          source.substring(endIndex);
      });

    return source;
  };

  return <SimpleEditor
    onValueChange={onChange}
    highlight={highlight}
    tabSize={4}
    padding={'1rem'}
    style={{
      backgroundColor: "#011627",
      color: "#fff",
      fontFamily: "monospace",
      width: "50%",
    }}
    value={source}
  />
}

export default Editor
