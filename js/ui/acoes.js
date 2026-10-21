// Eventos (por delegação) e operações do usuário: edição por campo, adicionar, excluir, desfazer, medições.
import {
  estado, atualizar, hoje, procPorId, ativoPorId, listaAtiva, outrosNomesDeProcesso, anunciar, chaveAberto,
  filtrarPorBusca, filtrarPorEstado, processoTem,
} from './estado.js';
import {
  lerChave, montarChave, textoArmazenado, definicao,
} from './campos.js';
import {
  CAMPOS, validarCampo, textoDoValor, validarMedicao, podeAdicionar, normalizarNome,
} from '../dominio/validacao.js';
import { decidirSaida } from '../dominio/conflito.js';
import { classificarErro, mensagemDeErro } from '../dominio/erros.js';
import { ocupacao, PRAZO_DESFAZER_DIAS, excluidosRecentes } from '../dominio/lixeira.js';
import { horaSaoPaulo } from '../dominio/periodos.js';
import { calcularValor, analisarNumero, formatarNumero } from '../dominio/calculos.js';
import { abrirDialogoExcluir, abrirLixeira } from './dialogos.js';
import { exportarTodos, exportarProcesso, escolherArquivo } from './intercambio.js';

const MS_DIA = 86400000;

function hora() {
  return horaSaoPaulo(new Date());
}

function novoLote() {
  return `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function focar(seletor, ms = 3000) {
  estado.focoPendente = { seletor, ate: Date.now() + ms };
  atualizar();
}

function erroGlobal(mensagem) {
  estado.erroGlobal = mensagem;
  atualizar();
}

function mensagemPorErro(e) {
  return mensagemDeErro(classificarErro(e));
}

// ----- Gravações em curso -----

let contadorGravacao = 0;

function acompanhar(rotulo, promessa) {
  contadorGravacao += 1;
  const id = contadorGravacao;
  estado.pendencias.set(id, rotulo);
  atualizar();
  const terminar = () => {
    estado.pendencias.delete(id);
    avaliarReconexao();
    atualizar();
  };
  promessa.then(terminar, terminar);
  return promessa;
}

export function avaliarReconexao() {
  if (!estado.reconectando) return;
  if (estado.pendencias.size > 0) return;
  estado.reconectando = false;
  let naoGravados = 0;
  for (const e of estado.campos.values()) if (e.tipo === 'nao_gravado') naoGravados += 1;
  if (naoGravados === 0) {
    estado.resultadoReconexao = { tipo: 'ok' };
    anunciar('Todas as alterações foram gravadas.');
    setTimeout(() => { estado.resultadoReconexao = null; atualizar(); }, 6000);
  }
}

// ----- Edição por campo -----

function contextoDeValidacao(chave) {
  const { pid, entidade, itemId } = lerChave(chave);
  const ctx = { hoje: hoje() };
  const a = ativoPorId(pid);
  if (entidade === 'processo') ctx.outrosNomes = outrosNomesDeProcesso(pid);
  if (entidade === 'melhoria' && a) ctx.outrosNomes = a.melhorias.filter((m) => m.id !== itemId).map((m) => m.nome);
  if (entidade === 'indicador' && a) ctx.medicoesAtivas = a.indicadores.find((i) => i.id === itemId)?.medicoes.length ?? 0;
  return ctx;
}

function escreverCampo(chave, valor) {
  const { pid, entidade, itemId, campo } = lerChave(chave);
  const dados = estado.dados;
  if (entidade === 'processo') return dados.alterarCampoProcesso(pid, campo, valor);
  return dados.alterarCampoItem(pid, { tipo: entidade, id: itemId, periodo: null }, campo, valor);
}

function gravarValidado(chave, digitado, valor, rotulo) {
  const def = definicao(chave);
  const novoTexto = textoDoValor(def, valor);
  estado.campos.set(chave, { tipo: 'gravando', texto: digitado });
  estado.minhasGravacoes.set(chave, { texto: novoTexto, aceito: false });
  let promessa;
  try {
    promessa = escreverCampo(chave, valor);
  } catch (erro) {
    promessa = Promise.reject(erro);
  }
  acompanhar(rotulo ?? chave, promessa).then(() => {
    const m = estado.minhasGravacoes.get(chave);
    if (m) m.aceito = true;
    const atual = estado.campos.get(chave);
    if (atual && atual.tipo === 'gravando') {
      const marca = { tipo: 'gravado', hora: hora(), em: Date.now() };
      estado.campos.set(chave, marca);
      setTimeout(() => {
        if (estado.campos.get(chave) === marca) { estado.campos.delete(chave); atualizar(); }
      }, 4000);
    }
    atualizar();
  }, (erro) => {
    estado.minhasGravacoes.delete(chave);
    const tipo = classificarErro(erro);
    estado.campos.set(chave, { tipo: 'nao_gravado', texto: digitado, mensagem: mensagemDeErro(tipo), erroTipo: tipo });
    anunciar(`Não gravado. ${mensagemDeErro(tipo)}`);
    atualizar();
  });
  atualizar();
}

/** Valida o texto digitado e decide entre não fazer nada, gravar ou perguntar (conflito). */
export function avaliarCampo(chave, digitado, base, { forcar = false } = {}) {
  const { pid, entidade, campo } = lerChave(chave);
  const doc = procPorId(pid);
  if (!doc || doc.excluido || !CAMPOS[entidade]?.[campo]) return;
  const def = definicao(chave);
  const armazenado = textoArmazenado(doc, chave);
  const r = validarCampo(entidade, campo, digitado, contextoDeValidacao(chave));
  if (!r.ok) {
    estado.campos.set(chave, { tipo: 'recusado', texto: digitado, mensagem: r.erro });
    atualizar();
    return;
  }
  const novoTexto = textoDoValor(def, r.valor);
  if (novoTexto === armazenado) {
    const atual = estado.campos.get(chave);
    if (atual && atual.tipo !== 'gravado' && atual.tipo !== 'alterado') estado.campos.delete(chave);
    atualizar();
    return;
  }
  if (!forcar) {
    const decisao = decidirSaida({ base: base ?? armazenado, atual: armazenado, digitado: novoTexto });
    if (decisao === 'nada') {
      estado.campos.delete(chave);
      atualizar();
      return;
    }
    if (decisao === 'perguntar') {
      estado.campos.set(chave, { tipo: 'conflito', texto: digitado, atual: armazenado, hora: hora() });
      anunciar('O valor deste campo mudou enquanto você digitava. Escolha qual manter.');
      atualizar();
      return;
    }
  }
  gravarValidado(chave, digitado, r.valor, chave);
}

function confirmarCampoDoElemento(el) {
  const chave = el.dataset.chave;
  const base = el.dataset.localBase;
  avaliarCampo(chave, el.value, base);
  el.dataset.localBase = textoArmazenado(procPorId(lerChave(chave).pid), chave);
}

// ----- Cards -----

function alternarCard(tela, id) {
  const k = chaveAberto(tela, id);
  if (estado.abertos.has(k)) estado.abertos.delete(k);
  else estado.abertos.add(k);
  atualizar();
}

function recolherEFocar(tela, id) {
  estado.abertos.delete(chaveAberto(tela, id));
  focar(`#card-${tela}-${id.replace(/[^A-Za-z0-9_-]/g, '_')} .btn-expandir`);
}

