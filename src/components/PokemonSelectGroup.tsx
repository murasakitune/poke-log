"use client";

type Props = {
  title: string;
  hideTitle?: boolean;
  values: string[];
  options: readonly string[];
  onChange: (index: number, value: string) => void;
};

export function PokemonSelectGroup({ title, hideTitle = false, values, options, onChange }: Props) {
  return (
    <div>
      {!hideTitle ? <h3>{title}</h3> : null}
      <div className="inputs">
        {values.map((value, index) => {
          const datalistId = `pokemon-list-${toSafeId(title)}-${index}`;
          const hasCustomValue = value !== "" && !options.includes(value);
          return (
            <div className="pokemonSelectBox" key={index}>
              <input
                type="search"
                value={value}
                onChange={(event) => onChange(index, event.target.value)}
                placeholder={`${index + 1}匹目を検索または入力`}
                list={datalistId}
                aria-label={`${title} ${index + 1}匹目を検索または入力`}
              />
              <datalist id={datalistId}>
                {options.map((name) => <option key={name} value={name} />)}
              </datalist>
              <select
                value={value}
                onChange={(event) => onChange(index, event.target.value)}
                aria-label={`${title} ${index + 1}匹目を候補から選択`}
              >
                <option value="">{index + 1}匹目を選択</option>
                {hasCustomValue ? <option value={value}>{value}（自由入力）</option> : null}
                {options.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function toSafeId(value: string) {
  return Array.from(value).map((character) => character.codePointAt(0)?.toString(16)).join("-");
}
