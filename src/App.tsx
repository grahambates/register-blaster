import { useEffect, useState } from "react";
import "./App.css";
import Parser from "web-tree-sitter";
import Editor from './Editor'
import getRegInfo, { RegInfo } from './regInfo'
import { getParser } from "./parser";
import { getSizeLabel } from "./syntax";

// TODO:
// need to handle ranges - affect registers not explicitly referenced
// List inputs - read before write (or bigger read size than write)
// order of use vs reg order

// Copy code button
// Tab size config

// How to deal with macros?
// no way to tell read/write or size

function App() {
  const [source, setSource] = useState(`
    lea Foo(pc),a0
    move.w d0,d1
    movem.w d0-a7,(a0)
  `);

  const [tree, setTree] = useState<Parser.Tree>();
  const [regInfos, setRegInfos] = useState<RegInfo[]>();
  const [hoverReg, setHoverReg] = useState<string>();

  // Parse source on change, updating tree
  useEffect(() => {
    getParser().then((parser) => {
      setTree(parser.parse(source));
    });
  }, [source]);

  // Update register info on tree change
  useEffect(() => {
    if (tree) setRegInfos(getRegInfo(tree));
  }, [tree]);

  return (
    <>
      <Editor
        onChange={setSource}
        source={source}
        tree={tree}
        hoverReg={hoverReg}
      />
      <div className="Info">
        {regInfos && (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Read</th>
                <th>Write</th>
                <th>First use</th>
                <th>Input?</th>
              </tr>
            </thead>
            <tbody>
              {regInfos.map((reg) => (
                <tr
                  key={reg.name}
                  className={`${reg.refs.length ? "used reg-" + reg.name : "unused"}`}
                  onMouseOver={() => setHoverReg(reg.name)}
                  onMouseOut={() => setHoverReg(undefined)}
                >
                  <th scope="row">{reg.name}</th>
                  <td>
                    {reg.maxReadSize &&
                      getSizeLabel(reg.maxReadSize)?.toUpperCase()}
                  </td>
                  <td>
                    {reg.maxWriteSize &&
                      getSizeLabel(reg.maxWriteSize)?.toUpperCase()}
                  </td>
                  <td>{reg.refs.length ? reg.firstUse : ''}</td>
                  <td>{reg.isInput ? 'yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default App;
