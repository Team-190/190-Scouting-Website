const arrow = path => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="display:block;background:transparent"><path d="${path}"/></svg>`;

// Use SVGs so sort arrows do not depend on an icon font loading correctly.
export const gridSortIcons = {
  sortAscending: arrow('M8 3v10M3 8l5 5 5-5'),
  sortDescending: arrow('M8 13V3M3 8l5-5 5 5'),
};
