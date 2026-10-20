// Faixas de aviso (conexão, ambiente de teste, erro), indicador de conexão e barra de desfazer (especificação, seção 10).
import { h, plural } from './dom.js';
import { estado, estaOffline, totalNaoGravados } from './estado.js';
import { horaSaoPaulo } from '../dominio/periodos.js';

function faixa(classe, role, ...filhos) {
  return h('div', { class: `faixa ${classe}`, role }, ...filhos);
}

export function faixaDeTeste() {
  if (!estado.ambienteTeste) return null;
  return h('div', { class: 'faixa teste', role: 'note', 'data-k': 'faixa-teste' },
    h('strong', null, 'Dados fictícios.'), ' Ambiente de teste: nomes, datas e valores são inventados.');
}

/** Faixa global de conexão (10.8). */
export function faixaDeConexao() {
  const naoGravados = totalNaoGravados();
  const pend = estado.pendencias.size;
  if (estaOffline()) {
    return h('div', { class: 'faixa alerta', role: 'status', 'data-k': 'faixa-conexao' },
      h('span', null, `Sem conexão. O que você digitar pode não ser gravado, e os dados abaixo podem estar desatualizados${estado.desdeOffline ? ` desde ${estado.desdeOffline}` : ''}.`,
        pend ? ` ${plural(pend, 'alteração aguardando envio', 'alterações aguardando envio')}. Não feche esta aba.` : ''));
  }
  if (estado.reconectando) {
    return h('div', { class: 'faixa alerta', role: 'status', 'data-k': 'faixa-conexao' }, 'Conexão restabelecida. Gravando as alterações pendentes…');
  }
  if (estado.resultadoReconexao?.tipo === 'ok') {
    return h('div', { class: 'faixa ok', role: 'status', 'data-k': 'faixa-conexao' }, 'Todas as alterações foram gravadas.');
  }
  if (naoGravados > 0) {
    return h('div', { class: 'faixa erro', role: 'status', 'data-k': 'faixa-conexao' },
      h('span', null, `${plural(naoGravados, 'alteração não foi gravada', 'alterações não foram gravadas')}. `),
      h('button', { type: 'button', class: 'btn-link', 'data-acao': 'revisar-nao-gravados' }, 'Revisar'));
  }
  return null;
}

export function faixaDeErro() {
  if (!estado.erroGlobal) return null;
  return h('div', { class: 'faixa erro', role: 'alert', 'data-k': 'faixa-erro' },
    h('span', null, estado.erroGlobal),
    h('button', { type: 'button', class: 'btn-link', 'data-acao': 'fechar-erro' }, 'Fechar'));
}

/** Indicador de conexão em texto e ícone. */
export function indicadorDeConexao() {
  if (estaOffline()) {
    return h('span', { class: 'selo s-pend', 'data-k': 'ind-conexao' }, h('span', { class: 'i', 'aria-hidden': 'true' }, '▲'), ` Sem conexão${estado.desdeOffline ? ` desde ${estado.desdeOffline}` : ''}`);
  }
  if (estado.reconectando) return h('span', { class: 'selo s-and', 'data-k': 'ind-conexao' }, h('span', { class: 'i', 'aria-hidden': 'true' }, '◐'), ' Reconectando…');
  if (estado.carregando) return h('span', { class: 'selo s-nao', 'data-k': 'ind-conexao' }, h('span', { class: 'i', 'aria-hidden': 'true' }, '○'), ' Conectando…');
  return h('span', { class: 'selo s-ok', 'data-k': 'ind-conexao' }, h('span', { class: 'i', 'aria-hidden': 'true' }, '✓'), ' Conectado');
}

export function notaDoMenu() {
  if (estaOffline()) return `Sem conexão${estado.desdeOffline ? ` desde ${estado.desdeOffline}` : ''}`;
  if (estado.carregando) return 'Conectando…';
  return estado.ultimaSincronizacao ? `Conectado · atualizado às ${estado.ultimaSincronizacao}` : 'Conectado';
}

function aviso(e) {
  return `Desfazer disponível até ${horaSaoPaulo(e.ate)}.`;
}

/** Barra de desfazer (10.10): fixa, não some sozinha, até 3 itens. */
export function barraDeDesfazer() {
  const itens = estado.desfazer;
  const agora = Date.now();
  const vivos = itens.filter((e) => e.ate > agora);
  if (!vivos.length) return [];
  const visiveis = vivos.slice(-3);
  const resto = vivos.length - visiveis.length;
  const linhas = visiveis.map((e) => h('div', { class: 'barra', role: 'status', 'data-k': `barra-${e.id}` },
    h('span', null, e.erro ?? `«${e.rotulo}» excluído. ${aviso(e)}`),
    h('button', { type: 'button', class: 'btn', 'data-acao': 'desfazer', 'data-id': e.id }, e.desfazendo ? 'Desfazendo…' : e.erro ? 'Tentar de novo' : 'Desfazer',
      h('span', { class: 'sr' }, ` exclusão de ${e.rotulo}`)),
    h('button', { type: 'button', class: 'btn', 'data-acao': 'fechar-desfazer', 'data-id': e.id }, 'Fechar', h('span', { class: 'sr' }, ` aviso de ${e.rotulo}`))));
  if (resto > 0) {
    linhas.unshift(h('div', { class: 'barra', 'data-k': 'barra-resto' },
      h('span', null, `${plural(resto, 'outro item excluído', 'outros itens excluídos')}.`),
      h('button', { type: 'button', class: 'btn', 'data-acao': 'abrir-lixeira' }, 'Ver excluídos recentes')));
  }
  return linhas;
}