// ----- Processo: adicionar e excluir -----

function adicionarProcesso() {
  const entrada = document.getElementById('novo-processo');
  const texto = entrada ? entrada.value : '';
  const r = validarCampo('processo', 'nome', texto, { outrosNomes: outrosNomesDeProcesso(null) });
  if (!r.ok) {
    estado.formProcesso = { erro: r.erro };
    atualizar();
    return;
  }
  const { id, promessa } = estado.dados.criarProcesso(r.valor);
  estado.criadosPorMim.add(id);
  estado.abertos.add(chaveAberto('plano', id));
  estado.abertos.add(chaveAberto('indicadores', id));
  estado.formProcesso = null;
  anunciar(`Processo «${r.valor}» adicionado nas telas Plano e Indicadores.`);
  focar(estado.rota.tela === 'indicadores' ? `[data-chave="${montarChave(id, 'processo', null, 'nome')}"]` : `[data-chave="${montarChave(id, 'processo', null, 'dono')}"]`);
  acompanhar('criar processo', promessa).catch((e) => {
    erroGlobal(`Não foi possível adicionar o processo. ${mensagemPorErro(e)}`);
  });
}

function pedirExclusaoDeProcesso(id, origem) {
  const ativo = ativoPorId(id);
  if (!ativo) return;
  abrirDialogoExcluir({
    ativo,
    origem,
    aoConfirmar: () => {
      const lote = novoLote();
      estado.minhasExclusoes.add(id);
      const promessa = estado.dados.excluir(id, null, lote);
      empilharDesfazer({ processoId: id, alvo: null, rotulo: ativo.nome, lote });
      acompanhar('excluir processo', promessa).catch((e) => {
        estado.minhasExclusoes.delete(id);
        estado.desfazer = estado.desfazer.filter((d) => d.lote !== lote);
        erroGlobal(`Não foi possível excluir o processo. ${mensagemPorErro(e)}`);
      });
      return promessa;
    },
  });
}

export function aoFecharDialogoExclusao(concluido) {
  if (concluido) focar('#tit-lista');
  else if (document.activeElement === document.body) atualizar();
}

function empilharDesfazer({ processoId, alvo, rotulo, lote }) {
  estado.desfazer.push({ id: `${lote}-${estado.desfazer.length}`, lote, processoId, alvo, rotulo, ate: Date.now() + PRAZO_DESFAZER_DIAS * MS_DIA });
  atualizar();
}

