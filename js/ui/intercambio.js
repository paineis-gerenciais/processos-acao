// Exportar e importar JSON (issue #5): download do arquivo, escolha do arquivo, prévia, gravação item a item e resultado.
// As gravações passam pela mesma camada de dados e pelas mesmas regras das edições feitas na tela.
import { h, plural, limpar } from './dom.js';
import { estado, atualizar, hoje, procPorId, ativoPorId, listaAtiva, estaOffline, anunciar } from './estado.js';
import { processosAtivos } from '../dominio/lixeira.js';
import {
  montarExportacao, nomeDoArquivo, lerArquivo, planejarNovos, planejarAcrescimo, totalDeGravacoes, TAMANHO_MAXIMO, AVISO,
} from '../dominio/intercambio.js';
import { classificarErro, mensagemDeErro } from '../dominio/erros.js';

// ----- Exportar -----

function baixar(nome, objeto) {
  const blob = new Blob([`${JSON.stringify(objeto, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  // Âncora fora do documento, só para disparar o download (não passa por h(): o destino é um blob local).
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportarTodos() {
  const lista = listaAtiva();
  if (!lista.length) { anunciar('Não há processos para exportar.'); return; }
  baixar(nomeDoArquivo(null, hoje()), montarExportacao(lista));
  anunciar(`Exportados ${plural(lista.length, 'processo', 'processos')}. ${AVISO}.`);
}

export function exportarProcesso(pid) {
  const a = ativoPorId(pid);
  if (!a) return;
  baixar(nomeDoArquivo(a.nome, hoje()), montarExportacao([a]));
  anunciar(`Processo «${a.nome}» exportado. ${AVISO}.`);
}

// ----- Importar: escolha do arquivo -----

let sessao = null; // { modo, pid, plano, fase: 'previa' | 'gravando' | 'fim', feitas, total, erro, abridor }

/** modo 'novos' (barra do topo) ou 'acrescimo' (card do processo `pid`). */
export function escolherArquivo(modo, pid, origem) {
  const entrada = document.createElement('input');
  entrada.type = 'file';
  entrada.accept = '.json,application/json';
  entrada.addEventListener('change', () => {
    const arquivo = entrada.files?.[0];
    if (arquivo) lerEPlanejar(arquivo, modo, pid, origem);
  });
  entrada.click();
}

function lerEPlanejar(arquivo, modo, pid, origem) {
  const abrir = (dados) => abrirDialogo({ modo, pid, abridor: origem, nomeArquivo: arquivo.name, ...dados });
  if (arquivo.size > TAMANHO_MAXIMO) {
    abrir({ fase: 'erro', erro: `O arquivo tem mais de ${TAMANHO_MAXIMO / 1024 / 1024} MB.` });
    return;
  }
  arquivo.text().then((texto) => {
    const lido = lerArquivo(texto, hoje());
    if (!lido.ok) { abrir({ fase: 'erro', erro: lido.erro }); return; }
    const novoId = () => crypto.randomUUID();
    let plano;
    if (modo === 'novos') {
      plano = planejarNovos(lido.processos, { existentes: processosAtivos(estado.processos), novoId });
    } else {
      const doc = procPorId(pid);
      if (!doc || !ativoPorId(pid)) { abrir({ fase: 'erro', erro: 'Este processo foi excluído.' }); return; }
      plano = planejarAcrescimo(lido.processos, { doc, novoId });
    }
    if (!plano.ok) { abrir({ fase: 'erro', erro: plano.erro }); return; }
    abrir({ fase: 'previa', plano });
  }).catch(() => abrir({ fase: 'erro', erro: 'Não foi possível ler o arquivo.' }));
}

// ----- Diálogo -----

function dialogo() {
  return document.getElementById('dlg-importar');
}

export function configurarImportacao() {
  const dlg = dialogo();
  dlg.addEventListener('cancel', (e) => {
    if (sessao?.fase === 'gravando') e.preventDefault();
  });
  // Sem conexão, as gravações ficam na fila do SDK e seguem quando a internet voltar: o diálogo diz isso em vez de parecer travado.
  const aoMudarConexao = () => { if (sessao?.fase === 'gravando') desenhar(); };
  window.addEventListener('offline', aoMudarConexao);
  window.addEventListener('online', aoMudarConexao);
  dlg.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-imp]');
    if (!alvo) return;
    if (alvo.dataset.imp === 'confirmar') gravar();
    else if (alvo.dataset.imp === 'fechar') dlg.close();
  });
  dlg.addEventListener('close', () => {
    const abridor = sessao?.abridor;
    sessao = null;
    limpar(dlg);
    if (abridor && document.contains(abridor)) abridor.focus();
  });
}

function abrirDialogo(dados) {
  sessao = { feitas: 0, ...dados };
  desenhar();
  const dlg = dialogo();
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('[data-imp="confirmar"], [data-imp="fechar"]')?.focus();
}

function partesDoTotal(t) {
  return [
    t.processos ? plural(t.processos, 'processo novo', 'processos novos') : null,
    t.melhorias ? plural(t.melhorias, 'melhoria', 'melhorias') : null,
    t.acoes ? plural(t.acoes, 'ação', 'ações') : null,
    t.indicadores ? plural(t.indicadores, 'indicador', 'indicadores') : null,
    t.medicoes ? plural(t.medicoes, 'medição', 'medições') : null,
    t.pessoas ? plural(t.pessoas, 'campo vazio de dono ou embaixador será preenchido', 'campos vazios de dono ou embaixador serão preenchidos') : null,
  ].filter(Boolean);
}

function desenhar() {
  const dlg = dialogo();
  const s = sessao;
  limpar(dlg);
  const destino = s.modo === 'novos' ? 'Importar JSON' : `Importar para «${ativoPorId(s.pid)?.nome ?? 'este processo'}»`;
  const corpo = [];
  const botoes = [];
  if (s.fase === 'erro') {
    corpo.push(h('div', { class: 'aviso-campo erro', role: 'alert' }, h('p', null, 'Nada foi gravado.'), h('p', null, s.erro)));
    botoes.push(h('button', { type: 'button', class: 'btn prim', 'data-imp': 'fechar' }, 'Fechar'));
  } else if (s.fase === 'previa') {
    const p = s.plano;
    const partes = partesDoTotal(p.total);
    corpo.push(h('p', { class: 'small suave' }, `Arquivo: ${s.nomeArquivo}`));
    if (s.modo === 'acrescimo' && p.nomeNoArquivo && p.nomeNoArquivo !== ativoPorId(s.pid)?.nome) {
      corpo.push(h('div', { class: 'aviso-campo info' }, h('p', null, `O arquivo é do processo «${p.nomeNoArquivo}». O conteúdo será acrescentado a este processo.`)));
    }
    corpo.push(partes.length
      ? h('div', null, h('p', null, h('strong', null, 'Serão criados:')), h('ul', null, ...partes.map((x) => h('li', null, x))))
      : h('p', null, h('strong', null, 'Nada a importar: tudo o que está no arquivo já existe no painel.')));
    if (p.avisos.length) {
      corpo.push(h('div', { class: 'aviso-campo alerta' }, ...p.avisos.map((x) => h('p', null, x))));
    }
    if (p.ignorados.length) {
      corpo.push(h('details', { class: 'ignorados' },
        h('summary', null, `${plural(p.ignorados.length, 'item será ignorado', 'itens serão ignorados')} (já existem ou não cabem)`),
        h('ul', null, ...p.ignorados.map((x) => h('li', null, x)))));
    }
    if (partes.length) {
      corpo.push(h('p', { class: 'ajuda' },
        `São ${plural(p.gravacoes, 'gravação', 'gravações')}, uma de cada vez. `,
        'A importação só acrescenta: nada do que já existe é alterado ou apagado. ',
        'As datas de registro e de alteração ficam com a data de hoje, e os processos alterados contam como "plano atualizado".'));
      botoes.push(h('button', { type: 'button', class: 'btn prim', 'data-imp': 'confirmar' }, 'Importar'));
    }
    botoes.push(h('button', { type: 'button', class: 'btn fant', 'data-imp': 'fechar' }, partes.length ? 'Cancelar' : 'Fechar'));
  } else if (s.fase === 'gravando') {
    corpo.push(h('p', null, `Gravando ${s.feitas} de ${s.total}… Não feche esta aba.`),
      h('progress', { max: String(s.total), value: String(s.feitas), 'aria-label': 'Progresso da importação' }, `${s.feitas} de ${s.total}`),
      estaOffline()
        ? h('div', { class: 'aviso-campo alerta' }, h('p', null, 'Sem conexão. A gravação continua quando a internet voltar. Não feche a aba.'))
        : null);
  } else if (s.fase === 'fim') {
    if (s.erro) {
      corpo.push(h('div', { class: 'aviso-campo erro', role: 'alert' },
        h('p', null, `Importação interrompida: ${s.feitas} de ${s.total} gravações feitas.`),
        h('p', null, s.erro),
        h('p', null, s.modo === 'novos'
          ? 'O que já foi gravado ficou no painel. Importe o mesmo arquivo de novo para criar os processos que faltam. Para completar um processo que ficou pela metade, abra o card dele e use "Importar para este processo" com o mesmo arquivo.'
          : 'O que já foi gravado ficou no painel. Para completar, importe o mesmo arquivo de novo: o que já existe é ignorado.')));
    } else {
      corpo.push(h('div', { class: 'aviso-campo info', role: 'status' }, h('p', null, `Importação concluída: ${partesDoTotal(s.plano.total).join(', ')}.`)));
    }
    botoes.push(h('button', { type: 'button', class: 'btn prim', 'data-imp': 'fechar' }, 'Fechar'));
  }
  dlg.append(
    h('h2', { id: 'importar-titulo', tabindex: '-1' }, destino),
    h('p', { class: 'small' }, AVISO, '.'),
    ...corpo,
    botoes.length ? h('div', { class: 'botoes' }, ...botoes) : null);
}

// ----- Gravação -----

function acompanhar(promessa) {
  const id = `importacao-${Date.now()}-${Math.random()}`;
  estado.pendencias.set(id, 'importação');
  const fim = () => { estado.pendencias.delete(id); };
  promessa.then(fim, fim);
  return promessa;
}

async function gravar() {
  const s = sessao;
  if (!s || s.fase !== 'previa') return;
  if (estaOffline()) {
    s.fase = 'erro';
    s.erro = 'Sem conexão. A importação precisa de internet do começo ao fim.';
    desenhar();
    return;
  }
  const p = s.plano;
  s.fase = 'gravando';
  s.total = totalDeGravacoes(p);
  desenhar();
  dialogo().querySelector('#importar-titulo')?.focus();
  anunciar(`Importação iniciada: ${plural(s.total, 'gravação', 'gravações')}.`);
  const passo = () => { s.feitas += 1; if (sessao === s) desenhar(); };
  const dados = estado.dados;
  const ids = new Map();
  try {
    if (s.modo === 'novos') {
      for (const novo of p.novos) {
        const { id, promessa } = dados.criarProcesso(novo.nome, { dono: novo.dono, embaixador: novo.embaixador });
        estado.criadosPorMim.add(id);
        await acompanhar(promessa);
        ids.set(novo.ref, id);
        passo();
        for (const op of p.ops.filter((o) => o.ref === novo.ref)) {
          await acompanhar(dados.criarItem(id, op.alvo, op.dados));
          passo();
        }
      }
    } else {
      for (const pessoa of p.pessoas) {
        // Confere de novo: se alguém preencheu o campo depois da prévia, não sobrescreve.
        if (!procPorId(s.pid)?.[pessoa.campo]) await acompanhar(dados.alterarCampoProcesso(s.pid, pessoa.campo, pessoa.valor));
        passo();
      }
      for (const op of p.ops) {
        await acompanhar(dados.criarItem(s.pid, op.alvo, op.dados));
        passo();
      }
    }
  } catch (e) {
    s.erro = mensagemDeErro(classificarErro(e));
  }
  s.fase = 'fim';
  if (sessao === s) desenhar();
  anunciar(s.erro ? 'Importação interrompida.' : 'Importação concluída.');
  dialogo().querySelector('[data-imp="fechar"]')?.focus();
  atualizar();
}
