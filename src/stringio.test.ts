import { describe, expect, test } from "vitest"
import { EOF, StringIO } from "./stringio.js"

describe("string reader", () => {
  test("avail", () => {
    const reader = new StringIO("initial")
    expect(reader.avail).toBe(7)
  })

  test("append", () => {
    const reader = new StringIO("")
    reader.append("test")
    expect(reader.data).toBe("test")
    expect(reader.avail).toBe(4)
  })

  test("peek", () => {
    const reader = new StringIO("test")
    expect(reader.peek(2)).toBe("te")
    expect(reader.pos).toBe(0)
    expect(reader.avail).toBe(4)
  })

  test("read", () => {
    const reader = new StringIO("test")
    expect(reader.read(2)).toBe("te")
    expect(reader.pos).toBe(2)
    expect(reader.avail).toBe(2)
  })

  test("readEOF", () => {
    const reader = new StringIO("test")
    expect(() => reader.read(5)).toThrowError(EOF)
  })
})
