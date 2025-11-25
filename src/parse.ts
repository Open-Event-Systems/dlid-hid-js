/**
 * See https://www.aamva.org/assets/best-practices,-guides,-standards,-manuals,-whitepapers/aamva-dl-id-card-design-standard-(2020)
 *
 * @packageDocumentation
 */

import { EOF, StringIO } from "./stringio.js"

/**
 * DL/ID header data.
 */
export type Header = Readonly<{
  dataElementSeparator: string
  recordSeparator: string
  segmentTerminator: string
  iin: string
  aamvaVersion: string
  jurisdictionVersion: string
  numEntries: number
}>

/**
 * DL/ID subfile designator entry.
 */
export type SubfileDesignator = Readonly<{
  type: string
  offset: number
  length: number
}>

/**
 * Subfile records.
 */
export type SubfileData = ReadonlyMap<string, string>

/**
 * Mapping of subfile IDs to data.
 */
export type Subfiles = ReadonlyMap<string, SubfileData>

/**
 * DL/ID parse result type.
 */
export type ParseResult = Readonly<{
  header: Header
  subfileDesignators: readonly SubfileDesignator[]
  subfiles: Subfiles
}>

/**
 * DL/ID parser type.
 */
export type Parser = Readonly<{
  parse(): ParseResult
}>

const SUBFILE_DESIGNATOR_SIZE = 10

export class ParseError extends Error {}

export class HeaderParseError extends ParseError {}

const invalidSeparatorPattern = /[a-zA-Z0-9 ]/
const recordKeyPattern = /[A-Z]{3}/

type ParseFuncResult = Readonly<{
  result: ParseResult
  next?: readonly ParseFunc[]
}>

type ParseFunc = (result: ParseResult) => ParseFuncResult

const readSeparator = (reader: StringIO): string => {
  const sep = reader.read(1)
  if (invalidSeparatorPattern.test(sep)) {
    throw new HeaderParseError(
      `Invalid separator 0x${sep.charCodeAt(0).toString(16)}`,
    )
  }
  return sep
}

const makeParseHeaderFunc = (reader: StringIO): ParseFunc => {
  return (result) => {
    return {
      result,
      next: [
        (result) => {
          const a = reader.read(1)
          if (a != "@") {
            throw new HeaderParseError("Expected '@'")
          }
          return { result }
        },
        (result) => {
          const dataElementSeparator = readSeparator(reader)
          return {
            result: {
              ...result,
              header: {
                ...result.header,
                dataElementSeparator,
              },
            },
          }
        },
        (result) => {
          const recordSeparator = readSeparator(reader)
          return {
            result: {
              ...result,
              header: {
                ...result.header,
                recordSeparator,
              },
            },
          }
        },
        (result) => {
          const segmentTerminator = readSeparator(reader)
          return {
            result: {
              ...result,
              header: {
                ...result.header,
                segmentTerminator,
              },
            },
          }
        },
        (result) => {
          if (reader.read(5) != "ANSI ") {
            throw new ParseError("Invalid header")
          }
          return { result }
        },
        (result) => {
          const iin = reader.read(6)
          return {
            result: {
              ...result,
              header: {
                ...result.header,
                iin,
              },
            },
          }
        },
        (result) => {
          const aamvaVersion = reader.read(2)
          return {
            result: {
              ...result,
              header: {
                ...result.header,
                aamvaVersion,
              },
            },
          }
        },
        (result) => {
          const jurisdictionVersion = reader.read(2)
          return {
            result: {
              ...result,
              header: {
                ...result.header,
                jurisdictionVersion,
              },
            },
          }
        },
        (result) => {
          const numEntries = parseInt(reader.read(2))
          if (isNaN(numEntries)) {
            throw new ParseError(`Invalid number of entries: '${numEntries}'`)
          }
          return {
            result: {
              ...result,
              header: {
                ...result.header,
                numEntries,
              },
            },
          }
        },
      ],
    }
  }
}

const makeParseSubfileDesignatorsFunc = (reader: StringIO): ParseFunc => {
  return (result) => {
    const entries = result.header.numEntries
    const next: ParseFunc[] = []
    for (let i = 0; i < entries; i++) {
      next.push(makeParseSubfileDesignatorFunc(reader))
    }

    return {
      result,
      next,
    }
  }
}

