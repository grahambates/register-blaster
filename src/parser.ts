import Parser from "web-tree-sitter";

// Lazy loaded wasm parser
let parser: Parser;

export async function getParser(): Promise<Parser> {
  if (!parser) {
    await Parser.init();
    parser = new Parser();
    const m68k = await Parser.Language.load("/tree-sitter-m68k.wasm");
    parser.setLanguage(m68k);
  }
  return parser;
}
