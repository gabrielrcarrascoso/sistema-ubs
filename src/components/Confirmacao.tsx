import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Modal } from './ui';

// Janela de confirmação no visual do sistema (substitui o confirm() cinza do navegador).
// Uso: const confirmar = useConfirmar();  if (!(await confirmar('Remover este item?', { perigo: true }))) return;

interface Opcoes {
  titulo?: string;
  botao?: string; // texto do botão de confirmar
  perigo?: boolean; // ação que apaga algo: botão vermelho
}
type Pedido = Opcoes & { texto: string; responder: (sim: boolean) => void };
type Confirmar = (texto: string, opcoes?: Opcoes) => Promise<boolean>;

const Contexto = createContext<Confirmar>(() => Promise.resolve(false));

export function ProvedorConfirmacao({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);

  const confirmar = useCallback<Confirmar>(
    (texto, opcoes = {}) => new Promise(resolver => setPedido({ ...opcoes, texto, responder: resolver })),
    [],
  );

  const fechar = (sim: boolean) => {
    pedido?.responder(sim);
    setPedido(null);
  };

  const Icone = pedido?.perigo ? AlertTriangle : HelpCircle;
  return (
    <Contexto.Provider value={confirmar}>
      {children}
      {pedido && (
        <Modal titulo={pedido.titulo ?? (pedido.perigo ? 'Tem certeza?' : 'Confirmar')} aoFechar={() => fechar(false)}>
          <div className="confirmacao">
            <span className={`confirmacao-icone ${pedido.perigo ? 'perigo' : ''}`}><Icone size={22} strokeWidth={1.8} /></span>
            <p>{pedido.texto}</p>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => fechar(false)}>Cancelar</button>
            <button className={`btn ${pedido.perigo ? 'perigo-cheio' : 'primary'}`} onClick={() => fechar(true)} autoFocus>
              {pedido.botao ?? (pedido.perigo ? 'Sim, remover' : 'Confirmar')}
            </button>
          </div>
        </Modal>
      )}
    </Contexto.Provider>
  );
}

export const useConfirmar = () => useContext(Contexto);

// ---------------------------------------------------------------------------
// Caixa para digitar um texto (substitui o prompt() do navegador)
// ---------------------------------------------------------------------------
type Perguntar = (titulo: string, valorInicial?: string) => Promise<string | null>;
const ContextoTexto = createContext<Perguntar>(() => Promise.resolve(null));

export function ProvedorPergunta({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<{ titulo: string; valor: string; responder: (v: string | null) => void } | null>(null);
  const perguntar = useCallback<Perguntar>(
    (titulo, valorInicial = '') => new Promise(resolver => setPedido({ titulo, valor: valorInicial, responder: resolver })),
    [],
  );
  const fechar = (v: string | null) => {
    pedido?.responder(v);
    setPedido(null);
  };
  return (
    <ContextoTexto.Provider value={perguntar}>
      {children}
      {pedido && (
        <Modal titulo={pedido.titulo} aoFechar={() => fechar(null)}>
          <form
            onSubmit={e => {
              e.preventDefault();
              fechar(pedido.valor.trim() || null);
            }}
          >
            <label className="field">
              <input autoFocus value={pedido.valor} onChange={e => setPedido({ ...pedido, valor: e.target.value })} />
            </label>
            <div className="actions">
              <button type="button" className="btn" onClick={() => fechar(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </ContextoTexto.Provider>
  );
}

export const usePerguntar = () => useContext(ContextoTexto);
