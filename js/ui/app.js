// Composição da interface: roteamento, desenho (reconciliação), recebimento dos dados e estados de tela.
import { h, plural, idSeguro } from './dom.js';
import {
  estado, atualizar, definirDesenho, listaAtiva, filtrarPorBusca, filtrarPorEstado, contarComAcao, hoje, procPorId, estaOffline, chaveAberto,
} from './estado.js';
import { sanfona } from './compartilhado.js';
import { reconciliar } from './reconciliar.js';
import { processosAtivos, excluidosRecentes, ativos } from '../dominio/lixeira.js';
import { calcularRetrato } from '../dominio/metricas.js';
import { reagirAtualizacaoRemota } from '../dominio/conflito.js';
import { horaSaoPaulo } from '../dominio/periodos.js';
import { classificarErro } from '../dominio/erros.js';
import { mapaDeCampos, lerChave } from './campos.js';
import { telaInstrucoes } from './instrucoes.js';
import { resumoDoPlano, resumoDosIndicadores } from './resumo.js';
import { cardPlano } from './plano.js';
import { cardIndicadores } from './indicadores.js';
import { visaoDeImpressao, prepararRodapeDePagina } from './impressao.js';
import {
  faixaDeTeste, faixaDeConexao, faixaDeErro, indicadorDeConexao, notaDoMenu, barraDeDesfazer,
} from './avisos.js';
import { instalarEventos, avaliarReconexao, aoFecharDialogoExclusao, estadoDosBotoesDaLixeira } from './acoes.js';
import { configurarDialogos, desenharLixeira, lixeiraAberta } from './dialogos.js';
import { configurarImportacao } from './intercambio.js';

const TELAS = ['instrucoes', 'plano', 'indicadores', 'imprimir'];
const TITULOS = { instrucoes: 'Instruções', plano: 'Plano de implantação', indicadores: 'Indicadores', imprimir: 'Impressão' };
const FRASES = {
  instrucoes: 'Como usar o painel e como preencher a ficha dos indicadores.',
  plano: 'Ações de cada processo, com responsável, prazo e status.',
  indicadores: 'Ficha, medições e situação em relação à meta de cada processo.',
};

function hora() {
  return horaSaoPaulo(new Date());
}

// ----- Rota -----

export function lerRota() {
  const partes = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const tela = TELAS.includes(partes[0]) ? partes[0] : 'plano';
  if (tela === 'imprimir') return { tela, alvo: ['plano', 'indicadores', 'ambos'].includes(partes[1]) ? partes[1] : 'plano', id: partes[2] ?? null, ancora: null };
  if (tela === 'instrucoes') return { tela, id: null, ancora: partes[1] ?? null };
  return { tela, id: partes[1] ?? null, ancora: null };
}

let rotaAnterior = null;

function aoMudarRota() {
  const nova = lerRota();
  const mudouTela = !rotaAnterior || rotaAnterior.tela !== nova.tela || rotaAnterior.id !== nova.id || rotaAnterior.ancora !== nova.ancora;
  if (!mudouTela) return;
  const anterior = rotaAnterior;
  rotaAnterior = nova;
  estado.rota = nova;
  // Só fecha o menu ao trocar de tela. Na primeira rota (carga do app, assíncrona) ele pode já ter sido aberto pela
  // pessoa; fechá-lo ali era a causa do teste instável do QA-03.
  if (anterior) fecharMenuCompacto();
  if (nova.tela === 'instrucoes' && nova.ancora) {
    estado.focoPendente = { seletor: `#inst-t-${idSeguro(nova.ancora)}`, ate: Date.now() + 2000, rolar: true };
  } else if ((nova.tela === 'plano' || nova.tela === 'indicadores') && nova.id) {
    estado.abertos.add(chaveAberto(nova.tela, nova.id));
    estado.focoPendente = { seletor: `#card-${nova.tela}-${idSeguro(nova.id)} .btn-expandir`, ate: Date.now() + 3000, rolar: true };
  } else if (nova.tela === 'imprimir') {
    // Trocar o conteúdo da impressão (mesmo processo) mantém o foco na escolha.
    if (!(anterior?.tela === 'imprimir' && anterior.id === nova.id)) estado.focoPendente = { seletor: '#titulo-impressao', ate: Date.now() + 3000 };
  } else if (!anterior || anterior.tela !== nova.tela) {
    estado.focoPendente = { seletor: '#h1-tela', ate: Date.now() + 2000 };
  }
  window.scrollTo(0, 0);
  atualizar();
}

