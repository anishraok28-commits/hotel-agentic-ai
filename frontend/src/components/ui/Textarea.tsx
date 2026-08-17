import type { TextareaHTMLAttributes } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label?: string
  readonly hint?: string
}

/** Shared multi-line textarea. */
export function Textarea({ label, hint, className, id: textareaId, ...rest }: TextareaProps) {
  const generatedId = textareaId ?? rest.name
  return (
    <div className="field">
      {label ? <label htmlFor={generatedId}>{label}</label> : null}
      <textarea
        id={generatedId}
        className={['input input--textarea', className].filter(Boolean).join(' ')}
        {...rest}
      />
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  )
}