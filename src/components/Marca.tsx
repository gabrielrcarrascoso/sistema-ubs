// Marca do sistema: cruz da saúde sobre um sol nascente (o sertão de Salgueiro)
export function Marca({ tamanho = 38 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 40 40" aria-hidden="true" className="marca">
      <rect width="40" height="40" rx="11" fill="#0E7C6B" />
      <circle cx="29" cy="11" r="6" fill="#E8A33D" />
      <path d="M16.5 9h7v7.5H31v7h-7.5V31h-7v-7.5H9v-7h7.5z" fill="#FFFFFF" />
    </svg>
  );
}

export function MarcaComNome({ claro }: { claro?: boolean }) {
  return (
    <span className={`marca-nome ${claro ? 'claro' : ''}`}>
      <Marca />
      <span>
        <strong>Sistema UBS</strong>
        <small>Salgueiro · Pernambuco</small>
      </span>
    </span>
  );
}
