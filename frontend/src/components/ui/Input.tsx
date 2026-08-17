import type { InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string
  readonly hint?: string
}

/** Shared text/number input used across all modes. */
export function Input({ label, hint, className, id: inputId, ...rest }: InputProps) {
  const generatedId = inputId ?? rest.name
  return (
    <div className="field">
      {label ? <label htmlFor={generatedId}>{label}</label> : null}
      <input id={generatedId} className={['input', className].filter(Boolean).join(' ')} {...rest} />
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  )
}