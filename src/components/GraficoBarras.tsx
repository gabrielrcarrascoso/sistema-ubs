// Gráfico de colunas simples em SVG (sem biblioteca externa)

export interface PontoGrafico {
  rotulo: string;
  valor: number | null;
}

export function GraficoBarras({
  pontos,
  meta,
  sufixo = '',
}: {
  pontos: PontoGrafico[];
  meta?: number | null;
  sufixo?: string;
}) {
  const largura = 640;
  const altura = 230;
  const margem = { topo: 22, base: 28, esq: 8, dir: 8 };
  const maximo = Math.max(1, meta ?? 0, ...pontos.map(p => p.valor ?? 0)) * 1.12;
  const areaAltura = altura - margem.topo - margem.base;
  const passo = (largura - margem.esq - margem.dir) / Math.max(pontos.length, 1);
  const barra = Math.min(46, passo * 0.6);
  const y = (v: number) => margem.topo + areaAltura - (v / maximo) * areaAltura;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Gráfico por período">
        <line x1={0} x2={largura} y1={y(0)} y2={y(0)} stroke="#dbe4ec" />
        {pontos.map((p, i) => {
          const cx = margem.esq + passo * i + passo / 2;
          return (
            <g key={p.rotulo}>
              {p.valor !== null ? (
                <>
                  <rect
                    x={cx - barra / 2}
                    y={y(p.valor)}
                    width={barra}
                    height={Math.max(0, y(0) - y(p.valor))}
                    rx={5}
                    fill="#2a9d8f"
                  >
                    <title>{`${p.rotulo}: ${p.valor.toLocaleString('pt-BR')}${sufixo}`}</title>
                  </rect>
                  <text x={cx} y={y(p.valor) - 6} textAnchor="middle" style={{ fill: '#162942', fontWeight: 700 }}>
                    {p.valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                    {sufixo}
                  </text>
                </>
              ) : (
                <text x={cx} y={y(0) - 6} textAnchor="middle">
                  sem dado
                </text>
              )}
              <text x={cx} y={altura - 8} textAnchor="middle">
                {p.rotulo}
              </text>
            </g>
          );
        })}
        {meta !== null && meta !== undefined && (
          <g>
            <line x1={0} x2={largura} y1={y(meta)} y2={y(meta)} stroke="#d08a1e" strokeDasharray="6 5" />
            <text x={largura - 4} y={y(meta) - 5} textAnchor="end" style={{ fill: '#a0660f', fontWeight: 700 }}>
              meta {meta.toLocaleString('pt-BR')}
              {sufixo}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
