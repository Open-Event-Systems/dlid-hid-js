export type Header = {
  dataElementSeparator: string
  recordSeparator: string
  segmentTerminator: string
  iin: string
  aamvaVersion: string
  jurisdictionVersion: string
  numEntries: number
}

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
  header: Readonly<Header>
  subfileDesignators: readonly Readonly<SubfileDesignator>[]
  subfiles: Subfiles
  done: boolean
  append(data: string): boolean
}>

const SUBFILE_DESIGNATOR_SIZE = 10

class ParseError extends Error { }

class EOF extends ParseError { }

class StringReader {
  constructor(
    public data: string,
    public pos = 0,
  ) { }

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

const invalidSeparatorPattern = /[a-zA-Z0-9 ]/


const makeHeaderParsers = (reader: StringReader, header: Header): (() => void)[] => {
  const readSeparator = (): string => {
    const s = reader.read(1)
    if (invalidSeparatorPattern.test(s)) {
      throw new ParseError()
    }
    return s
  }

  return [
    () => {
      if (reader.read(1) != "@") {
        throw new ParseError()
      }
    },
    () => header.dataElementSeparator = readSeparator(),
    () => header.recordSeparator = readSeparator(),
    () => header.segmentTerminator = readSeparator(),
    () => {
      if (reader.read(5) != "ANSI ") {
        throw new ParseError()
      }
    },
    () => header.iin = reader.read(6),
    () => header.aamvaVersion = reader.read(2),
    () => header.jurisdictionVersion = reader.read(2),
    () => {
      const num = parseInt(reader.read(2))
      if (isNaN(num)) {
        throw new ParseError()
      }
      header.numEntries = num
    },
  ]
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

  public header: Header = {
    iin: "",
    dataElementSeparator: "",
    recordSeparator: "",
    segmentTerminator: "",
    aamvaVersion: "",
    jurisdictionVersion: "",
    numEntries: 0,
  }

  public subfileDesignators: SubfileDesignator[] = []
  public subfiles: Record<string, SubfileData> = {}
  public done = false

  private steps: (() => void)[]

  constructor(initialData: string) {
    this.reader = new StringReader(initialData)
    this.steps = [
      ...makeHeaderParsers(this.reader, this.header),
      () => {
        for (let i = 0; i < this.header.numEntries; i++) {
          this.steps.push(() => {
            const sd = parseSubfileDesignator(this.reader)
            this.subfileDesignators.push(sd)

            this.steps.push(() => {
              if (sd.type == "DL" || sd.type == "ID") {
                const parsed = parseSubfile(this.header, sd, this.reader)
                this.subfiles[sd.type] = parsed
              } else {
                const sdReader = new StringReader(this.reader.data, sd.offset)
                sdReader.peek(sd.length)
                this.subfiles[sd.type] = {}
              }
            })
          })
        }
      },
    ]
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

  private updateParseOnce() {
    const step = this.steps[0]
    if (step) {
      step()
      this.steps.splice(0, 1)
    } else {
      this.done = true
    }
  }

  private updateParse(): boolean {
    if (this.error) {
      return false
    }

    try {
      while (!this.done && !this.error) {
        this.updateParseOnce()
      }
      return false
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

/**
 * Return a {@link Parser}.
 */
export const makeDLIDParser = (initialData?: string): Parser => {
  return new _Parser(initialData ?? "")
}
