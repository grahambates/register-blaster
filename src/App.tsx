import { useEffect, useState } from 'react'
import './App.css'
import Parser from 'web-tree-sitter'

// TODO:
// need to handle ranges - affect registers not explicitly referenced
// what about size of index etc - not size as instruction size
// List inputs - read before write (or bigger read size than write)
// order of use vs reg order

// How to deal with macros?
// no way to tell read/write or size

interface RegReference {
  startIndex: number,
  endIndex: number,
  line: number,
  isRead: boolean,
  isWrite: boolean,
  size: number
}

type Reg = 'd0' |
  'd1' |
  'd2' |
  'd3' |
  'd4' |
  'd5' |
  'd6' |
  'd7' |
  'a0' |
  'a1' |
  'a2' |
  'a3' |
  'a4' |
  'a5' |
  'a6' |
  'a7'

interface RegInfo {
  name: string
  isRead: boolean
  isWrite: boolean
  maxReadSize?: number
  maxWriteSize?: number
  firstUse: number
  refs: RegReference[]
}

// Op size is word, with these exceptions:
const longDefault = [
  'moveq',
  'exg',
  'lea',
  'pea',
];
const byteDefault = [
  'nbcd',
  'abcd',
  'sbcd',
  'scc',
  'tas',
  'scc',
  'scs',
  'seq',
  'sge',
  'sgt',
  'shi',
  'sle',
  'slt',
  'smi',
  'sne',
  'spl',
  'svc',
  'svs',
  'st',
  'sf',
  'sls',
];
const bitOps = [
  'bchg',
  'bset',
  'bclr',
  'btst',
];

// Dest register is read/write, with these exceptions:
const readOnlyDest = ['tst', 'cmp', 'btst']
const writeOnlyDest = ['lea', 'move', 'moveq', 'movem', 'movea']

// Lazy load wasm parser
let parser: Parser
async function getParser() {
  if (!parser) {
    await Parser.init()
    parser = new Parser()
    const m68k = await Parser.Language.load('/tree-sitter-m68k.wasm');
    parser.setLanguage(m68k);
  }
  return parser
}

function getSizeBytes(size: string): number | null {
  const labelSizeMap = {
    s: 1,
    b: 1,
    w: 2,
    l: 4
  }
  return labelSizeMap[size as keyof typeof labelSizeMap] ?? null

}

function getSizeLabel(size: number): string | null {
  const sizeLabelMap = {
    1: 'b',
    2: 'w',
    4: 'l'
  }
  return sizeLabelMap[size as keyof typeof sizeLabelMap] ?? null
}

async function getRegUsage(source: string): Promise<RegInfo[]> {
  const regUsage: Record<Reg, RegReference[]> = {
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
  }

  const parser = await getParser()
  const tree = parser.parse(source)
  const regs = tree.rootNode.descendantsOfType([
    'address_register',
    'data_register',
    'named_register',
  ])

  for (const { startIndex, endIndex, parent, text, type, startPosition } of regs) {
    let regName = text.toLowerCase()

    // Not interested in named regs other than SP
    if (type === 'named_register' && regName !== 'sp') {
      continue
    }
    // Normalise reg name
    if (regName === 'sp') {
      regName = 'a7'
    }

    // TODO: handle ranges with movem
    // Need to process these separately

    let isDest = false
    let op: string | undefined
    let opSize: string | undefined
    const parents: string[] = []

    for (let p = parent; p; p = p?.parent ?? null) {
      parents.push(p.type)
      if (p.type === 'operand_list') {
        isDest = p.lastChild?.startIndex === startIndex
      }
      if (p.type === 'instruction') {
        op = p.childForFieldName('mnemonic')?.text.toLowerCase()
        opSize = p.childForFieldName('size')?.text.toLowerCase()

        // Default op sizes
        if (op && !opSize) {
          if (longDefault.includes(op)) {
            opSize = 'l'
          } else if (byteDefault.includes(op)) {
            opSize = 'b'
          } else if (bitOps.includes(op)) {
            // longword if dest is register, else byte
            opSize = isDest && p.childForFieldName('operands')?.lastChild?.type === 'data_register'
              ? 'l'
              : 'b'
          } else {
            opSize = 'w'
          }
        }
        // Special case for div dest
        if ((op === 'divs' || op === 'divu') && isDest) {
          opSize = 'l'
        }
      }
    }

    // Ignore movem for now
    if (parents.includes('register_list')) {
      continue
    }

    const isDirect = parents[0] === 'operand_list' || parents.includes('register_list')
    const isWrite = isDirect && isDest && !!op && !readOnlyDest.includes(op)
    const isRead = !(isDirect && isDest && !!op && !writeOnlyDest.includes(op))

    // Indirect will be longword unless offset idx
    let size = isDirect ? opSize : 'l'
    if (parent?.type === 'idx') {
      size = parent.childForFieldName('size')?.text.toLowerCase() ?? 'w'
    }
    if (!size) {
      size = 'w'
    }

    regUsage[regName as Reg].push({
      startIndex,
      endIndex,
      line: startPosition.row,
      isRead,
      isWrite,
      size: getSizeBytes(size) ?? 2
    })
  }

  const regInfo: RegInfo[] = []
  for (const reg in regUsage) {
    const refs = regUsage[reg as Reg]
    const reads = refs.filter(r => r.isRead)
    const writes = refs.filter(r => r.isWrite)
    const maxReadSize = Math.max(...reads.map(r => r.size))
    const maxWriteSize = Math.max(...writes.map(r => r.size))
    const firstUse = Math.min(...refs.map(r => r.line))
    regInfo.push({
      name: reg,
      isRead: reads.length > 0,
      isWrite: writes.length > 0,
      maxReadSize,
      maxWriteSize,
      firstUse,
      refs,
    })
  }

  return regInfo
}

function App() {
  const [source, setSource] = useState(`
    lea Foo(pc),a0
    move.w d0,d1
    movem.w d0-a7,(a0)
  `)

  const [regInfo, setRegInfo] = useState<RegInfo[]>()

  useEffect(() => {
    getRegUsage(source).then(setRegInfo)
  }, [source])

  return (
    <>
      <textarea
        onChange={e => setSource(e.currentTarget.value)}
        value={source}
      />
      <div className='Info'>
        {regInfo && (
          <table>
            <thead>
              <th></th>
              <th>Read</th>
              <th>Write</th>
              <th>Lines</th>
            </thead>
            {regInfo.map(reg => (
              <tr className={reg.refs.length ? 'used' : 'unused'}>
                <th scope='row'>{reg.name}</th>
                <td>{reg.maxReadSize && getSizeLabel(reg.maxReadSize)?.toUpperCase()}</td>
                <td>{reg.maxWriteSize && getSizeLabel(reg.maxWriteSize)?.toUpperCase()}</td>
                <td>{reg.refs.map(r => r.line).join(', ')}</td>
              </tr>
            ))}
          </table>
        )}
      </div >
    </>
  )
}

export default App
