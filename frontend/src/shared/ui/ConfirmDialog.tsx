import type { ReactNode } from 'react'
import ChoiceDialog from '@/shared/ui/ChoiceDialog'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

/** Cancel / confirm dialog: focus starts on Cancel, Esc or a click outside cancels. */
export default function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, danger }: ConfirmDialogProps) {
  return (
    <ChoiceDialog
      title={title}
      choices={[
        { label: 'Cancel', onClick: onCancel },
        { label: confirmLabel, onClick: onConfirm, style: danger ? 'danger' : 'primary' },
      ]}
    >
      {children}
    </ChoiceDialog>
  )
}
