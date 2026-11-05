// Categorical colours for groups, in a fixed, colour-blind-validated order.
// A group keeps its colour for life ("colour follows the entity"), so charts
// never repaint a group when filters change.
export const GROUP_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#6250d6', // violet
  '#e34948', // red
]

export const GROUP_COLOR_NAMES = {
  '#2a78d6': 'Blue',
  '#eb6834': 'Orange',
  '#1baf7a': 'Aqua',
  '#eda100': 'Yellow',
  '#e87ba4': 'Magenta',
  '#008300': 'Green',
  '#6250d6': 'Violet',
  '#e34948': 'Red',
}

export const NEUTRAL_SERIES = '#2a78d6'

/** First palette colour not already used by an existing group. */
export function nextGroupColor(groups) {
  const used = new Set(groups.map((g) => g.color))
  return GROUP_COLORS.find((c) => !used.has(c)) || GROUP_COLORS[groups.length % GROUP_COLORS.length]
}

export function isPaletteColor(color) {
  return GROUP_COLORS.includes(color)
}
