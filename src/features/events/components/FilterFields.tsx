import { Checkbox } from '@/components/ui/Checkbox'
import { Chip } from '@/components/ui/Chip'
import { RangeSlider } from '@/components/ui/RangeSlider'
import { Select } from '@/components/ui/Select'
import { Toggle } from '@/components/ui/Toggle'
import { formatPrice } from '@/lib/format'
import type { Category, CategorySlug, EventFilters } from '@/types/event'
import { CITIES, PRICE_RANGE, WHEN_OPTIONS } from '../constants'
import { priceBounds } from '../filterParams'

export type FilterValues = Pick<
  EventFilters,
  'city' | 'from' | 'to' | 'categories' | 'minPrice' | 'maxPrice' | 'when' | 'seatMapOnly'
>

interface FilterFieldsProps {
  values: FilterValues
  onChange: (patch: Partial<FilterValues>) => void
  categories: Category[] | undefined
  /** `sidebar`: checkboxes (desktop). `drawer`: chips + cidade/datas (mobile). */
  variant: 'sidebar' | 'drawer'
}

const heading = 'mb-2 font-extrabold'

/** Campos de filtro compartilhados entre a sidebar (desktop) e o drawer (mobile). */
export function FilterFields({ values, onChange, categories, variant }: FilterFieldsProps) {
  const drawer = variant === 'drawer'
  const [lo, hi] = priceBounds(values)

  const toggleCategory = (slug: CategorySlug) =>
    onChange({
      categories: values.categories.includes(slug)
        ? values.categories.filter((c) => c !== slug)
        : [...values.categories, slug],
    })

  return (
    <div className={drawer ? 'text-[15px]' : 'flex flex-col gap-[22px] text-sm'}>
      {drawer && (
        <>
          <div className="mt-4">
            <div className={heading}>Localização</div>
            <Select
              value={values.city}
              onChange={(city) => onChange({ city })}
              aria-label="Cidade"
              className="w-full justify-between py-2.5!"
              options={[
                { value: '', label: 'Todas as cidades' },
                ...CITIES.map((c) => ({ value: c, label: c })),
              ]}
            />
          </div>
          <div className="mt-4">
            <div className={heading}>Data</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-muted text-xs">
                De
                <input
                  type="date"
                  value={values.from}
                  max={values.to || undefined}
                  onChange={(e) => onChange({ from: e.target.value })}
                  className="mt-1 block w-full border border-divider bg-transparent px-2 py-2 text-sm text-text"
                />
              </label>
              <label className="text-muted text-xs">
                Até
                <input
                  type="date"
                  value={values.to}
                  min={values.from || undefined}
                  onChange={(e) => onChange({ to: e.target.value })}
                  className="mt-1 block w-full border border-divider bg-transparent px-2 py-2 text-sm text-text"
                />
              </label>
            </div>
          </div>
        </>
      )}

      <fieldset className={drawer ? 'mt-4 min-w-0' : 'm-0 min-w-0 border-0 p-0'}>
        <legend className={`${heading} p-0`}>Categoria</legend>
        {drawer ? (
          <div className="flex flex-wrap gap-1.5">
            {categories?.map((c) => (
              <Chip
                key={c.slug}
                label={c.name}
                size="lg"
                selected={values.categories.includes(c.slug)}
                onClick={() => toggleCategory(c.slug)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-[7px]">
            {categories?.map((c) => (
              <Checkbox
                key={c.slug}
                checked={values.categories.includes(c.slug)}
                onChange={() => toggleCategory(c.slug)}
                aside={c.eventCount}
              >
                {c.name}
              </Checkbox>
            ))}
          </div>
        )}
      </fieldset>

      <div className={drawer ? 'mt-4' : undefined}>
        <div className={drawer ? `${heading} mb-3.5` : `${heading} mb-2.5`}>
          {drawer ? `Preço · ${formatPrice(lo)} – ${hi >= PRICE_RANGE.max ? `${formatPrice(hi)}+` : formatPrice(hi)}` : 'Faixa de preço'}
        </div>
        <div className={drawer ? 'mx-2 mb-2' : 'mx-1.5 my-3.5'}>
          <RangeSlider
            min={PRICE_RANGE.min}
            max={PRICE_RANGE.max}
            step={PRICE_RANGE.step}
            value={[lo, hi]}
            large={drawer}
            labels={['Preço mínimo', 'Preço máximo']}
            onCommit={([a, b]) =>
              onChange({
                minPrice: a <= PRICE_RANGE.min ? null : a,
                maxPrice: b >= PRICE_RANGE.max ? null : b,
              })
            }
          />
        </div>
        {!drawer && (
          <div className="tabular flex justify-between font-semibold">
            <span>{formatPrice(lo)}</span>
            <span>{hi >= PRICE_RANGE.max ? `${formatPrice(hi)}+` : formatPrice(hi)}</span>
          </div>
        )}
      </div>

      <div className={drawer ? 'mt-4' : undefined}>
        <div className={heading}>Quando</div>
        <div className="flex flex-wrap gap-1.5">
          {WHEN_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={drawer ? o.short : o.label}
              size={drawer ? 'lg' : 'md'}
              selected={values.when === o.value}
              onClick={() => onChange({ when: values.when === o.value ? null : o.value })}
            />
          ))}
        </div>
      </div>

      <div className={drawer ? 'mt-4' : undefined}>
        <Toggle checked={values.seatMapOnly} onChange={(seatMapOnly) => onChange({ seatMapOnly })}>
          Apenas com assento marcado
        </Toggle>
      </div>
    </div>
  )
}
