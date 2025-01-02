import { useEffect, useState } from "react";
import Parser from "web-tree-sitter";

// Lazy loaded wasm parser
let parser: Parser;

async function getParser(): Promise<Parser> {
  if (!parser) {
    await Parser.init();
    parser = new Parser();
    const m68k = await Parser.Language.load("/tree-sitter-m68k.wasm");
    parser.setLanguage(m68k);
  }
  return parser;
}

export function useParser(source: string) {
  const [tree, setTree] = useState<Parser.Tree>();
  // Parse source on change, updating tree
  useEffect(() => {
    getParser().then((parser) => {
      setTree(parser.parse(source));
    });
  }, [source]);

  return tree;
}
