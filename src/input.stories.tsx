import { useEffect, type HTMLAttributes } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useDLIDInput } from "./input.js"
import { useSpecialCharInput } from "./special-char.js"

const Component = (props: HTMLAttributes<HTMLInputElement>) => {
  const { ...other } = props

  const { state, setValue, append } = useDLIDInput()

  const inputProps = useSpecialCharInput(append)

  useEffect(() => {
    if (state.result) {
      const dlidSf =
        state.result.subfiles.get("DL") ?? state.result.subfiles.get("ID")
      if (dlidSf) {
        const firstName = dlidSf.get("DAC")
        const lastName = dlidSf.get("DCS")
        setValue(`${firstName} ${lastName}`)
      }
    }
  }, [state.result, setValue])

  return (
    <>
      <div>
        <input
          autoFocus
          {...other}
          value={state.value}
          onKeyDown={state.isCapturing ? inputProps.onKeyDown : undefined}
          onKeyUp={state.isCapturing ? inputProps.onKeyUp : undefined}
          onChange={(e) => setValue(e.target.value)}
        />
        {state.isCapturing ? (state.isParsingDLID ? "!!!" : "...") : undefined}
      </div>
      <textarea
        disabled
        value={state.result ? JSON.stringify(state.result) : ""}
      />
    </>
  )
}

const meta: Meta<typeof Component> = {
  component: Component,
}

export default meta

export const Default: StoryObj<typeof Component> = {
  render(args) {
    return <Component {...args} />
  },
}
