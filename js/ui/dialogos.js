// Diálogo de exclusão de processo (10.9) e lista de excluídos recentes (10.10), com <dialog> nativo (foco preso, Esc).
import { h, plural, limpar } from './dom.js';
import { normalizarNome } from '../dominio/validacao.js';
import { contagemProcesso, PRAZO_DESFAZER_DIAS } from '../dominio/lixeira.js';
import { dataHoraBR } from '../dominio/periodos.js';
import { reconciliar } from './reconciliar.js';

let abridor = null;

function contagemTexto(c) {
  const partes = [];
  if (c.acoes) partes.push(plural(c.acoes, 'ação', 'ações'));
  if (c.melhorias) partes.push(plural(c.melhorias, 'melhoria', 'melhorias'));
  if (c.indicadores) partes.push(plural(c.indicadores, 'indicador', 'indicadores'));
  if (c.medicoes) partes.push(plural(c.medicoes, 'medição', 'medições'));
  if (!partes.length) return 'Este processo não tem itens.';
  const final = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0];
  return `Serão apagados: ${final}.`;
}

/** aoConfirmar() devolve uma promessa; se rejeitar em até 1,5 s, o diálogo mostra a falha e nada foi apagado. */
export function abrirDialogoExcluir({ ativo, aoConfirmar, origem }) {
  const dlg = document.getElementById('dlg-excluir');
  abridor = origem ?? document.activeElement;
  limpar(dlg);
  const idTitulo = 'dlg-excluir-titulo';
  const idCorpo = 'dlg-excluir-corpo';
  dlg.setAttribute('aria-labelledby', idTitulo);
  dlg.setAttribute('aria-describedby', idCorpo);

  const campo = h('input', { id: 'dlg-excluir-nome', type: 'text', autocomplete: 'off', 'aria-describedby': 'dlg-excluir-razao' });
  const razao = h('p', { id: 'dlg-excluir-razao', class: 'ajuda' }, 'Digite o nome para liberar.');
  const status = h('div', { id: 'dlg-excluir-status', role: 'status' });
  const botao = h('button', { type: 'button', class: 'btn perigo', disabled: true }, 'Excluir processo');
  const cancelar = h('button', { type: 'button', class: 'btn fant' }, 'Cancelar');

  const igual = () => normalizarNome(campo.value) === normalizarNome(ativo.nome);
  campo.addEventListener('input', () => {
    const ok = igual();
    botao.disabled = !ok;
    razao.textContent = ok ? 'Nome conferido.' : 'Digite o nome para liberar.';
  });
  cancelar.addEventListener('click', () => dlg.close());
  botao.addEventListener('click', async () => {
    if (!igual()) return;
    botao.disabled = true;
    botao.textContent = 'Excluindo…';
    limpar(status);
    try {
      const promessa = aoConfirmar();
      await Promise.race([promessa, new Promise((resolve) => setTimeout(resolve, 1500))]);
      dlg.dataset.concluido = '1';
      dlg.close();
    } catch {
      botao.disabled = false;
      botao.textContent = 'Tentar de novo';
      status.append(h('div', { class: 'aviso-campo erro', role: 'alert' }, h('p', null, 'Não foi possível excluir. Nada foi apagado.')));
    }
  });

  dlg.append(
    h('h2', { id: idTitulo }, `Excluir o processo «${ativo.nome}»?`),
    h('div', { id: idCorpo },
      h('p', null, contagemTexto(contagemProcesso(ativo))),
      h('p', null, `O processo some das telas Plano e Indicadores para todas as pessoas. Você poderá desfazer por ${PRAZO_DESFAZER_DIAS} dias.`)),
    h('div', { class: 'campo' }, h('label', { for: 'dlg-excluir-nome' }, 'Para confirmar, digite o nome do processo'), campo, razao),
    status,
    h('div', { class: 'botoes' }, cancelar, botao));
  delete dlg.dataset.concluido;
  dlg.showModal();
  campo.focus();
  return dlg;
}

export function configurarDialogos({ aoFecharExclusao }) {
  const dlg = document.getElementById('dlg-excluir');
  dlg.addEventListener('close', () => {
    const concluido = dlg.dataset.concluido === '1';
    limpar(dlg);
    aoFecharExclusao(concluido, abridor);
    abridor = null;
  });
  const lix = document.getElementById('dlg-lixeira');
  lix.addEventListener('click', (e) => {
    if (e.target.closest('[data-acao="fechar-lixeira"]')) lix.close();
  });
  lix.addEventListener('close', () => {
    if (abridor && document.contains(abridor)) abridor.focus();
  });
}

export function abrirLixeira(origem) {
  const lix = document.getElementById('dlg-lixeira');
  abridor = origem ?? document.activeElement;
  if (!lix.open) lix.showModal();
}

export function lixeiraAberta() {
  return document.getElementById('dlg-lixeira').open;
}

const ROTULO_TIPO = { processo: 'Processo', melhoria: 'Melhoria', acao: 'Ação', indicador: 'Indicador', medicao: 'Medição' };

/** Redesenha o conteúdo da lista de excluídos recentes. */
export function desenharLixeira(itens, estadoBotoes) {
  const corpo = document.getElementById('lixeira-corpo');
  const arvore = h('div', null,
    itens.length === 0
      ? h('p', { 'data-k': 'lx-vazio' }, 'Nenhum item excluído que ainda possa ser restaurado.')
      : h('ul', { class: 'lista-lixeira', 'data-k': 'lx-lista' }, ...itens.map((it, n) => {
        const chave = `${it.processoId}|${it.tipo}|${it.alvo?.id ?? ''}|${it.alvo?.periodo ?? ''}`;
        const estadoItem = estadoBotoes.get(chave);
        return h('li', { 'data-k': `lx-${chave}` },
          h('div', null,
            h('strong', null, `${ROTULO_TIPO[it.tipo]}: `, it.rotulo || '(sem nome)'),
            it.tipo !== 'processo' ? h('span', { class: 'suave' }, ` · em «${it.processoNome}»`) : null,
            h('div', { class: 'small suave' }, `Excluído em ${dataHoraBR(it.em)}. Pode ser restaurado até ${dataHoraBR(it.ate)}.`,
              it.acoesJuntas ? ` Volta com ${plural(it.acoesJuntas, 'ação', 'ações')}.` : '',
              it.medicoesJuntas ? ` Volta com ${plural(it.medicoesJuntas, 'medição', 'medições')}.` : ''),
            it.motivo ? h('div', { class: 'ajuda' }, it.motivo) : null,
            estadoItem?.erro ? h('div', { class: 'estado erro', role: 'alert' }, `✕ ${estadoItem.erro}`) : null),
          h('button', {
            type: 'button', class: 'btn fant', disabled: !it.restauravel || Boolean(estadoItem?.restaurando), 'data-acao': 'restaurar',
            'data-pid': it.processoId, 'data-tipo': it.tipo, 'data-id': it.alvo?.id ?? '', 'data-periodo': it.alvo?.periodo ?? '', 'data-n': n,
          }, estadoItem?.restaurando ? 'Restaurando…' : 'Restaurar', h('span', { class: 'sr' }, ` ${it.rotulo}`)));
      })));
  reconciliar(corpo, arvore);
}
