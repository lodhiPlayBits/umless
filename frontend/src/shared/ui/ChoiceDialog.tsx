import type { ReactNode } from 'react'
import { Button } from './Button'
import Dialog from './Dialog'

export interface DialogChoice {
  label: string
  onClick: () => void
  style?: 'primary' | 'danger'
}

interface ChoiceDialogProps {
  title: string
  children: ReactNode
  /** The first choice gets focus and is what Esc or a click outside picks, so make it the safe one. */
  choices: DialogChoice[]
}

/** A question that interrupts (leave, delete, discard): an alert dialog whose first choice is the safe one. */
export default function ChoiceDialog({ title, children, choices }: ChoiceDialogProps) {
  return (
    <Dialog
      role="alertdialog"
      title={title}
      onDismiss={choices[0].onClick}
      actions={choices.map((choice) => (
        <Button key={choice.label} variant={choice.style ?? 'secondary'} onClick={choice.onClick}>
          {choice.label}
        </Button>
      ))}
    >
      {children}
    </Dialog>
  )
}
