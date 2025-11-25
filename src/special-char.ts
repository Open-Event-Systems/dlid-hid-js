import { useCallback, useState, type KeyboardEvent } from "react"

const NUMS = "0123456789"

/**
 * Special character input state.
 *
 * Handles alt codes, enter, and Ctrl+J.
 */
export class SpecialCharInput {
  private altBuffer = ""
  constructor() {}

  /**
   * Append an alt code number.
   */
  appendAltCode(char: string) {
    this.altBuffer += char
  }

  /**
   * Reset the alt code input.
   */
  reset() {
    this.altBuffer = ""
  }

  /**
   * Finish the alt code input.
   *
   * @returns A special character or undefined if invalid
   */
  finish(): string | undefined {
    const num = parseInt(this.altBuffer, 10)
    this.reset()

    if (isNaN(num)) {
      return undefined
    } else {
      return String.fromCharCode(num)
    }
  }

  /**
   * Handle a keydown event.
   *
   * @returns A special character to input, or undefined
   */
  onKeyDown = (e: KeyboardEvent): string | undefined => {
    if (e.key == "Alt") {
      e.preventDefault()
      return
    }

    const isAlt = e.getModifierState("Alt")
    if (isAlt && NUMS.includes(e.key)) {
      this.altBuffer += e.key
      e.preventDefault()
      return
    }

    const specialChar = getSpecialChar(e)
    if (specialChar != null) {
      e.preventDefault()
      return specialChar
    }
  }

  /**
   * Handle a keyup event.
   *
   * @returns A special character to input, or undefined
   */
  onKeyUp = (e: KeyboardEvent): string | undefined => {
    if (e.key == "Alt") {
      if (this.altBuffer.length > 0) {
        return this.finish()
      } else {
        this.reset()
      }
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

/**
 * Use special character input handling.
 *
 * @param callback - A callback called when a special character is input.
 * @returns An object with onKeyUp and onKeyDown handlers
 */
export const useSpecialCharInput = (
  callback: (value: string) => void,
): {
  onKeyDown: (e: KeyboardEvent) => void
  onKeyUp: (e: KeyboardEvent) => void
} => {
  const [state] = useState(() => new SpecialCharInput())

  const keyDownWithCallback = useCallback(
    (e: KeyboardEvent) => {
      const res = state.onKeyDown(e)
      if (res) {
        callback(res)
      }
    },
    [state.onKeyDown, callback],
  )

  const keyUpWithCallback = useCallback(
    (e: KeyboardEvent) => {
      const res = state.onKeyUp(e)
      if (res) {
        callback(res)
      }
    },
    [state.onKeyUp, callback],
  )

  return {
    onKeyDown: keyDownWithCallback,
    onKeyUp: keyUpWithCallback,
  }
}