// ----- Itens: adicionar e excluir -----

function proximaOrdem(mapa, filtro = () => true) {
  let max = 0;
  for (const v of Object.values(mapa ?? {})) if (v && filtro(v) && typeof v.ordem === 'number') max = Math.max(max, v.ordem);
  return max + 1;
}

function abrirNovo(chaveForm) {
  estado.formsNovo.set(chaveForm, { erro: null });
  focar(`[data-novo="${chaveForm}"]`);
}

function cancelarNovo(chaveForm) {
  estado.formsNovo.delete(chaveForm);
  focar(`[data-chave="${chaveForm}"]`);
}

function confirmarNovo(botao) {
  const chaveForm = botao.dataset.chave;
  const entrada = document.querySelector(`[data-novo="${chaveForm}"]`);
  if (entrada) criarNovo(entrada, botao.dataset, false);
}

/**
 * Cria melhoria, ação ou indicador a partir do texto de um campo. `daLinha` = campo da linha em branco da tabela:
 * sair do campo com texto cria (uma gravação, um item); sem texto não faz nada.
 */
function criarNovo(entrada, dados0, daLinha) {
  const chaveForm = entrada.dataset.novo;
  const { tipo, pid, mid } = dados0;
  if (daLinha && entrada.value.trim() === '') {
    if (estado.formsNovo.get(chaveForm)?.erro) { estado.formsNovo.delete(chaveForm); atualizar(); }
    return;
  }
  const doc = procPorId(pid);
  const a = ativoPorId(pid);
  if (!doc || !a) return;
  const entidade = tipo;
  const campoNome = tipo === 'acao' ? 'acao' : 'nome';
  const ctx = { hoje: hoje(), outrosNomes: tipo === 'melhoria' ? a.melhorias.map((m) => m.nome) : [] };
  const r = validarCampo(entidade, campoNome, entrada.value, ctx);
  const falha = (erro) => { estado.formsNovo.set(chaveForm, { erro }); atualizar(); };
  if (!r.ok) { falha(r.erro); return; }
  const mapa = { melhoria: 'melhorias', acao: 'acoes', indicador: 'indicadores' }[tipo];
  const limite = podeAdicionar(mapa, ocupacao(doc, mapa));
  if (!limite.ok) { falha(limite.erro); return; }
  const id = crypto.randomUUID();
  let dados;
  if (tipo === 'melhoria') dados = { nome: r.valor, ordem: proximaOrdem(doc.melhorias) };
  else if (tipo === 'acao') {
    dados = {
      melhoriaId: mid, acao: r.valor, responsavel: null, prazo: null, comoSeVerifica: null, status: null,
      ordem: proximaOrdem(doc.acoes, (x) => x.melhoriaId === mid),
    };
  } else {
    dados = {
      nome: r.valor, formula: null, oQueMede: null, responsavel: null, fonte: null, polaridade: null, frequencia: null,
      unidade: null, linhaBase: null, linhaBaseReferencia: null, meta: null, prazoMeta: null, ordem: proximaOrdem(doc.indicadores),
    };
  }
  estado.formsNovo.delete(chaveForm);
  if (daLinha) entrada.value = ''; // a linha em branco continua no lugar e não pode guardar o texto já gravado
  const promessa = estado.dados.criarItem(pid, { tipo, id, periodo: null }, dados);
  anunciar(`${{ melhoria: 'Melhoria', acao: 'Ação', indicador: 'Indicador' }[tipo]} adicionado.`);
  if (daLinha && tipo === 'acao') focar(`[data-chave="${montarChave(pid, 'acao', id, 'responsavel')}"]`);
  else if (daLinha && tipo === 'melhoria') focar(`[data-novo="acao:${pid}:${id}"]`);
  else focar(`[data-chave="${montarChave(pid, tipo, id, campoNome)}"]`);
  acompanhar(`criar ${tipo}`, promessa).catch((e) => erroGlobal(`Não foi possível adicionar. ${mensagemPorErro(e)}`));
}

function focoAposExcluir(tipo, pid, id, periodo) {
  const a = ativoPorId(pid);
  if (tipo === 'acao') {
    const m = a?.melhorias.find((x) => x.acoes.some((y) => y.id === id));
    return m ? `[data-novo="acao:${pid}:${m.id}"]` : '#tit-lista';
  }
  if (tipo === 'melhoria') return `[data-novo="melhoria:${pid}"]`;
  if (tipo === 'indicador') return `[data-chave="indicador:${pid}"]`;
  if (tipo === 'medicao') return `[data-k="medp-${id}-${periodo}"] input`;
  return '#tit-lista';
}

