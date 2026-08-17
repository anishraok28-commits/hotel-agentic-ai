import type { ChangeEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/icon/Icon'

export interface StepperProps {
  readonly name: string
  readonly value: number
  readonly min?: number
  readonly max?: number
  readonly onChange: (value: number) => void
}

/** Shared quantity stepper: minus / value / plus, keyboard accessible. */
export function QuantityStepper({
  name,
  value,
  min = 1,
  max = 99,
  onChange,
}: StepperProps) {
  function clamp(next: number): number {
    return Math.min(max, Math.max(min, next))
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>): void {
    const next = Number(event.target.value)
    if (Number.isNaN(next)) return
    onChange(clamp(next))
  }

  return (
    <span className="stepper">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="stepper__btn"
        aria-label={`Decrease quantity of ${name}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Icon name="minus" size={16} />
      </Button>
      <input
        className="stepper__value"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={`Quantity of ${name}`}
        onChange={handleInput}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="stepper__btn"
        aria-label={`Increase quantity of ${name}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Icon name="plus" size={16} />
      </Button>
    </span>
  )
}