const makeParseSubfileDesignatorFunc = (reader: StringIO): ParseFunc => {
  return (result) => {
    const copied = new StringIO(reader.peek(SUBFILE_DESIGNATOR_SIZE))

    const type = copied.read(2)
    const offset = parseInt(copied.read(4))
    const length = parseInt(copied.read(4))
    if (isNaN(offset)) {
      throw new ParseError(`Invalid offset '${offset}`)
    }
    if (isNaN(length)) {
      throw new ParseError(`Invalid length '${length}`)
    }

    reader.read(SUBFILE_DESIGNATOR_SIZE)

    return {
      result: {
        ...result,
        subfileDesignators: [
          ...result.subfileDesignators,
          {
            type,
            offset,
            length,
          },
        ],
      },
    }
  }
}

const makeParseSubfilesFunc = (reader: StringIO): ParseFunc => {
  return (result) => {
    const next: ParseFunc[] = []
    result.subfileDesignators.forEach((sd) => {
      next.push((result) => parseSubfile(reader, result, sd))
    })

    return {
      result,
      next,
    }
  }
}

const parseSubfile = (
  reader: StringIO,
  result: ParseResult,
  subfileDesignator: SubfileDesignator,
): ParseFuncResult => {
  const copied = new StringIO(reader.data, subfileDesignator.offset)
  const sfReader = new StringIO(copied.peek(subfileDesignator.length))

  if (subfileDesignator.type == "DL" || subfileDesignator.type == "ID") {
    sfReader.read(2)
    const records = new Map()
    return {
      result,
      next: [
        (result) =>
          maybeParseRecord(sfReader, result, subfileDesignator.type, records),
      ],
    }
  } else {
    return {
      result,
    }
  }
}

const maybeParseRecord = (
  reader: StringIO,
  result: ParseResult,
  sfType: string,
  records: Map<string, string>,
): ParseFuncResult => {
  let next
  try {
    next = reader.peek(1)
  } catch (e) {
    if (e instanceof EOF) {
      // eof, treat as no more records
      const newSubfiles = new Map(result.subfiles)
      newSubfiles.set(sfType, records)
      return {
        result: {
          ...result,
          subfiles: newSubfiles,
        },
      }
    } else {
      throw e
    }
  }

  if (next == result.header.segmentTerminator) {
    // no more records
    reader.read(1)
    const newSubfiles = new Map(result.subfiles)
    newSubfiles.set(sfType, records)
    return {
      result: {
        ...result,
        subfiles: newSubfiles,
      },
    }
  } else {
    // read next record
    return {
      result,
      next: [(result) => parseRecord(reader, result, sfType, records)],
    }
  }
}

const parseRecord = (
  reader: StringIO,
  result: ParseResult,
  sfType: string,
  records: Map<string, string>,
): ParseFuncResult => {
  const copied = new StringIO(reader.data, reader.pos)
  const key = copied.read(3)
  if (!recordKeyPattern.test(key)) {
    throw new ParseError(`Invalid record: '${key}'`)
  }

  let val = ""

  while (true) {
    const next = copied.peek(1)
    if (
      next == result.header.segmentTerminator ||
      next == result.header.dataElementSeparator
    ) {
      // end of record
      records.set(key, val)
      reader.read(key.length + val.length)

      if (next == result.header.dataElementSeparator) {
        // read the data element separator
        reader.read(1)
      }

      return {
        result,
        next: [(result) => maybeParseRecord(reader, result, sfType, records)],
      }
    } else {
      val = val + next
      copied.read(1)
    }
  }
}

class _Parser {
  private funcs: ParseFunc[]
  private result: ParseResult = {
    header: {
      aamvaVersion: "",
      dataElementSeparator: "",
      iin: "",
      jurisdictionVersion: "",
      numEntries: 0,
      recordSeparator: "",
      segmentTerminator: "",
    },
    subfileDesignators: [],
    subfiles: new Map(),
  }

  constructor(public reader: StringIO) {
    this.funcs = [
      makeParseHeaderFunc(this.reader),
      makeParseSubfileDesignatorsFunc(this.reader),
      makeParseSubfilesFunc(this.reader),
    ]
  }

  parse(): ParseResult {
    while (this.funcs.length > 0) {
      const cur = this.funcs[0]
      if (!cur) {
        break
      }

      const res = cur(this.result)
      this.result = res.result
      this.funcs.splice(0, 1, ...(res.next ?? []))
    }
    return this.result
  }
}

/**
 * Make a {@link Parser}.
 */
export const makeDLIDParser = (reader: StringIO): Parser => {
  return new _Parser(reader)
}
