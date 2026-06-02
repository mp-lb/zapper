// The marketing site lives in the separate landing-page app; the docs app's
// root sends visitors to the documentation. A client-side meta refresh keeps
// the route statically prerenderable (a server redirect breaks the SPA
// fallback prerender).
export function meta() {
  return [
    { title: 'Zapper Docs' },
    { httpEquiv: 'refresh', content: '0; url=/docs' },
  ];
}

export default function Page() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <p>
        Redirecting to the <a href="/docs">Zapper documentation</a>…
      </p>
    </main>
  );
}
