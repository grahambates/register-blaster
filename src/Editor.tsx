import { FC, useState } from "react";
import SimpleEditor from "react-simple-code-editor";
import "./Editor.css";
import "./theme.css";
import Parser from "web-tree-sitter";

export interface EditorProps {
  source: string
  hoverReg?: string
  tree?: Parser.Tree
  onChange: (s: string) => void
}

const defaultTabSize = 4;

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

function convertTabsToSpaces(input: string, tabWidth: number) {
  return input.split("\n").map(line => {
    let result = "";
    let column = 0;

    for (let char of line) {
      if (char === "\t") {
        // Calculate spaces needed to align to the next tab stop
        let spacesToAdd = tabWidth - (column % tabWidth);
        result += " ".repeat(spacesToAdd);
        column += spacesToAdd;
      } else {
        result += char;
        column++;
      }
    }

    return result;
  }).join("\n");
}

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
    // const punctuation = source.matchAll(/([(),])/g);
    // for (const match of punctuation) {
    //   highlights.push([match.index, match.index + 1, "punctuation"]);
    // }
    // const operators = source.matchAll(/([=#])/g);
    // for (const match of operators) {
    //   highlights.push([match.index, match.index + 1, "operator"]);
    // }

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
          if (rainbow) {
            type = " reg-" + regName;
          }
          type += ' reg'
          if (regName === hoverReg) {
            type += " reg-hover";
          }
        }
        source =
          source.substring(0, startIndex) +
          `<span class="token ${type}">${keyword}</span>` +
          source.substring(endIndex);
      });

    return source
      .split("\n")
      .map((line, i) => `<span class='Editor__ln'>${i + 1}</span>${line}`)
      .join("\n");
  };

  const [tabSize, setTabSize] = useState(defaultTabSize);
  const [rainbow, setRainbow] = useState(true);

  const handleChange = (source: string) => {
    // Can only support soft tabs
    onChange(convertTabsToSpaces(source, tabSize))
  }

  const handleCopy = () => {
    const type = "text/plain";
    const blob = new Blob([source], { type });
    const data = [new ClipboardItem({ [type]: blob })];
    navigator.clipboard.write(data);
  }

  return (
    <div className="Editor">
      <div className="Editor__root">
        <SimpleEditor
          onValueChange={handleChange}
          highlight={highlight}
          tabSize={tabSize}
          padding={'10px'}
          textareaId="codeArea"
          className="editor"
          style={{
            backgroundColor: "#011627",
            color: "#fff",
            fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
            fontSize: '.9rem',
            minHeight: '100%',
          }}
          value={source}
        />
      </div>
      <div className="Editor__options">
        <div>
          <label>
            Tab size{' '}
            <input type="number" min="1" max="16" value={tabSize} onChange={e => setTabSize(parseInt(e.currentTarget.value))} />
          </label>
          <label>
            Rainbow registers <input type="checkbox" checked={rainbow} onChange={e => setRainbow(e.currentTarget.checked)} />
          </label>
        </div>
        <button onClick={handleCopy}>Copy source</button>
      </div>
    </div>
  )
}

export default Editor
