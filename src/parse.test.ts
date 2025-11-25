import { describe, expect, test } from "vitest"
import {
  HeaderParseError,
  makeDLIDParser,
  ParseError,
  type Header,
} from "./parse.js"
import { EOF, StringIO } from "./stringio.js"

// from https://www.aamva.org/assets/best-practices,-guides,-standards,-manuals,-whitepapers/aamva-dl-id-card-design-standard-(2020)
// but also the DL data offset is off by 1?
const exampleData = [
  "@\n\x1e\rANSI 636000110002DL00410277ZV03180008",
  "DL",
  "DAQT64235789\n",
  "DCSSAMPLE\n",
  "DDEN\n",
  "DACMICHAEL\n",
  "DDFN\n",
  "DADJOHN\n",
  "DDGN\n",
  "DCUJR\n",
  "DCAD\n",
  "DCBK\n",
  "DCDPH\n",
  "DBD06062022\n",
  "DBB06062006\n",
  "DBA06062027\n",
  "DBC1\n",
  "DAU068 in\n",
  "DAYBRO\n",
  "DAG2300 WEST BROAD STREET\n",
  "DAIRICHMOND\n",
  "DAJVA\n",
  "DAK232690000 \n",
  "DCF2424244747474786102204\n",
  "DCGUSA\n",
  "DCK123456789\n",
  "DDAF\n",
  "DDB06062018\n",
  "DDJ06062027\n",
  "DDD1\r",
  "ZV",
  "ZVA01\r",
].join("")

// some IDs have \n\r instead of just \r
const exampleDataExtraSeparator = [
  "@\n\x1e\rANSI 636000110002DL00410278ZV03190009",
  "DL",
  "DAQT64235789\n",
  "DCSSAMPLE\n",
  "DDEN\n",
  "DACMICHAEL\n",
  "DDFN\n",
  "DADJOHN\n",
  "DDGN\n",
  "DCUJR\n",
  "DCAD\n",
  "DCBK\n",
  "DCDPH\n",
  "DBD06062022\n",
  "DBB06062006\n",
  "DBA06062027\n",
  "DBC1\n",
  "DAU068 in\n",
  "DAYBRO\n",
  "DAG2300 WEST BROAD STREET\n",
  "DAIRICHMOND\n",
  "DAJVA\n",
  "DAK232690000 \n",
  "DCF2424244747474786102204\n",
  "DCGUSA\n",
  "DCK123456789\n",
  "DDAF\n",
  "DDB06062018\n",
  "DDJ06062027\n",
  "DDD1\n\r",
  "ZV",
  "ZVA01\n\r",
].join("")

const exampleDataHeader = {
  dataElementSeparator: "\n",
  recordSeparator: "\x1e",
  segmentTerminator: "\r",
  numEntries: 2,
  iin: "636000",
  aamvaVersion: "11",
  jurisdictionVersion: "00",
} as const satisfies Header

const exampleDataSubfiles = new Map(
  Object.entries({
    DL: new Map(
      Object.entries({
        DAQ: "T64235789",
        DCS: "SAMPLE",
        DDE: "N",
        DAC: "MICHAEL",
        DDF: "N",
        DAD: "JOHN",
        DDG: "N",
        DCU: "JR",
        DCA: "D",
        DCB: "K",
        DCD: "PH",
        DBD: "06062022",
        DBB: "06062006",
        DBA: "06062027",
        DBC: "1",
        DAU: "068 in",
        DAY: "BRO",
        DAG: "2300 WEST BROAD STREET",
        DAI: "RICHMOND",
        DAJ: "VA",
        DAK: "232690000 ",
        DCF: "2424244747474786102204",
        DCG: "USA",
        DCK: "123456789",
        DDA: "F",
        DDB: "06062018",
        DDJ: "06062027",
        DDD: "1",
      }),
    ),
  }),
)

describe("parser", () => {
  test("parses test data", () => {
    const parser = makeDLIDParser(new StringIO(exampleData))
    const res = parser.parse()

    expect(res.header).toStrictEqual(exampleDataHeader)
    expect(res.subfiles).toStrictEqual(exampleDataSubfiles)
  })

  test("parses test data (extra data separator)", () => {
    const parser = makeDLIDParser(new StringIO(exampleDataExtraSeparator))
    const res = parser.parse()

    expect(res.header).toStrictEqual(exampleDataHeader)
    expect(res.subfiles).toStrictEqual(exampleDataSubfiles)
  })

  test("parses with multiple appends", () => {
    const reader = new StringIO("")
    const parser = makeDLIDParser(reader)

    reader.append(exampleData.substring(0, 10))
    expect(() => parser.parse()).toThrowError(EOF)

    reader.append(exampleData.substring(10, 100))
    expect(() => parser.parse()).toThrowError(EOF)

    reader.append(exampleData.substring(100, 300))
    expect(() => parser.parse()).toThrowError(EOF)

    reader.append(exampleData.substring(300))
    const res = parser.parse()

    expect(res.header).toStrictEqual(exampleDataHeader)
    expect(res.subfiles).toStrictEqual(exampleDataSubfiles)
  })

  test("throws header parse error", () => {
    const reader = new StringIO("")
    const parser = makeDLIDParser(reader)

    reader.append("@  ANSI 000000000000XXXXXX")
    expect(() => parser.parse()).toThrowError(HeaderParseError)
  })

  test("throws parse error", () => {
    const reader = new StringIO("")
    const parser = makeDLIDParser(reader)

    reader.append("@...ANSI 0000000000ZZXXXXXX")
    expect(() => parser.parse()).toThrowError(ParseError)
  })
})
