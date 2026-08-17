import type { SelectHTMLAttributes } from 'react'

export interface Option {
  readonly value: string
  readonly label: string
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label?: string
  readonly options: readonly Option[]
  readonly hint?: string
}

/** Shared select dropdown used across modes. */
export function Select({ label, options, hint, className, id: selectId, ...rest }: SelectProps) {
  const generatedId = selectId ?? rest.name
  return (
    <div className="field">
      {label ? <label htmlFor={generatedId}>{label}</label> : null}
      <select
        id={generatedId}
        className={['input input--select', className].filter(Boolean).join(' ')}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  )
}