function excluirItem(botao) {
  const { tipo, pid, id, periodo } = botao.dataset;
  const chaveConf = botao.dataset.chave;
  const a = ativoPorId(pid);
  if (!a) return;
  let rotulo = '';
  if (tipo === 'acao') rotulo = a.acoes.find((x) => x.id === id)?.acao ?? 'ação';
  if (tipo === 'melhoria') rotulo = a.melhorias.find((x) => x.id === id)?.nome ?? 'melhoria';
  if (tipo === 'indicador') rotulo = a.indicadores.find((x) => x.id === id)?.nome ?? 'indicador';
  if (tipo === 'medicao') rotulo = `medição ${periodo}`;
  if (tipo === 'medicao') estado.formsMedicao.delete(`${id}:${periodo}`);
  const alvo = { tipo, id, periodo: periodo || null };
  const lote = novoLote();
  const foco = focoAposExcluir(tipo, pid, id, periodo);
  estado.confirmacoes.delete(chaveConf);
  const promessa = estado.dados.excluir(pid, alvo, lote);
  empilharDesfazer({ processoId: pid, alvo, rotulo: rotulo || tipo, lote });
  focar(foco);
  acompanhar('excluir item', promessa).catch((e) => {
    estado.desfazer = estado.desfazer.filter((d) => d.lote !== lote);
    erroGlobal(`Não foi possível excluir. ${mensagemPorErro(e)}`);
  });
}

// ----- Desfazer e lixeira -----

function nomeColide(processoId) {
  const p = procPorId(processoId);
  if (!p) return false;
  return outrosNomesDeProcesso(processoId).some((n) => normalizarNome(n) === normalizarNome(p.nome));
}

async function restaurarItem({ processoId, alvo, rotulo }) {
  if (!alvo && nomeColide(processoId)) {
    throw new Error(`Já existe um processo ativo com o nome «${rotulo}». Renomeie-o antes de restaurar.`);
  }
  await estado.dados.restaurar(processoId, alvo);
}

function desfazer(id) {
  const e = estado.desfazer.find((x) => x.id === id);
  if (!e || e.desfazendo) return;
  e.desfazendo = true;
  e.erro = null;
  atualizar();
  restaurarItem(e).then(() => {
    estado.desfazer = estado.desfazer.filter((x) => x.id !== id);
    estado.minhasExclusoes.delete(e.processoId);
    anunciar(`«${e.rotulo}» restaurado em todas as telas.`);
    if (!e.alvo) focar(`#card-${estado.rota.tela === 'indicadores' ? 'indicadores' : 'plano'}-${e.processoId.replace(/[^A-Za-z0-9_-]/g, '_')} .btn-expandir`);
    atualizar();
  }, (erro) => {
    e.desfazendo = false;
    e.erro = erro?.code ? `Não foi possível desfazer. O prazo terminou ou houve falha de conexão.` : erro.message;
    atualizar();
  });
}

const estadoLixeira = new Map();
export function estadoDosBotoesDaLixeira() {
  return estadoLixeira;
}

function restaurarDaLixeira(botao) {
  const { pid, tipo, id, periodo } = botao.dataset;
  const chave = `${pid}|${tipo}|${id}|${periodo}`;
  const itens = excluidosRecentes(estado.processos, Date.now());
  const it = itens.find((x) => x.processoId === pid && x.tipo === tipo && (x.alvo?.id ?? '') === id && (x.alvo?.periodo ?? '') === periodo);
  if (!it) return;
  estadoLixeira.set(chave, { restaurando: true });
  atualizar();
  restaurarItem({ processoId: pid, alvo: it.alvo, rotulo: it.rotulo }).then(() => {
    estadoLixeira.delete(chave);
    anunciar(`«${it.rotulo}» restaurado.`);
    atualizar();
  }, (erro) => {
    estadoLixeira.set(chave, { erro: erro?.code ? 'Não foi possível restaurar. O prazo terminou ou houve falha de conexão.' : erro.message });
    atualizar();
  });
}

function reabrirDoAviso(id) {
  const e = { processoId: id, alvo: null, rotulo: estado.avisosExclusao.get(id)?.nome ?? '' };
  restaurarItem(e).then(() => {
    estado.avisosExclusao.delete(id);
    atualizar();
  }, (erro) => erroGlobal(erro?.code ? 'Não foi possível desfazer. O prazo terminou ou houve falha de conexão.' : erro.message));
}

// ----- Medições -----

function indicadorAtivo(pid, indId) {
  return ativoPorId(pid)?.indicadores.find((i) => i.id === indId) ?? null;
}

const idDoCampoDeMedicao = (texto) => texto.replace(/[^A-Za-z0-9_-]/g, '_');

/** Lê os campos da linha do período pendente. Em percentual, preencher numerador ou denominador escolhe o cálculo; senão vale o valor direto. */
function lerLinhaDeMedicao(tr, ind) {
  const v = (n) => tr.querySelector(`[data-medicao="${n}"]`)?.value ?? '';
  const periodo = tr.dataset.periodo || v('periodo');
  const numerador = v('numerador');
  const denominador = v('denominador');
  const valor = v('valor');
  const calculado = ind.unidade === 'percentual' && (numerador.trim() !== '' || denominador.trim() !== '');
  return { periodo, modo: calculado ? 'calculado' : 'direto', numerador, denominador, valor, misto: calculado && valor.trim() !== '' };
}

