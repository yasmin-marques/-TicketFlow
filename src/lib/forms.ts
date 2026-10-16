import type { FieldValues, Path, UseFormRegister } from 'react-hook-form'

/**
 * `register` com máscara: aplica `mask` ao valor ANTES de o react-hook-form
 * lê-lo (usado em CPF, telefone, data, cartão…).
 */
export function maskedRegister<T extends FieldValues>(register: UseFormRegister<T>, name: Path<T>, mask: (value: string) => string) {
  const reg = register(name)
  return {
    ...reg,
    onChange: (e: { target: { value: string; name: string } }) => {
      e.target.value = mask(e.target.value)
      return reg.onChange(e)
    },
  }
}
