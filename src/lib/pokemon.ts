import pokemonData from "../data/pokemon.json";

/** The single access point for Pokemon suggestion data. */
export const pokemonOptions: readonly string[] = Object.freeze(
  Array.from(
    new Set(
      pokemonData.filter(
        (name): name is string => typeof name === "string" && name.trim().length > 0,
      ),
    ),
  ),
);