const chaveDaLinha = (tr) => `${tr.dataset.ind}:${tr.dataset.periodo || 'outro'}`;

function atualizarLinhaDeMedicao(tr) {
  const ind = indicadorAtivo(tr.dataset.pid, tr.dataset.ind);
  if (!ind) return;
  const f = lerLinhaDeMedicao(tr, ind);
  let previa = '';
  let avisos = [];
  if (f.modo === 'calculado') {
    const n = analisarNumero(f.numerador);
    const d = analisarNumero(f.denominador);
    if (n.ok && d.ok && !n.vazio && !d.vazio && d.valor > 0) previa = `Valor calculado: ${formatarNumero(calcularValor(n.valor, d.valor))}%`;
  }
  const v = validarMedicao(f, {
    frequencia: ind.frequencia, unidade: ind.unidade, hoje: hoje(), existentes: ind.medicoes.map((m) => m.periodo),
  });
  if (v.ok) avisos = v.avisos;
  // guarda o texto (para avisar se outra pessoa registrar o período) e o período escolhido em "outro período"
  estado.formsMedicao.set(chaveDaLinha(tr), {
    previa, avisos, erros: null, escolhido: f.periodo,
    rascunho: { numerador: f.numerador, denominador: f.denominador, valor: f.valor },
  });
  atualizar();
}

function registrarMedicao(botao) {
  const tr = botao.closest('tr[data-linha-med]');
  const { pid, id: indId } = botao.dataset;
  const ind = indicadorAtivo(pid, indId);
  if (!ind || !tr) return;
  const f = lerLinhaDeMedicao(tr, ind);
  const chaveEstado = chaveDaLinha(tr);
  const ant = estado.formsMedicao.get(chaveEstado) ?? {};
  const v = validarMedicao(f, {
    frequencia: ind.frequencia, unidade: ind.unidade, hoje: hoje(), existentes: ind.medicoes.map((m) => m.periodo),
  });
  const erros = { ...(v.ok ? {} : v.erros) };
  // o período escolhido em "outro período" foi registrado por outra pessoa: a lista volta para "Escolha" e o registro é recusado
  if (!f.periodo && ant.escolhido && ind.medicoes.some((m) => m.periodo === ant.escolhido)) erros.periodo = 'Já existe medição para este período. Edite a existente.';
  if (f.misto) erros.valor = 'Preencha numerador e denominador ou só o valor direto, não os dois.';
  if (Object.keys(erros).length) {
    estado.formsMedicao.set(chaveEstado, { ...ant, erros, avisos: [] });
    atualizar();
    const primeiro = ['periodo', 'numerador', 'denominador', 'valor'].find((n) => erros[n]);
    const id = `reg-${idDoCampoDeMedicao(indId)}-${idDoCampoDeMedicao(tr.dataset.periodo || 'outro')}`;
    if (primeiro) focar(`#${id}-${primeiro}`);
    return;
  }
  const doc = procPorId(pid);
  const existeExcluida = Boolean(doc.indicadores?.[indId]?.medicoes?.[f.periodo]);
  if (!existeExcluida) {
    const limite = podeAdicionar('medicoes', ocupacao(doc, 'medicoes', indId));
    if (!limite.ok) {
      estado.formsMedicao.set(chaveEstado, { ...ant, erros: { periodo: limite.erro }, avisos: [] });
      atualizar();
      return;
    }
  }
  const rotulo = f.periodo;
  const promessa = estado.dados.criarItem(pid, { tipo: 'medicao', id: indId, periodo: f.periodo }, v.dados);
  if (v.avisos.length) estado.formsMedicao.set(`${indId}:${f.periodo}`, { registrado: true, avisos: v.avisos });
  else estado.formsMedicao.delete(`${indId}:${f.periodo}`);
  if (chaveEstado !== `${indId}:${f.periodo}`) estado.formsMedicao.delete(chaveEstado);
  if (!tr.dataset.periodo) for (const campoDaLinha of tr.querySelectorAll('input,select')) campoDaLinha.value = ''; // a linha "outro período" continua no lugar
  anunciar(`Medição de ${rotulo} registrada.${v.avisos.length ? ` Aviso: ${v.avisos[0]}` : ''}`);
  focar(`[data-k="med-${indId}-${f.periodo}"] [data-acao="medicao-editar"]`);
  acompanhar('criar medição', promessa).catch((e) => erroGlobal(`Não foi possível registrar a medição. ${mensagemPorErro(e)}`));
}

