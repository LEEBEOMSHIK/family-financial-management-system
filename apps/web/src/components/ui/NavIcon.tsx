export function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    transactions: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',
    expenses: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h5',
    accounts: 'M3 5h18v14H3zM3 10h18M6 15h4',
    settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-7 0v6',
    family: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    documents: 'M3 7V4h6l2 3h10v13H3z',
    roles: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6',
    management: 'M8 4H5v17h14V4h-3M8 3h8v4H8zM8 12h8m-8 4h5',
    support: 'M4 4h16v12H9l-5 4V4zM8 8h8m-8 4h5',
    menu: 'M4 6h16M4 12h16M4 18h16',
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.dashboard}/></svg>;
}
