export function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    transactions: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',
    expenses: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h5',
    accounts: 'M3 5h18v14H3zM3 10h18M6 15h4',
    settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-7 0v6',
    management: 'M8 4H5v17h14V4h-3M8 3h8v4H8zM8 12h8m-8 4h5',
    menu: 'M4 6h16M4 12h16M4 18h16',
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.dashboard}/></svg>;
}
