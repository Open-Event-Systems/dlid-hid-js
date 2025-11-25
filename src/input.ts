import { useState, useSyncExternalStore } from "react"
import {
  HeaderParseError,
  makeDLIDParser,
  ParseError,
  type Parser,
  type ParseResult,
} from "./parse.js"
import { EOF, StringIO } from "./stringio.js"

export type InputState = Readonly<{
  value: string
  isCapturing: boolean
  isParsingDLID: boolean
  result?: ParseResult | undefined
}>

const TIMEOUT = 200

class _Input {
  private parser: Parser
  private reader: StringIO
  private state: InputState
  private timeout: number | undefined = undefined

  private observers: (() => void)[] = []

  constructor(initialData?: string) {
    this.reader = new StringIO("")
    this.parser = makeDLIDParser(this.reader)
    this.state = {
      isCapturing: false,
      isParsingDLID: false,
      value: initialData || "",
    }
  }

  private update(action: Partial<InputState>) {
    this.state = { ...this.state, ...action }
    this.observers.forEach((cb) => cb())
  }

  private startCapturing() {
    this.reader.append("@")
    this.resetTimeout()
    this.update({ isCapturing: true })
  }

  private cancelCapturing() {
    if (this.timeout != null) {
      window.clearTimeout(this.timeout)
    }
    this.timeout = undefined

    if (this.state.isCapturing) {
      const newVal = this.state.value + this.reader.data.substring(1)
      this.reader = new StringIO("")
      this.parser = makeDLIDParser(this.reader)
      this.update({
        value: newVal,
        isCapturing: false,
        isParsingDLID: false,
        result: undefined,
      })
    }
  }

  private completeCapturing(result: ParseResult) {
    if (this.timeout != null) {
      window.clearTimeout(this.timeout)
    }
    this.timeout = undefined

    this.reader = new StringIO("")
    this.parser = makeDLIDParser(this.reader)
    this.update({ isCapturing: false, isParsingDLID: false, result })
  }

  private resetTimeout() {
    if (this.timeout != null) {
      window.clearTimeout(this.timeout)
    }
    this.timeout = window.setTimeout(this.handleTimeout, TIMEOUT)
  }

  private handleTimeout = () => {
    this.timeout = undefined
    this.cancelCapturing()
  }

  append = (value: string) => {
    if (this.state.isCapturing) {
      this.reader.append(value)
      try {
        const res = this.parser.parse()
        this.completeCapturing(res)
      } catch (e) {
        if (e instanceof EOF) {
          // continue reading
          this.resetTimeout()

          if (this.reader.data.length >= 4 && !this.state.isParsingDLID) {
            this.update({ isParsingDLID: true })
          }
        } else if (e instanceof HeaderParseError) {
          // failed parsing part of DLID header, bail out
          this.cancelCapturing()
        } else if (e instanceof ParseError) {
          // ignore
          this.resetTimeout()
        } else {
          throw e
        }
      }
    } else {
      const newVal = this.state.value + value
      this.update({ value: newVal })

      if (newVal.length > 0 && newVal.charAt(newVal.length - 1) == "@") {
        // start parsing
        this.startCapturing()
      }
    }
  }

  setValue = (v: string) => {
    if (v.startsWith(this.state.value)) {
      const added = v.substring(this.state.value.length)
      this.append(added)
    } else {
      this.update({ value: "" })
      this.append(v)
    }
  }

  getSnapshot = (): InputState => {
    return this.state
  }

  subscribe = (cb: () => void): (() => void) => {
    const unsub = () => {
      const idx = this.observers.indexOf(cb)
      if (idx != -1) {
        this.observers.splice(idx, 1)
      }
    }

    this.observers.push(cb)

    return unsub
  }
}

export type UseDLIDInputHook = Readonly<{
  state: InputState
  setValue: (v: string) => void
  append: (v: string) => void
}>

export const useDLIDInput = (initialValue?: string): UseDLIDInputHook => {
  const [input] = useState(() => new _Input(initialValue))
  const state = useSyncExternalStore(input.subscribe, input.getSnapshot)

  return {
    state,
    setValue: input.setValue,
    append: input.append,
  }
}