function fecharMenuCompacto() {
  const botao = document.getElementById('btn-menu');
  const lista = document.getElementById('menu-lista');
  if (botao && lista && botao.getAttribute('aria-expanded') === 'true') {
    botao.setAttribute('aria-expanded', 'false');
    lista.hidden = true;
  }
}

// ----- Estados de tela -----

function esqueletos() {
  return h('div', { 'data-k': 'carregando', 'aria-busy': 'true' },
    h('p', { role: 'status', class: 'carregando' }, 'Carregando dados…',
      estado.carregandoLento ? ' Está demorando mais que o normal.' : ''),
    estado.carregandoLento ? h('button', { type: 'button', class: 'btn prim', 'data-acao': 'recarregar' }, 'Tentar de novo') : null,
    h('div', { class: 'esqueleto' }), h('div', { class: 'esqueleto' }), h('div', { class: 'esqueleto' }));
}

function blocoDeErro() {
  const semConexao = estado.erroLeitura === 'sem_conexao';
  const limite = estado.erroLeitura === 'limite';
  return h('div', { class: 'faixa erro bloco-erro', role: 'alert', 'data-k': 'erro-leitura' },
    h('div', null,
      h('h2', null, 'Não foi possível carregar os dados'),
      h('p', null, limite ? 'O limite diário do serviço foi atingido. Tente de novo mais tarde.' : semConexao ? 'Sem conexão. Verifique a internet e tente de novo.' : 'Verifique a conexão e tente de novo.'),
      h('button', { type: 'button', class: 'btn prim', 'data-acao': 'recarregar' }, 'Tentar de novo')));
}

function estadoVazio() {
  return h('div', { class: 'vazio', 'data-k': 'vazio' },
    h('h2', null, 'Nenhum processo cadastrado'),
    h('p', null, 'Adicione o primeiro processo para montar o plano e os indicadores.'),
    h('button', { type: 'button', class: 'btn prim', 'data-acao': 'processo-novo-abrir' }, 'Adicionar processo'));
}

function formNovoProcesso() {
  const f = estado.formProcesso;
  return h('div', { class: 'form-novo cartao', role: 'group', 'aria-label': 'Adicionar processo', 'data-k': 'form-processo' },
    h('div', { class: 'campo' },
      h('label', { for: 'novo-processo' }, 'Nome do processo'),
      h('input', { id: 'novo-processo', type: 'text', autocomplete: 'off', 'aria-invalid': f.erro ? 'true' : null, 'aria-describedby': f.erro ? 'novo-processo-erro' : null }),
      f.erro ? h('div', { class: 'estado erro', id: 'novo-processo-erro', role: 'alert' }, `✕ ${f.erro}`) : null),
    h('div', { class: 'botoes' },
      h('button', { type: 'button', class: 'btn prim', 'data-acao': 'processo-novo-confirmar' }, 'Adicionar'),
      h('button', { type: 'button', class: 'btn fant', 'data-acao': 'processo-novo-cancelar' }, 'Cancelar')));
}

const TEXTO_FILTRO = { atrasadas: 'ação atrasada', travadas: 'ação travada' };

/** Linha do título (redesign, 2.1): título + conexão à esquerda; Adicionar processo, Mais ações e Excluídos recentes à direita. */
function linhaDoTitulo(tela, pronto) {
  const recentes = excluidosRecentes(estado.processos, Date.now()).length;
  return h('div', { class: 'cab-tela', 'data-k': `ct-${tela}` },
    h('div', { class: 'titulo' }, h('h1', { id: 'h1-tela', tabindex: '-1' }, TITULOS[tela]), indicadorDeConexao()),
    pronto
      ? h('div', { class: 'acoes-tela', 'data-k': 'acoes-tela' },
        estado.formProcesso
          ? null
          : h('button', { type: 'button', class: 'btn prim', 'data-acao': 'processo-novo-abrir' }, 'Adicionar processo'),
        sanfona('mais-tela', 'mais', false, ['Mais ações'],
          h('div', { class: 'painel-mais' },
            h('button', { type: 'button', class: 'btn', 'data-acao': 'expandir-todos' }, 'Expandir todos'),
            h('button', { type: 'button', class: 'btn', 'data-acao': 'recolher-todos' }, 'Recolher todos'),
            h('button', { type: 'button', class: 'btn', 'data-acao': 'exportar-todos' }, 'Exportar todos (JSON)'),
            h('button', { type: 'button', class: 'btn', 'data-acao': 'importar-novos' }, 'Importar JSON'))),
        recentes ? h('button', { type: 'button', class: 'btn-link', 'data-acao': 'abrir-lixeira' }, `Excluídos recentes (${recentes})`) : null)
      : null);
}

