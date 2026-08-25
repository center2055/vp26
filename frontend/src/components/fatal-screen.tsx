type FatalScreenProps = {
  title: string
  message: string
}

export function FatalScreen({ title, message }: FatalScreenProps) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px',
        background:
          'radial-gradient(circle at top, rgba(59,130,246,0.18), transparent 38%), linear-gradient(180deg, #162033 0%, #111827 100%)',
        color: '#f3f4f6',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <section
        style={{
          width: 'min(720px, 100%)',
          padding: '32px 30px',
          borderRadius: '24px',
          background: 'rgba(15, 23, 42, 0.84)',
          border: '1px solid rgba(248, 113, 113, 0.24)',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.42)',
        }}
      >
        <p
          style={{
            margin: 0,
            color: '#fca5a5',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          VP26 Rendererfehler
        </p>
        <h1
          style={{
            margin: '18px 0 10px',
            fontSize: 'clamp(28px, 4vw, 42px)',
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
          }}
        >
          {title}
        </h1>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.65 }}>
          Die Web-Oberfläche ist abgestürzt. Statt eines schwarzen Fensters zeigt VP26 jetzt den erkannten Fehler an.
        </p>
        <pre
          style={{
            margin: '22px 0 0',
            padding: '14px 16px',
            borderRadius: '16px',
            background: 'rgba(30, 41, 59, 0.72)',
            border: '1px solid rgba(148, 163, 184, 0.16)',
            color: '#e2e8f0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'Consolas, "SFMono-Regular", monospace',
            fontSize: '13px',
            lineHeight: 1.55,
          }}
        >
          {message}
        </pre>
      </section>
    </div>
  )
}
