import { type HTMLAttributes } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useDLIDInput } from "./input.js"

const Component = (props: HTMLAttributes<HTMLInputElement>) => {
  const { ...other } = props

  const [state, callbacks] = useDLIDInput()

  return (
    <>
      <div>
        <input {...other} value={state.value} {...callbacks} />
        {state.isInputtingDLID ? "!" : undefined}
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