/** Busca e, no Plano, o filtro "Atrasadas / Travadas" (D1 do Gate B). Estado só em memória. */
function barraDeBusca(tela, mostrados, total) {
  const chip = (valor, rotulo) => h('button', {
    type: 'button', class: 'chip', 'data-acao': 'filtrar', 'data-filtro': valor, 'aria-pressed': estado.filtro === valor ? 'true' : 'false',
  }, rotulo);
  const comFiltro = tela === 'plano' && estado.filtro !== 'todos';
  return h('div', { class: 'barra-filtro', 'data-k': 'barra-filtro' },
    h('div', { class: 'campo busca' },
      h('label', { for: 'busca' }, 'Buscar processo'),
      h('input', { id: 'busca', type: 'search', value: estado.busca, 'data-controlado': true, autocomplete: 'off' })),
    tela === 'plano'
      ? h('div', { class: 'filtro', role: 'group', 'aria-label': 'Filtrar processos' },
        h('span', { class: 'rot-inline' }, 'Mostrar:'),
        chip('todos', 'Todos'),
        chip('atrasadas', `Atrasadas (${contarComAcao('atrasadas')})`),
        chip('travadas', `Travadas (${contarComAcao('travadas')})`))
      : null,
    tela === 'plano'
      ? h('p', { class: 'estado-filtro', role: 'status' },
        comFiltro ? `Mostrando ${mostrados} de ${total} processos com ${TEXTO_FILTRO[estado.filtro]}.` : '',
        comFiltro ? [' ', h('button', { type: 'button', class: 'btn-link', 'data-acao': 'filtrar', 'data-filtro': 'todos' }, 'Limpar filtro')] : null)
      : null);
}

function avisoDeExclusaoRemota(id, info) {
  return h('article', { class: 'card aviso-excluido', 'data-k': `excl-${id}` },
    h('div', { class: 'aviso-campo info', role: 'status' },
      h('p', null, `O processo «${info.nome}» foi excluído por outra pessoa.`),
      info.textoNaoGravado ? h('p', null, `Seu texto não gravado: «${info.textoNaoGravado}»`) : null,
      h('div', { class: 'botoes' },
        h('button', { type: 'button', class: 'btn fant', 'data-acao': 'reabrir-aviso', 'data-id': id }, 'Desfazer'),
        h('button', { type: 'button', class: 'btn fant', 'data-acao': 'dispensar-aviso', 'data-id': id }, 'Dispensar'))));
}

