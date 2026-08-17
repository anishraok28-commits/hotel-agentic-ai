/** Shared loading state. */
export function LoadingState({ label = 'Loading...' }: { readonly label?: string }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="spinner spinner--lg" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}