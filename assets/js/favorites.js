// A hand-curated list of words she stars while practicing.
export function createFavorites(store) {
  const ids = new Set(store.get('favorites', []));

  const persist = () => store.set('favorites', [...ids]);

  return {
    has: (wordId) => ids.has(wordId),
    count: () => ids.size,
    ids: () => [...ids],
    toggle(wordId) {
      if (ids.has(wordId)) ids.delete(wordId);
      else ids.add(wordId);
      persist();
      return ids.has(wordId);
    },
  };
}