function telaDeProcessos(tela) {
  const filhos = [];
  filhos.push(faixaDeTeste(), faixaDeConexao(), faixaDeErro());
  const pronto = !estado.carregando && !estado.erroLeitura;
  filhos.push(linhaDoTitulo(tela, pronto));
  if (pronto && estado.formProcesso) filhos.push(formNovoProcesso());

  const todos = processosAtivos(estado.processos);
  const buscados = filtrarPorBusca(listaAtiva());
  const lista = tela === 'plano' ? filtrarPorEstado(buscados) : buscados;
  const comFiltro = tela === 'plano' && estado.filtro !== 'todos';
  if (pronto) filhos.push(barraDeBusca(tela, lista.length, todos.length));
  if (estado.carregando) {
    filhos.push(h('section', { 'data-k': 'resumo-carregando' }, h('h2', { class: 'sr' }, 'Resumo'), h('p', { class: 'ajuda' }, 'Carregando…')));
  } else if (estado.erroLeitura) {
    filhos.push(blocoDeErro());
  } else if (!todos.length) {
    filhos.push(h('section', { 'data-k': 'resumo-vazio' }, h('h2', { class: 'sr' }, 'Resumo'), h('p', { class: 'ajuda' }, 'Sem dados para resumir.')));
  } else {
    filhos.push(tela === 'plano' ? resumoDoPlano(todos, hoje()) : resumoDosIndicadores(todos, hoje()));
  }

  let corpoLista;
  if (estado.carregando) corpoLista = [esqueletos()];
  else if (estado.erroLeitura) corpoLista = [];
  else if (!todos.length && !estado.avisosExclusao.size) corpoLista = [estadoVazio()];
  else if (!lista.length && (estado.busca || comFiltro)) {
    corpoLista = [h('div', { class: 'vazio', 'data-k': 'busca-vazia' },
      comFiltro
        ? h('p', null, `Nenhum processo com ${TEXTO_FILTRO[estado.filtro]}${estado.busca ? ` para a busca «${estado.busca}»` : ''}.`)
        : h('p', null, `Nenhum processo encontrado para «${estado.busca}».`),
      h('div', { class: 'botoes' },
        comFiltro ? h('button', { type: 'button', class: 'btn fant', 'data-acao': 'filtrar', 'data-filtro': 'todos' }, 'Limpar filtro') : null,
        estado.busca ? h('button', { type: 'button', class: 'btn fant', 'data-acao': 'limpar-busca' }, 'Limpar busca') : null))];
  } else {
    corpoLista = [
      ...[...estado.avisosExclusao.entries()].map(([id, info]) => avisoDeExclusaoRemota(id, info)),
      ...lista.map((p) => (tela === 'plano' ? cardPlano(p) : cardIndicadores(p))),
    ];
  }
  filhos.push(h('section', { 'aria-labelledby': 'tit-lista', 'data-k': 'lista', class: 'lista-processos' },
    h('h2', { id: 'tit-lista', class: 'sr', tabindex: '-1' }, 'Processos'),
    ...corpoLista));
  return filhos;
}

function construirTela() {
  const rota = estado.rota;
  const raiz = h('div', null);
  if (rota.tela === 'instrucoes') {
    raiz.append(
      h('div', { class: 'cabecalho-tela', 'data-k': 'ct-instrucoes' }, h('h1', { id: 'h1-tela', tabindex: '-1' }, TITULOS.instrucoes), h('p', { class: 'frase-tela' }, FRASES.instrucoes)),
      faixaDeTeste() ?? document.createComment(''),
      telaInstrucoes());
  } else if (rota.tela === 'imprimir') {
    if (estado.carregando) raiz.append(h('p', { role: 'status', 'data-k': 'prep' }, 'Preparando a impressão…'));
    else if (estado.erroLeitura) raiz.append(blocoDeErro());
    else raiz.append(visaoDeImpressao(rota.alvo, rota.id, estado.origemImpressao ?? undefined));
  } else {
    for (const f of telaDeProcessos(rota.tela)) if (f) raiz.append(f);
  }
  return raiz;
}

// ----- Desenho -----

let ultimoAnuncio = '';
let alternador = false;

