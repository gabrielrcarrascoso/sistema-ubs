import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// Modo escuro é o padrão; a escolha fica guardada neste navegador.
// O index.html aplica o tema antes da página aparecer (para não "piscar" branco).
type Tema = 'escuro' | 'claro';
const CHAVE = 'sistema-ubs:tema';

function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'claro' ? 'claro' : 'escuro';
  } catch {
    return 'escuro';
  }
}

function aplicarTema(tema: Tema) {
  if (tema === 'claro') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'claro' ? '#0F2B27' : '#070E0D');
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    /* navegador sem armazenamento: vale só nesta visita */
  }
}

export function BotaoTema({ comRotulo }: { comRotulo?: boolean }) {
  const [tema, setTema] = useState<Tema>(lerTema);
  const proximo: Tema = tema === 'escuro' ? 'claro' : 'escuro';
  const Icone = tema === 'escuro' ? Sun : Moon;
  return (
    <button
      type="button"
      className="botao-tema"
      title={proximo === 'claro' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
      aria-label={proximo === 'claro' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
      onClick={() => {
        aplicarTema(proximo);
        setTema(proximo);
      }}
    >
      <Icone size={13} strokeWidth={1.8} />
      {comRotulo && <span className="rotulo-botao">{proximo === 'claro' ? 'Modo claro' : 'Modo escuro'}</span>}
    </button>
  );
}
