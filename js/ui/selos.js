// Selos, marcas e carimbos (tokens semânticos, seção 2.3): sempre texto e ícone de forma distinta; a cor só reforça.
import { h } from './dom.js';
import { ROTULO_STATUS } from '../dominio/calculos.js';
import { dataHoraBR } from '../dominio/periodos.js';

const ICONE_STATUS = { nao_iniciada: '○', em_andamento: '◐', concluida: '✓', travada: '■' };
const CLASSE_STATUS = { nao_iniciada: 's-nao', em_andamento: 's-and', concluida: 's-ok', travada: 's-trav' };

function selo(classe, icone, ...texto) {
  return h('span', { class: `selo ${classe}` }, h('span', { class: 'i', 'aria-hidden': 'true' }, icone), ' ', ...texto);
}

export function seloStatus(status, contagem = null) {
  return selo(CLASSE_STATUS[status], ICONE_STATUS[status], ROTULO_STATUS[status], contagem === null ? '' : ` ${contagem}`);
}

export function seloAtrasada(texto) {
  return selo('s-atr', '◷', texto);
}

export function seloPendente(texto) {
  return selo('s-pend', '▲', texto);
}

export function seloNeutro(texto) {
  return selo('s-nao', '—', texto);
}

export function seloSituacao(codigo, texto) {
  if (codigo === 'atingida') return selo('s-ok', '✓', texto);
  if (codigo === 'nao_atingida') return selo('s-trav', '▼', texto);
  return selo('s-nao', '—', texto);
}

export function carimbo(prefixo, ts, vazio) {
  const t = dataHoraBR(ts);
  return h('span', { class: 'carimbo' }, t ? `${prefixo} em ${t}` : vazio);
}