function desenhar() {
  const rota = lerRota();
  estado.rota = rota;
  document.body.dataset.modo = rota.tela === 'imprimir' ? 'impressao' : 'normal';
  document.title = `${TITULOS[rota.tela]} · Plano de implantação e indicadores`;
  for (const a of document.querySelectorAll('#menu-lista a[data-rota]')) {
    if (a.dataset.rota === rota.tela) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  reconciliar(document.getElementById('tela'), construirTela());
  reconciliar(document.getElementById('barra-desfazer'), h('div', null, ...barraDeDesfazer()));
  ajustarReservaDaBarra();
  document.getElementById('nota-conexao').textContent = notaDoMenu();
  if (estado.anuncio !== ultimoAnuncio) {
    ultimoAnuncio = estado.anuncio;
    alternador = !alternador;
    document.getElementById('anuncio').textContent = estado.anuncio + (alternador ? '' : ' ');
  }
  if (lixeiraAberta()) desenharLixeira(excluidosRecentes(estado.processos, Date.now()), estadoDosBotoesDaLixeira());
  if (rota.tela === 'imprimir') {
    const a = rota.id ? ativos(procPorId(rota.id)) : null;
    if (a) prepararRodapeDePagina(a.nome);
  }
  aplicarFocoPendente();
}

/**
 * A barra de desfazer é fixa no rodapé. Reserva o espaço dela na rolagem (`scroll-padding-bottom` em `html`) para que o
 * elemento focado nunca fique atrás dela (WCAG 2.4.11). A altura muda com o conteúdo e com a largura da janela.
 */
function ajustarReservaDaBarra() {
  const area = document.getElementById('barra-desfazer');
  const temBarra = area.querySelector('.barra') !== null;
  const altura = temBarra ? Math.ceil(area.getBoundingClientRect().height + (parseFloat(getComputedStyle(area).bottom) || 0)) + 8 : 0;
  document.documentElement.style.setProperty('--altura-barra', `${altura}px`);
}

function aplicarFocoPendente() {
  const f = estado.focoPendente;
  if (!f) return;
  if (Date.now() > f.ate) { estado.focoPendente = null; return; }
  let el = null;
  try {
    el = document.querySelector(f.seletor);
  } catch {
    estado.focoPendente = null;
    return;
  }
  if (!el || el.disabled) return;
  estado.focoPendente = null;
  el.focus({ preventScroll: !f.rolar });
  if (f.rolar || !el.closest('.card')) el.scrollIntoView({ block: 'nearest' });
}

// ----- Recebimento dos dados -----

function processarMudancas(anteriores, novos, primeiraCarga) {
  const mapaAnt = new Map(anteriores.map((p) => [p.id, p]));
  const novaMapa = new Map();
  const adicionados = [];
  for (const p of novos) {
    const ant = mapaAnt.get(p.id);
    // Novo processo criado por outra pessoa
    if (!primeiraCarga && !ant && !p.excluido && !estado.criadosPorMim.has(p.id) && !estado.idsConhecidos.has(p.id)) {
      estado.novos.set(p.id, Date.now());
      adicionados.push(p.nome ?? '');
      setTimeout(() => { estado.novos.delete(p.id); atualizar(); }, 10000);
    }
    estado.idsConhecidos.add(p.id);
    // Exclusão ou restauração
    if (ant && !ant.excluido && p.excluido && !estado.minhasExclusoes.has(p.id)) {
      const foco = document.activeElement;
      const doCard = foco?.closest?.(`[data-processo="${p.id}"]`);
      estado.avisosExclusao.set(p.id, { nome: p.nome, textoNaoGravado: doCard && foco.dataset?.chave ? foco.value : null });
    }
    if (ant && ant.excluido && !p.excluido) {
      estado.avisosExclusao.delete(p.id);
      estado.minhasExclusoes.delete(p.id);
      estado.desfazer = estado.desfazer.filter((d) => d.processoId !== p.id || d.alvo);
    }
    const mapa = mapaDeCampos(p);
    novaMapa.set(p.id, mapa);
  }
  for (const [id] of estado.avisosExclusao) if (!novos.some((p) => p.id === id)) estado.avisosExclusao.delete(id);

  // Campos alterados por outras pessoas
  const novosValores = new Map();
  for (const mapa of novaMapa.values()) for (const [k, v] of mapa) novosValores.set(k, v);
  if (!primeiraCarga) {
    for (const [chave, texto] of novosValores) {
      if (!estado.valoresAnteriores.has(chave)) continue;
      const anterior = estado.valoresAnteriores.get(chave);
      if (anterior === texto) continue;
      const minha = estado.minhasGravacoes.get(chave);
      const eco = Boolean(minha) && minha.texto === texto;
      const el = document.activeElement;
      const emEdicao = Boolean(el?.dataset?.chave === chave);
      const reacao = reagirAtualizacaoRemota({ anterior, atual: texto, emEdicao, ehEcoMeu: eco });
      const atualEstado = estado.campos.get(chave);
      if (reacao === 'aviso_durante_edicao') {
        if (el.value === (el.dataset.localBase ?? anterior)) {
          el.dataset.localBase = texto;
          el.value = texto;
        } else {
          estado.campos.set(chave, { tipo: 'editando_remoto', remoto: texto });
          estado.anuncio = `Outra pessoa alterou este campo para «${texto}». O seu texto não foi apagado.`;
        }
      } else if (reacao === 'alterado_por_outra_pessoa') {
        if (atualEstado && ['gravando', 'nao_gravado', 'conflito', 'recusado'].includes(atualEstado.tipo)) continue;
        estado.campos.set(chave, { tipo: 'alterado', anterior, atual: texto, minha: Boolean(minha?.aceito), hora: hora() });
        estado.anuncio = `Alterado por outra pessoa às ${hora()}.`;
      }
    }
  }
  estado.valoresAnteriores = novosValores;
  // Aviso discreto, só para leitores de tela (região aria-live): não move foco, texto nem rolagem (QA-04).
  if (adicionados.length === 1) estado.anuncio = `Processo «${adicionados[0]}» adicionado por outra pessoa`;
  else if (adicionados.length > 1) estado.anuncio = `${adicionados.length} processos adicionados por outra pessoa`;
}

function aoReceber(snap) {
  const primeiraCarga = !estado.recebeuServidor;
  const noServidor = !snap.doCache;
  if (!noServidor && !estado.recebeuServidor) {
    // primeira resposta do servidor
  } else if (snap.doCache && !estado.recebeuServidor) {
    if (estado.navegadorOffline) {
      estado.carregando = false;
      estado.erroLeitura = 'sem_conexao';
      atualizar();
    }
    return;
  }
  const estavaOffline = estaOffline();
  estado.doCache = snap.doCache;
  const ficouOffline = estaOffline();
  if (ficouOffline && !estavaOffline) {
    estado.desdeOffline = hora();
    estado.resultadoReconexao = null;
  }
  if (!ficouOffline && estavaOffline) {
    estado.reconectando = estado.pendencias.size > 0;
  }
  if (noServidor) {
    estado.recebeuServidor = true;
    estado.carregando = false;
    estado.erroLeitura = null;
    estado.ultimaSincronizacao = hora();
  }
  processarMudancas(estado.processos, snap.processos, primeiraCarga);
  estado.processos = snap.processos;
  if (primeiraCarga && noServidor) aposPrimeiraCarga();
  avaliarReconexao();
  atualizar();
}

function aposPrimeiraCarga() {
  estado.dados.purgarVencidos(Date.now()).catch(() => {});
  estado.dados.atualizarRetratoDoDia(() => calcularRetrato(processosAtivos(estado.processos), hoje())).catch(() => {});
}

let cancelarAssinatura = null;

function assinar() {
  cancelarAssinatura?.();
  cancelarAssinatura = estado.dados.assinarProcessos(aoReceber, (erro, tipo) => {
    estado.carregando = false;
    estado.erroLeitura = tipo ?? classificarErro(erro);
    atualizar();
  });
}

// ----- Início -----

function configurarLogos() {
  const trocar = (img) => {
    if (img.dataset.substituida) return;
    img.dataset.substituida = '1';
    const subst = h('span', { class: `logo-subst ${img.classList.contains('dir') ? 'dir' : 'esq'}`, role: 'img', 'aria-label': img.getAttribute('alt') ?? 'Logo' }, img.getAttribute('alt') ?? 'Logo');
    img.replaceWith(subst);
  };
  document.addEventListener('error', (e) => {
    if (e.target?.tagName === 'IMG' && e.target.classList.contains('logo-img')) trocar(e.target);
  }, true);
  for (const img of document.querySelectorAll('img.logo-img')) {
    if (img.complete && img.naturalWidth === 0) trocar(img);
  }
}

export function iniciarApp(dados, info) {
  estado.dados = dados;
  estado.ambienteTeste = Boolean(info?.emulador) || /-teste$/.test(info?.projeto ?? '');
  estado.navegadorOffline = !navigator.onLine;
  if (estado.navegadorOffline) {
    estado.desdeOffline = hora();
    estado.carregando = false;
    estado.erroLeitura = 'sem_conexao';
  }
  estado.aoRecarregar = () => {
    estado.carregando = true;
    estado.erroLeitura = null;
    estado.carregandoLento = false;
    assinar();
    atualizar();
  };
  definirDesenho(desenhar);
  instalarEventos();
  configurarLogos();
  configurarDialogos({ aoFecharExclusao: aoFecharDialogoExclusao });
  configurarImportacao();
  window.addEventListener('hashchange', aoMudarRota);
  window.addEventListener('offline', () => {
    estado.navegadorOffline = true;
    estado.desdeOffline = hora();
    estado.resultadoReconexao = null;
    estado.reconectando = false;
    atualizar();
  });
  window.addEventListener('online', () => {
    estado.navegadorOffline = false;
    if (estado.pendencias.size > 0) estado.reconectando = true;
    if (estado.erroLeitura === 'sem_conexao' && !estado.recebeuServidor) estado.aoRecarregar();
    atualizar();
  });
  window.matchMedia('(max-width: 859px)').addEventListener('change', () => atualizar());
  window.addEventListener('resize', ajustarReservaDaBarra);
  setTimeout(() => { if (estado.carregando) { estado.carregandoLento = true; atualizar(); } }, 10000);
  rotaAnterior = null;
  aoMudarRota();
  assinar();
  atualizar();
}

