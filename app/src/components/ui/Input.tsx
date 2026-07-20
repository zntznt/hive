import { type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react'

type FieldChrome = {
  label?: string
  hint?: string
  error?: string
}

const fieldWrap = 'flex flex-col gap-1.5'
const labelCls = 'text-[12.5px] font-semibold text-ink-700'
const hintCls = 'text-xs text-ink-500'
const errorCls = 'text-xs text-danger'

export function Input({
  label,
  hint,
  error,
  id,
  className = '',
  ...rest
}: FieldChrome & InputHTMLAttributes<HTMLInputElement>) {
  const iid = id || (label ? `in-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  return (
    <div className={fieldWrap}>
      {label && (
        <label htmlFor={iid} className={labelCls}>
          {label}
        </label>
      )}
      <input
        id={iid}
        className={`rounded-md border-[1.5px] ${error ? 'border-danger' : 'border-line-input'} bg-paper px-[13px] py-[11px] text-sm text-ink-900 outline-none focus:border-honey-500 ${className}`}
        {...rest}
      />
      {error ? <span className={errorCls}>{error}</span> : hint ? <span className={hintCls}>{hint}</span> : null}
    </div>
  )
}

export function Textarea({
  label,
  hint,
  id,
  rows = 3,
  className = '',
  ...rest
}: FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const iid = id || (label ? `ta-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  return (
    <div className={fieldWrap}>
      {label && (
        <label htmlFor={iid} className={labelCls}>
          {label}
        </label>
      )}
      <textarea
        id={iid}
        rows={rows}
        className={`resize-y rounded-md border-[1.5px] border-line-input bg-paper px-[13px] py-[11px] text-sm text-ink-900 outline-none focus:border-honey-500 ${className}`}
        {...rest}
      />
      {hint && <span className={hintCls}>{hint}</span>}
    </div>
  )
}

export function Select({
  label,
  hint,
  id,
  options,
  className = '',
  children,
  ...rest
}: FieldChrome & SelectHTMLAttributes<HTMLSelectElement> & { options?: { value: string; label: string }[] }) {
  const iid = id || (label ? `sel-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  return (
    <div className={fieldWrap}>
      {label && (
        <label htmlFor={iid} className={labelCls}>
          {label}
        </label>
      )}
      <select
        id={iid}
        className={`rounded-md border-[1.5px] border-line-input bg-paper px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-honey-500 ${className}`}
        {...rest}
      >
        {children ||
          options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
      {hint && <span className={hintCls}>{hint}</span>}
    </div>
  )
}

export function Checkbox({
  label,
  id,
  className = '',
  ...rest
}: { label: ReactNode; id?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const iid = id ?? (rest.name ? `cb-${rest.name}-${String(rest.value ?? '')}` : undefined)
  return (
    <label
      htmlFor={iid}
      className={`inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700 ${className}`}
    >
      <input id={iid} type="checkbox" className="h-[17px] w-[17px] accent-honey-500" {...rest} />
      {label}
    </label>
  )
}

export function EmojiField({
  value = '',
  onChange,
  size = 52,
  placeholder = '🙂',
  name,
}: {
  value?: string
  onChange?: (v: string) => void
  size?: number
  placeholder?: string
  name?: string
}) {
  return (
    <span
      className="relative grid place-items-center rounded-md border-[1.5px] border-line-input bg-paper"
      style={{ width: size, height: size }}
      title="Usa el emoji de tu teclado"
    >
      <input
        name={name}
        defaultValue={value}
        onChange={(e) => {
          const emoji = [...e.target.value].slice(-2).join('')
          e.target.value = emoji
          onChange?.(emoji)
        }}
        inputMode="text"
        aria-label="Emoji"
        placeholder={placeholder}
        className="absolute inset-0 h-full w-full border-none bg-transparent text-center text-ink-900 outline-none"
        style={{ fontSize: Math.round(size * 0.5) }}
      />
    </span>
  )
}
