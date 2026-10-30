import { createContext, useContext } from 'react'
import type { AriaAttributes } from 'react'

/** What a <Field> tells the control inside it: its id and how to describe it. */
export type FieldControl = { id: string; describedBy?: string; invalid: boolean }

export const FieldContext = createContext<FieldControl | null>(null)

/**
 * Props that connect a control to its <Field>: id, aria-describedby and aria-invalid. Inside a
 * Field the Field owns the id (its <label> points at it); pass `id` to the Field to choose one.
 */
export function useFieldControl(own: { 'aria-describedby'?: string; 'aria-invalid'?: AriaAttributes['aria-invalid'] }) {
  const field = useContext(FieldContext)
  if (!field) return {}
  const describedBy = [field.describedBy, own['aria-describedby']].filter(Boolean).join(' ') || undefined
  return {
    id: field.id,
    'aria-describedby': describedBy,
    'aria-invalid': own['aria-invalid'] ?? (field.invalid || undefined),
  }
}
