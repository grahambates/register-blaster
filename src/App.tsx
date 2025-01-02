import { useEffect, useState } from "react";
import "./App.css";
import Parser from "web-tree-sitter";
import Editor from './Editor'
import getRegInfo, { RegInfo } from './regInfo'
import { useParser } from "./parser";
import { getSizeLabel } from "./syntax";

// TODO:
// need to handle ranges - affect registers not explicitly referenced
// List inputs - read before write (or bigger read size than write)
// order of use vs reg order

// Copy code button
// Tab size config

// How to deal with macros?
// no way to tell read/write or size
//
// Warning for mapping to in use
//
// Should know when it's safe to remap address vs data
//

const defaultSrc = `;-------------------------------------------------------------------------------
; Example - paste your code here
;-------------------------------------------------------------------------------
InitSin:
        moveq   #0,d0       ; amp=16384, len=1024
        move.w  #511+2,a3
.l
        subq.l  #2,a3
        move.l  d0,d3

        ifne    EXTRA_ACC
        move.w  d3,d5
        neg.w   d5
        mulu.w  d3,d5
        divu.w  #74504/2,d5 ; 74504=amp/scale
        lsr.w   #2+1,d5
        sub.w   d5,d3
        endc

        asr.l   #2,d3
        move.w  d3,(a0)+
        neg.w   d3
        move.w  d3,(1024-2,a0)
        add.l   a3,d0
        bne.b   .l

; Copy extra 90 deg for cosine
        lea     Sin,a0
        lea     Sin+1024*2,a3
        move.w  #256/2,d0
.copy
        move.l  (a0)+,(a3)+
        dbf     d0,.copy

        rts`

const defaultMappings: Record<string, string | null> = {
  d0: null,
  d1: null,
  d2: null,
  d3: null,
  d4: null,
  d5: null,
  d6: null,
  d7: null,
  a0: null,
  a1: null,
  a2: null,
  a3: null,
  a4: null,
  a5: null,
  a6: null,
  a7: null,
}

const registers = Object.keys(defaultMappings)

function App() {
  const [source, setSource] = useState(defaultSrc);
  const [regInfos, setRegInfos] = useState<RegInfo[]>();
  const [hoverReg, setHoverReg] = useState<string>();
  const [mappings, setMappings] = useState(defaultMappings)
  const tree = useParser(source)

  useEffect(() => {
    // Update register info on tree change
    if (tree) setRegInfos(getRegInfo(tree));
    // Reset mappings
    setMappings(defaultMappings)
  }, [tree]);

  // Do string replacements for remapped registers
  function applyMappings() {
    // Build combined list of all string replacements
    const replacements: { startIndex: number, endIndex: number, replacement: string }[] = []
    Object.keys(mappings).forEach(original => {
      const replacement = mappings[original]
      if (!replacement) {
        return
      }
      const info = regInfos?.find(i => i.name === original)
      if (!info) {
        return
      }
      replacements.push(...info.refs.map(({ startIndex, endIndex }) => ({
        startIndex, endIndex, replacement
      })))
    })

    let newSource = source
    replacements
      // apply in reverse order of occurrence
      .sort((a, b) => b.endIndex - a.endIndex)
      .forEach(({ startIndex, endIndex, replacement }) => {
        // Splice in replacement text
        newSource = newSource.substring(0, startIndex) + replacement + newSource.substring(endIndex)
      })

    setSource(newSource)
    setMappings(defaultMappings)
  }

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
          <>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Read</th>
                  <th>Write</th>
                  <th>First use</th>
                  <th>Input?</th>
                  <th></th>
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
                    <td>
                      {reg.refs.length > 0 && (
                        <select value={mappings[reg.name] || ""} onChange={e => setMappings({ ...mappings, [reg.name]: e.currentTarget.value || null })} >
                          <option value="">Remap…</option>
                          {registers.map(r => {
                            const isSelf = r === reg.name
                            const inUse =
                              !isSelf && (
                                // Is something else mapped TO this reg?
                                Object.keys(mappings).some(k => mappings[k] === r && k !== reg.name) ||
                                // Is the original register in use, and not mapped TO anything
                                (mappings[r] === null && regInfos.some(i => i.name === r && i.refs.length))
                              )
                            return <option value={r}>{r + (inUse ? ' (in use)' : (isSelf ? ' (no change)' : ''))}</option>
                          })}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {Object.keys(mappings).some(k => mappings[k]) && (
              <div className="Actions">
                <button onClick={applyMappings}>Apply remappings</button>{' '}
                <button className="secondary" onClick={() => setMappings(defaultMappings)}>Reset</button>
              </div>
            )}
          </>
        )}
      </div >
    </>
  );
}

export default App;
