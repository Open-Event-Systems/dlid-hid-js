export type Header = Readonly<{
  dataElementSeparator: string
  recordSeparator: string
  segmentTerminator: string
  iin: string
  aamvaVersion: string
  jurisdictionVersion: string
  numEntries: number
}>

export type SubfileDesignator = Readonly<{
  type: string
  offset: number
  length: number
}>

export type SubfileData = Readonly<Record<string, string | undefined>>

export type Subfiles = Readonly<Record<string, SubfileData | undefined>>

export type Parser = Readonly<{
  data: string
  error: Error | undefined
  header: Readonly<Header> | undefined
  subfileDesignators: readonly Readonly<SubfileDesignator>[]
  subfiles: Subfiles
  done: boolean
  append(data: string): boolean
}>

const HEADER_SIZE = 21
const SUBFILE_DESIGNATOR_SIZE = 10

class ParseError extends Error {}

class EOF extends ParseError {}

class StringReader {
  constructor(
    public data: string,
    public pos = 0,
  ) {}

  get avail(): number {
    return this.data.length - this.pos
  }

  peek(n: number): string {
    if (n > this.avail) {
      throw new EOF()
    }
    return this.data.substring(this.pos, this.pos + n)
  }

  read(n: number): string {
    const res = this.peek(n)
    this.pos += n
    return res
  }

  append(data: string) {
    this.data += data
  }
}

const badHeaderPattern = /[a-zA-Z0-9]/

const parseHeader = (reader: StringReader): Header => {
  // quickly check the first two chars to fail immediately
  const check = reader.peek(2)
  if (check.charAt(0) != "@" || badHeaderPattern.test(check.charAt(1))) {
    throw new ParseError()
  }

  const copied = new StringReader(reader.peek(HEADER_SIZE))
  copied.read(1)

  const dataElementSeparator = copied.read(1)
  const recordSeparator = copied.read(1)
  const segmentTerminator = copied.read(1)

  const ansi = copied.read(5)
  if (ansi != "ANSI ") {
    throw new ParseError()
  }

  const iin = copied.read(6)
  const aamvaVersion = copied.read(2)
  const jurisdictionVersion = copied.read(2)
  const numEntries = parseInt(copied.read(2))
  if (isNaN(numEntries)) {
    throw new ParseError()
  }

  reader.read(HEADER_SIZE)

  return {
    dataElementSeparator,
    recordSeparator,
    segmentTerminator,
    iin,
    aamvaVersion,
    jurisdictionVersion,
    numEntries,
  }
}

const parseSubfileDesignator = (reader: StringReader): SubfileDesignator => {
  const copied = new StringReader(reader.peek(SUBFILE_DESIGNATOR_SIZE))

  const type = copied.read(2)
  const offset = parseInt(copied.read(4))
  const length = parseInt(copied.read(4))
  if (isNaN(offset) || isNaN(length)) {
    throw new ParseError()
  }

  reader.read(SUBFILE_DESIGNATOR_SIZE)

  return {
    type,
    offset,
    length,
  }
}

const recordKeyPattern = /[A-Z]{3}/

const parseRecord = (
  header: Header,
  reader: StringReader,
): [string, string] => {
  const copied = new StringReader(reader.data, reader.pos)
  const key = copied.read(3)
  if (!recordKeyPattern.test(key)) {
    throw new ParseError()
  }

  let val = ""
  while (true) {
    const next = copied.peek(1)
    if (
      next == header.dataElementSeparator ||
      next == header.segmentTerminator
    ) {
      break
    }

    val += copied.read(1)
  }

  reader.pos = copied.pos
  return [key, val]
}

const parseSubfile = (
  header: Header,
  subfileDesignator: SubfileDesignator,
  reader: StringReader,
): SubfileData => {
  const copied = new StringReader(reader.data, subfileDesignator.offset)
  const sfReader = new StringReader(copied.peek(subfileDesignator.length))
  sfReader.read(2)

  const records: Record<string, string> = {}

  while (true) {
    const next = sfReader.peek(1)
    if (next == header.segmentTerminator) {
      sfReader.read(1)
      break
    } else if (next == header.dataElementSeparator) {
      sfReader.read(1)
      continue
    } else {
      const [k, v] = parseRecord(header, sfReader)
      records[k] = v
    }
  }

  return records
}

class _Parser {
  private reader: StringReader
  public error: Error | undefined = undefined

  public header: Header | undefined = undefined
  public subfileDesignators: SubfileDesignator[] = []
  public subfiles: Record<string, SubfileData> = {}
  private nSubfiles = 0
  public done = false

  constructor(initialData: string) {
    this.reader = new StringReader(initialData)
  }

  get data(): string {
    return this.reader.data
  }

  append(data: string): boolean {
    if (this.error || this.done) {
      return false
    }

    this.reader.append(data)
    return this.updateParse()
  }

  private updateParseOnce(): boolean {
    if (!this.header) {
      this.header = parseHeader(this.reader)
      return true
    } else if (this.subfileDesignators.length < this.header.numEntries) {
      const sd = parseSubfileDesignator(this.reader)
      this.subfileDesignators.push(sd)
      return true
    } else if (this.nSubfiles < this.subfileDesignators.length) {
      for (const sd of this.subfileDesignators) {
        if (!(sd.type in this.subfiles)) {
          if (sd.type == "DL" || sd.type == "ID") {
            this.subfiles[sd.type] = parseSubfile(this.header, sd, this.reader)
          } else {
            // skip
            const sdReader = new StringReader(this.reader.data, sd.offset)
            sdReader.peek(sd.length)
            this.subfiles[sd.type] = {}
          }

          this.nSubfiles++
        }
      }
      return true
    } else {
      this.done = true
      return false
    }
  }

  private updateParse(): boolean {
    if (this.error) {
      return false
    }

    try {
      let cont = true
      while (cont) {
        cont = this.updateParseOnce()
      }
      return cont
    } catch (e) {
      if (e instanceof EOF) {
        return true
      } else {
        this.error = e as Error
        return false
      }
    }
  }
}

export const makeDLIDParser = (initialData?: string): Parser => {
  return new _Parser(initialData ?? "")
}