function editarMedicao(botao) {
  const { pid, id: indId, periodo } = botao.dataset;
  const ind = indicadorAtivo(pid, indId);
  const m = ind?.medicoes.find((x) => x.periodo === periodo);
  if (!m) return;
  const modo = ind.unidade === 'percentual' && m.numerador !== null && m.numerador !== undefined ? 'calculado' : 'direto';
  estado.edicaoMedicao = { processoId: pid, indicadorId: indId, periodo, modo, erros: null };
  focar(`[data-k="med-ed-${indId}-${periodo}"] input`);
}

function salvarMedicao(botao) {
  const ed = estado.edicaoMedicao;
  if (!ed) return;
  const ind = indicadorAtivo(ed.processoId, ed.indicadorId);
  const linha = botao.closest('tr');
  if (!ind || !linha) return;
  const v = (n) => linha.querySelector(`[data-edicao="${n}"]`)?.value ?? '';
  const r = validarMedicao({ periodo: ed.periodo, modo: ed.modo, numerador: v('numerador'), denominador: v('denominador'), valor: v('valor') }, {
    frequencia: ind.frequencia, unidade: ind.unidade, hoje: hoje(), existentes: [], edicao: true,
  });
  if (!r.ok) {
    estado.edicaoMedicao = { ...ed, erros: r.erros };
    atualizar();
    return;
  }
  const atual = ind.medicoes.find((x) => x.periodo === ed.periodo);
  const igual = (a, b) => (a ?? null) === (b ?? null);
  if (atual && igual(atual.numerador, r.dados.numerador) && igual(atual.denominador, r.dados.denominador) && igual(atual.valor, r.dados.valor)) {
    // Sem mudança real: não grava (as regras recusam gravação que só atualiza o carimbo, R6).
    estado.edicaoMedicao = null;
    anunciar(`Medição de ${ed.periodo} sem alterações.`);
    atualizar();
    return;
  }
  const alvo = { tipo: 'medicao', id: ed.indicadorId, periodo: ed.periodo };
  const promessa = estado.dados.alterarCamposItem(ed.processoId, alvo, { numerador: r.dados.numerador, denominador: r.dados.denominador, valor: r.dados.valor });
  estado.edicaoMedicao = null;
  anunciar(`Medição de ${ed.periodo} atualizada.`);
  acompanhar('editar medição', promessa).catch((e) => erroGlobal(`Não foi possível atualizar a medição. ${mensagemPorErro(e)}`));
  atualizar();
}

// ----- Roteamento do clique -----

function processoDoElemento(el) {
  return el.closest('[data-processo]')?.dataset.processo ?? null;
}

function expandirTodos(tela, abrir) {
  for (const p of listaAtiva()) {
    const k = chaveAberto(tela, p.id);
    if (abrir) estado.abertos.add(k);
    else estado.abertos.delete(k);
  }
  atualizar();
}

function irParaIndicador(id) {
  const el = document.getElementById(`ind-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`);
  if (!el) return;
  el.scrollIntoView({ block: 'start' });
  el.querySelector('h4')?.focus();
}

function revisarNaoGravados() {
  const chave = [...estado.campos.entries()].find(([, e]) => e.tipo === 'nao_gravado')?.[0];
  if (!chave) return;
  const { pid } = lerChave(chave);
  estado.abertos.add(chaveAberto('plano', pid));
  estado.abertos.add(chaveAberto('indicadores', pid));
  focar(`[data-chave="${chave}"]`);
}

