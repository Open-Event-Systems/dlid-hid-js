import {
  useMemo,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type Key,
  type KeyboardEvent,
} from "react"
import {
  makeDLIDParser,
  type Header,
  type Parser,
  type SubfileDesignator,
  type Subfiles,
} from "./parse.js"

export type DLIDInputStateValue = Readonly<{
  value: string
  isCapturingInput: boolean
  isInputtingDLID: boolean
  result?: Readonly<{
    header: Header
    subfileDesignators: readonly SubfileDesignator[]
    subfiles: Readonly<Subfiles>
  }>
}>

export type DLIDInputCallbacks = Readonly<{
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onKeyDown: (e: KeyboardEvent) => void
  onKeyUp: (e: KeyboardEvent) => void
}>

const NUMS = "0123456789"
const inputPattern = /^@[^a-zA-Z0-9. -]{3}ANSI /

class InputState {
  private state: DLIDInputStateValue
  private parser: Parser | undefined = undefined
  private altBuffer = ""

  private observers: (() => void)[] = []

  private timeout: number | undefined = undefined

  constructor(
    value?: string,
    private setValue?: (value: string) => void,
  ) {
    this.state = {
      value: value ?? "",
      isCapturingInput: false,
      isInputtingDLID: false,
    }
  }

  onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value
    if (this.state.isCapturingInput && this.parser) {
      if (value.startsWith(this.state.value)) {
        const appended = value.substring(this.state.value.length)
        this.append(appended)
      }
      this.resetTimeout()
    } else {
      let isCapturingInput = this.state.isCapturingInput
      const value = e.target.value

      if (value.length > 0 && value.charAt(value.length - 1) == "@") {
        this.parser = makeDLIDParser("@")
        isCapturingInput = true
      }

      this.state = {
        ...this.state,
        isCapturingInput,
        value,
      }

      this.setValue && this.setValue(value)
      this.resetTimeout()
      this.notify()
    }
  }

  onKeyDown = (e: KeyboardEvent) => {
    if (this.state.isCapturingInput) {
      this.resetTimeout()

      if (e.key == "Alt") {
        e.preventDefault()
        return
      }

      const alt = e.getModifierState("Alt")
      if (alt && NUMS.includes(e.key)) {
        this.altBuffer += e.key
        e.preventDefault()
        return
      } else if (!alt && this.altBuffer.length > 0) {
        this.finishAlt()
      }

      const specialChar = getSpecialChar(e)
      if (specialChar != null) {
        e.preventDefault()
        this.append(specialChar)
      }
    }
  }

  onKeyUp = (e: KeyboardEvent) => {
    if (
      this.state.isCapturingInput &&
      e.key == "Alt" &&
      this.altBuffer.length > 0
    ) {
      e.preventDefault()
      this.finishAlt()
    }
  }

  getSnapshot = (): DLIDInputStateValue => {
    return this.state
  }

  subscribe = (callback: () => void): (() => void) => {
    this.observers.push(callback)
    const unsubscribe = () => {
      const idx = this.observers.indexOf(callback)
      if (idx != -1) {
        this.observers.splice(idx, 1)
      }
    }

    return unsubscribe
  }

  private append(data: string) {
    if (this.parser) {
      this.parser.append(data)
      if (this.parser.done && this.parser.header) {
        // update state/result when done
        this.state = {
          ...this.state,
          value: "",
          isCapturingInput: false,
          isInputtingDLID: false,
          result: {
            header: this.parser.header,
            subfileDesignators: this.parser.subfileDesignators,
            subfiles: this.parser.subfiles,
          },
        }
        this.parser = undefined
        this.setValue && this.setValue("")
        this.notify()
      } else if (!this.state.isInputtingDLID && this.parser.error != null) {
        // update state/result immediately if we bail out early
        const value = this.parser.data
        this.state = {
          ...this.state,
          value: value,
          isInputtingDLID: false,
          isCapturingInput: false,
        }
        this.parser = undefined
        this.setValue && this.setValue(value)
        this.notify()
        this.resetTimeout()
      } else if (
        !this.state.isInputtingDLID &&
        this.parser.data &&
        inputPattern.test(this.parser.data)
      ) {
        // set dlid input state if it looks like a valid dlid string
        this.state = {
          ...this.state,
          isInputtingDLID: true,
        }
        this.notify()
      }
    }
  }

  private finishAlt() {
    const num = parseInt(this.altBuffer, 10)
    this.altBuffer = ""

    if (!isNaN(num)) {
      this.append(String.fromCharCode(num))
    }
  }

  private notify() {
    this.observers.forEach((cb) => cb())
  }

  private resetTimeout() {
    if (this.timeout != null) {
      window.clearTimeout(this.timeout)
    }
    if (this.state.isCapturingInput) {
      this.timeout = window.setTimeout(this.onTimeout, 150)
    }
  }

  private onTimeout = () => {
    if (this.state.isCapturingInput) {
      let value = this.state.value
      let result: DLIDInputStateValue["result"]

      if (this.parser) {
        if (this.parser.done && this.parser.header) {
          value = ""
          result = {
            header: this.parser.header,
            subfileDesignators: this.parser.subfileDesignators,
            subfiles: this.parser.subfiles,
          }
        } else {
          value = value + this.parser.data.substring(1)
        }
      }

      this.parser = undefined

      this.state = {
        ...this.state,
        value,
        isCapturingInput: false,
        isInputtingDLID: false,
        ...(result ? { result: result } : undefined),
      }

      this.setValue && this.setValue(value)
      this.notify()
    }
  }
}

const getSpecialChar = (e: KeyboardEvent): string | undefined => {
  const ctrl = e.getModifierState("Control")

  if (e.key == "j" && ctrl) {
    return "\n"
  } else if ((e.key == "6" || e.key == "^") && ctrl) {
    return "\x1e"
  } else if (e.key == "Enter") {
    return "\r"
  }
}

export const useDLIDInput = (
  initialValue?: string,
  setValue?: (value: string) => void,
): [DLIDInputStateValue, DLIDInputCallbacks] => {
  const [state] = useState(() => new InputState(initialValue, setValue))
  const stateVal = useSyncExternalStore(state.subscribe, state.getSnapshot)

  const callbacks = useMemo<DLIDInputCallbacks>(() => {
    return {
      onChange: state.onChange,
      onKeyDown: state.onKeyDown,
      onKeyUp: state.onKeyUp,
    }
  }, [state])

  return [stateVal, callbacks]
}
