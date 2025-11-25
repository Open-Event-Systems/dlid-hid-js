import type { Meta, StoryObj } from "@storybook/react-vite"
import { useCallback, useState, type ComponentPropsWithoutRef } from "react"
import { useSpecialCharInput } from "./special-char.js"

const Input = (props: ComponentPropsWithoutRef<"input">) => <input {...props} />

const meta: Meta<typeof Input> = {
  component: Input,
}

export default meta

export const Special_Char_Input: StoryObj<typeof Input> = {
  render(args) {
    const [state, setState] = useState("")

    const appendCharCode = useCallback(
      (value: string) => {
        setState((curState) => curState + value)
      },
      [setState],
    )

    const { onKeyDown, onKeyUp } = useSpecialCharInput(appendCharCode)

    const lastInput =
      state.length > 0 ? state.charCodeAt(state.length - 1) : undefined

    return (
      <>
        <Input
          {...args}
          value={state}
          onChange={(e) => setState(e.target.value)}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        />
        <br />
        Last input: {lastInput != null ? "0x" + lastInput.toString(16) : ""}
      </>
    )
  },
}