export function tratarClique(e) {
  const alvo = e.target.closest('[data-acao]');
  if (!alvo) return;
  const acao = alvo.dataset.acao;
  // Um item do painel "Mais ..." fecha o painel; o foco de volta (diálogos) vai para o resumo do painel.
  let origemDoPainel = alvo;
  const painel = alvo.closest('.painel-mais');
  if (painel) {
    const sanf = painel.closest('details[data-sanfona]');
    estado.sanfonas.set(sanf.dataset.sanfona, false);
    origemDoPainel = sanf.querySelector('summary');
    atualizar();
  }
  if (acao === 'alternar') {
    if (e.target.closest('a')) return;
    if (alvo.tagName !== 'BUTTON' && e.target.closest('button')) return;
    if (alvo.classList.contains('card-cabeca') && window.getSelection()?.toString()) return;
    const { tela, id } = alvo.dataset;
    if (alvo.closest('.rodape-card')) recolherEFocar(tela, id);
    else alternarCard(tela, id);
    return;
  }
  switch (acao) {
    case 'pular': {
      e.preventDefault();
      document.getElementById('conteudo').focus();
      break;
    }
    case 'expandir-todos': expandirTodos(estado.rota.tela, true); break;
    case 'recolher-todos': expandirTodos(estado.rota.tela, false); break;
    case 'imprimir':
      estado.origemImpressao = alvo.dataset.tela;
      window.location.hash = `#/imprimir/${alvo.dataset.tela}/${alvo.dataset.id}`;
      break;
    case 'exportar-todos': exportarTodos(); break;
    case 'exportar-processo': exportarProcesso(alvo.dataset.id); break;
    case 'importar-novos': escolherArquivo('novos', null, origemDoPainel); break;
    case 'importar-processo': escolherArquivo('acrescimo', alvo.dataset.id, origemDoPainel); break;
    case 'imprimir-agora': window.print(); break;
    case 'excluir-processo': pedirExclusaoDeProcesso(alvo.dataset.id, alvo); break;
    case 'confirmar-abrir':
      estado.confirmacoes.add(alvo.dataset.chave);
      focar(`[data-conf="${alvo.dataset.chave}"] [data-acao="confirmar-cancelar"]`);
      break;
    case 'confirmar-cancelar': {
      const botaoDeOrigem = `[data-acao="confirmar-abrir"][data-chave="${alvo.dataset.chave}"]`;
      estado.confirmacoes.delete(alvo.dataset.chave);
      focar(botaoDeOrigem);
      break;
    }
    case 'excluir-item': excluirItem(alvo); break;
    case 'sanfona': {
      e.preventDefault();
      estado.sanfonas.set(alvo.dataset.chave, !alvo.closest('details').hasAttribute('open'));
      atualizar();
      break;
    }
    case 'filtrar': {
      estado.filtro = alvo.dataset.filtro;
      const n = filtrarPorEstado(filtrarPorBusca(listaAtiva())).length;
      anunciar(estado.filtro === 'todos' ? 'Filtro removido. Mostrando todos os processos.' : `Mostrando ${n} processos com ${estado.filtro === 'atrasadas' ? 'ação atrasada' : 'ação travada'}.`);
      break;
    }
    case 'novo-abrir': abrirNovo(alvo.dataset.chave); break;
    case 'novo-cancelar': cancelarNovo(alvo.dataset.chave); break;
    case 'novo-confirmar': confirmarNovo(alvo); break;
    case 'processo-novo-abrir':
      estado.formProcesso = { erro: null };
      focar('#novo-processo');
      break;
    case 'processo-novo-cancelar':
      estado.formProcesso = null;
      focar('[data-acao="processo-novo-abrir"]');
      break;
    case 'processo-novo-confirmar': adicionarProcesso(); break;
    case 'tentar-de-novo': {
      const e0 = estado.campos.get(alvo.dataset.chave);
      if (e0?.tipo === 'nao_gravado') avaliarCampo(alvo.dataset.chave, e0.texto, undefined, { forcar: true });
      break;
    }
    case 'conflito-manter': {
      const e0 = estado.campos.get(alvo.dataset.chave);
      if (e0?.tipo === 'conflito') avaliarCampo(alvo.dataset.chave, e0.texto, undefined, { forcar: true });
      break;
    }
    case 'conflito-usar':
      estado.campos.delete(alvo.dataset.chave);
      anunciar('Valor atual mantido.');
      atualizar();
      break;
    case 'entendi':
      estado.campos.delete(alvo.dataset.chave);
      atualizar();
      break;
    case 'alternar-metrica': {
      const id = alvo.dataset.id;
      if (estado.metricasAbertas.has(id)) estado.metricasAbertas.delete(id);
      else estado.metricasAbertas.add(id);
      atualizar();
      break;
    }
    case 'medicao-registrar': registrarMedicao(alvo); break;
    case 'medicao-editar': editarMedicao(alvo); break;
    case 'dispensar-aviso-medicao': estado.formsMedicao.delete(alvo.dataset.chave); atualizar(); break;
    case 'medicao-salvar': salvarMedicao(alvo); break;
    case 'medicao-cancelar': estado.edicaoMedicao = null; atualizar(); break;
    case 'ir-indicador': irParaIndicador(alvo.dataset.id); break;
    case 'desfazer': desfazer(alvo.dataset.id); break;
    case 'fechar-desfazer':
      estado.desfazer = estado.desfazer.filter((x) => x.id !== alvo.dataset.id);
      atualizar();
      break;
    case 'abrir-lixeira': abrirLixeira(alvo); atualizar(); break;
    case 'restaurar': restaurarDaLixeira(alvo); break;
    case 'reabrir-aviso': reabrirDoAviso(alvo.dataset.id); break;
    case 'dispensar-aviso': estado.avisosExclusao.delete(alvo.dataset.id); atualizar(); break;
    case 'revisar-nao-gravados': revisarNaoGravados(); break;
    case 'fechar-erro': estado.erroGlobal = null; atualizar(); break;
    case 'recarregar': estado.aoRecarregar?.(); break;
    case 'limpar-busca': estado.busca = ''; atualizar(); break;
    default: break;
  }
}

// ----- Foco, teclado e entrada -----

function dentroDaLista(el) {
  return Boolean(el?.closest?.('#tela .card'));
}

export function instalarEventos() {
  const raiz = document;
  raiz.addEventListener('click', tratarClique);

  raiz.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el.dataset?.chave && el.matches('input,textarea,select')) {
      el.dataset.localBase = textoArmazenado(procPorId(lerChave(el.dataset.chave).pid), el.dataset.chave);
    }
    if (dentroDaLista(el) && !estado.ordemCongelada) {
      estado.visiveisCongelados = new Set(estado.filtro === 'todos' ? [] : filtrarPorBusca(listaAtiva()).filter((p) => processoTem(p, estado.filtro)).map((p) => p.id));
      estado.ordemCongelada = listaAtiva().map((p) => p.id);
    }
  });

  raiz.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el.dataset?.chave && el.matches('input,textarea') && el.isConnected) confirmarCampoDoElemento(el);
    if (el.dataset?.linhaNova && el.isConnected) criarNovo(el, el.dataset, true);
    if (!dentroDaLista(e.relatedTarget) && estado.ordemCongelada) {
      estado.ordemCongelada = null;
      estado.visiveisCongelados = null;
      atualizar();
    }
  });

  raiz.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset?.chave && el.matches('select')) confirmarCampoDoElemento(el);
    if (el.name === 'conteudo-impressao') {
      window.location.hash = `#/imprimir/${el.value}/${el.dataset.pid}`;
      focar(`input[name="conteudo-impressao"][value="${el.value}"]`);
    }
    const linhaMed = el.closest?.('tr[data-linha-med]');
    if (linhaMed && el.dataset?.medicao === 'periodo') atualizarLinhaDeMedicao(linhaMed);
  });

  raiz.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'busca') { estado.busca = el.value; atualizar(); return; }
    const linhaMed = el.closest?.('tr[data-linha-med]');
    if (linhaMed && el.dataset?.medicao && el.matches('input[type="text"]')) atualizarLinhaDeMedicao(linhaMed);
    if (el.dataset?.novo) {
      const f = estado.formsNovo.get(el.dataset.novo);
      if (f?.erro) { estado.formsNovo.set(el.dataset.novo, { erro: null }); atualizar(); }
    }
    if (el.id === 'novo-processo' && estado.formProcesso?.erro) { estado.formProcesso = { erro: null }; atualizar(); }
  });

  raiz.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Escape') {
      if (el.dataset?.chave && el.matches('input,textarea,select')) {
        const doc = procPorId(lerChave(el.dataset.chave).pid);
        el.value = textoArmazenado(doc, el.dataset.chave);
        estado.campos.delete(el.dataset.chave);
        atualizar();
        e.stopPropagation();
        return;
      }
      if (el.dataset?.linhaNova) {
        el.value = '';
        estado.formsNovo.delete(el.dataset.novo);
        atualizar();
        return;
      }
      if (el.dataset?.novo) { cancelarNovo(el.dataset.novo); return; }
      if (el.id === 'novo-processo') { estado.formProcesso = null; focar('[data-acao="processo-novo-abrir"]'); return; }
      const conf = el.closest?.('[data-conf]');
      if (conf) {
        const chave = conf.dataset.conf;
        estado.confirmacoes.delete(chave);
        focar(`[data-acao="confirmar-abrir"][data-chave="${chave}"]`);
        return;
      }
      if (el.closest?.('tr.editando')) { estado.edicaoMedicao = null; atualizar(); return; }
      const aberto = el.closest?.('details.mais[open]');
      if (aberto) {
        estado.sanfonas.set(aberto.dataset.sanfona, false);
        atualizar();
        focar(`summary[data-chave="${aberto.dataset.sanfona}"]`);
        return;
      }
      const menu = document.getElementById('btn-menu');
      if (menu && menu.getAttribute('aria-expanded') === 'true') {
        menu.click();
        menu.focus();
      }
      return;
    }
    if (e.key === 'Enter') {
      if (el.dataset?.chave && el.matches('input[type="text"],textarea[data-linha-unica]')) {
        e.preventDefault();
        confirmarCampoDoElemento(el);
      } else if (el.dataset?.linhaNova) {
        e.preventDefault();
        criarNovo(el, el.dataset, true);
      } else if (el.dataset?.novo) {
        e.preventDefault();
        document.querySelector(`[data-acao="novo-confirmar"][data-chave="${el.dataset.novo}"]`)?.click();
      } else if (el.id === 'novo-processo') {
        e.preventDefault();
        adicionarProcesso();
      } else if (el.dataset?.edicao) {
        e.preventDefault();
        el.closest('tr').querySelector('[data-acao="medicao-salvar"]')?.click();
      } else if (el.dataset?.medicao && el.matches('input[type="text"]')) {
        e.preventDefault();
        el.closest('tr').querySelector('[data-acao="medicao-registrar"]')?.click();
      }
    }
  });

  window.addEventListener('beforeunload', (e) => {
    let naoGravados = 0;
    for (const x of estado.campos.values()) if (x.tipo === 'nao_gravado') naoGravados += 1;
    if (estado.pendencias.size > 0 || naoGravados > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

