// Única camada que importa o Firebase. Contrato: docs/arquitetura/visao-geral.md, seção 4.
// Toda gravação toca no máximo um item de um mapa e leva o campo `alvo` (mudança M1).
// Nenhum dado fica no armazenamento do navegador: cache só em memória.
import { initializeApp } from '../../vendor/firebase/13.0.0/firebase-app.js';
import {
  initializeFirestore, memoryLocalCache, connectFirestoreEmulator, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc,
  getDoc, serverTimestamp, deleteField, FieldPath,
} from '../../vendor/firebase/13.0.0/firebase-firestore.js';
import config from '../config.js';
import { dataSaoPaulo } from '../dominio/periodos.js';
import { purgaveis, executarPurga, PRAZO_DESFAZER_DIAS } from '../dominio/lixeira.js';
import { retratosIguais } from '../dominio/metricas.js';
import { classificarErro } from '../dominio/erros.js';
import { escolherAmbiente, parametroEmulador } from '../dominio/ambiente.js';

export { parametroEmulador };

export const PROJETO_EMULADOR = 'demo-processos-acao';

let db = null;
let modoEmulador = false;
let ultimosDocs = [];

/**
 * Conecta ao emulador só na máquina local e com o parâmetro explícito ?emulador=host:porta (ambiente de teste,
 * "Dados fictícios"). Na máquina local sem o parâmetro, não conecta a nada (R5): lança ErroAmbienteLocal.
 * Em produção usa a configuração do projeto.
 */
export class ErroAmbienteLocal extends Error {
  constructor() {
    super('ambiente local sem emulador');
    this.name = 'ErroAmbienteLocal';
  }
}

// Configuração mínima do emulador: não leva chave nem identificadores do projeto de produção.
const CONFIG_EMULADOR = { apiKey: 'demo-sem-chave', projectId: PROJETO_EMULADOR, appId: '1:0:web:demo' };

export function iniciar(localizacao = window.location) {
  if (db) return { emulador: modoEmulador, projeto: modoEmulador ? PROJETO_EMULADOR : config.projectId };
  const ambiente = escolherAmbiente(localizacao);
  if (ambiente.tipo === 'bloqueado') throw new ErroAmbienteLocal();
  const emu = ambiente.tipo === 'emulador' ? ambiente : null;
  const configuracao = emu ? CONFIG_EMULADOR : config;
  const app = initializeApp(configuracao);
  db = initializeFirestore(app, { localCache: memoryLocalCache() });
  if (emu) {
    connectFirestoreEmulator(db, emu.host, emu.porta);
    modoEmulador = true;
  }
  return { emulador: modoEmulador, projeto: configuracao.projectId };
}

function banco() {
  if (!db) iniciar();
  return db;
}

// ----- Leitura -----

function lerDocumento(d) {
  const dados = d.data({ serverTimestamps: 'estimate' });
  return {
    id: d.id,
    ...dados,
    _meta: { pendente: d.metadata.hasPendingWrites, doCache: d.metadata.fromCache },
  };
}

/**
 * Assina a coleção `processos`. aoMudar({ processos, doCache, temPendencias }) a cada mudança, inclusive de metadados.
 * Retorna a função que cancela a assinatura.
 */
export function assinarProcessos(aoMudar, aoErro) {
  return onSnapshot(
    collection(banco(), 'processos'),
    { includeMetadataChanges: true },
    (snap) => {
      const processos = snap.docs.map(lerDocumento);
      ultimosDocs = processos;
      aoMudar({ processos, doCache: snap.metadata.fromCache, temPendencias: snap.metadata.hasPendingWrites });
    },
    (erro) => aoErro?.(erro, classificarErro(erro)),
  );
}

// ----- Escrita -----

const REF = (processoId) => doc(banco(), 'processos', processoId);

function caminho(alvo) {
  switch (alvo.tipo) {
    case 'melhoria': return ['melhorias', alvo.id];
    case 'acao': return ['acoes', alvo.id];
    case 'indicador': return ['indicadores', alvo.id];
    case 'medicao': return ['indicadores', alvo.id, 'medicoes', alvo.periodo];
    default: throw new Error('alvo inválido');
  }
}

function carimbo(alvo) {
  return alvo.tipo === 'melhoria' || alvo.tipo === 'acao' ? 'planoAtualizadoEm' : 'indicadoresAtualizadoEm';
}

function alvoCompleto(alvo) {
  return { tipo: alvo.tipo, id: alvo.id, periodo: alvo.periodo ?? null };
}

function pares(...lista) {
  return lista.flat();
}

/** Campos do processo: nome, dono, embaixador. Grava também planoAtualizadoEm no mesmo updateDoc. */
export function alterarCampoProcesso(processoId, campo, valor) {
  return updateDoc(REF(processoId), campo, valor, 'planoAtualizadoEm', serverTimestamp());
}

/** Vários campos de um item na mesma gravação (usado pela medição, que grava numerador, denominador e valor juntos). */
export function alterarCamposItem(processoId, alvo, campos) {
  const base = caminho(alvo);
  const lista = [];
  for (const [campo, valor] of Object.entries(campos)) lista.push(new FieldPath(...base, campo), valor);
  if (alvo.tipo !== 'melhoria') lista.push(new FieldPath(...base, 'atualizadoEm'), serverTimestamp());
  return updateDoc(REF(processoId), ...pares(lista, carimbo(alvo), serverTimestamp(), 'alvo', alvoCompleto(alvo)));
}

export function alterarCampoItem(processoId, alvo, campo, valor) {
  return alterarCamposItem(processoId, alvo, { [campo]: valor });
}

/** Cria um item (melhoria, ação, indicador ou medição) com os campos recebidos. `dados` não inclui carimbos. */
export function criarItem(processoId, alvo, dados) {
  const base = caminho(alvo);
  const item = { ...dados, excluido: null, criadoEm: serverTimestamp() };
  if (alvo.tipo === 'medicao') {
    delete item.criadoEm;
    item.registradoEm = serverTimestamp();
    item.atualizadoEm = serverTimestamp();
  } else if (alvo.tipo !== 'melhoria') {
    item.atualizadoEm = serverTimestamp();
  }
  if (alvo.tipo === 'indicador') item.medicoes = {};
  return updateDoc(REF(processoId), new FieldPath(...base), item, carimbo(alvo), serverTimestamp(), 'alvo', alvoCompleto(alvo));
}

/** Cria um processo vazio no formato exato de RG-10 (dono e embaixador opcionais, usados na importação). Retorna { id, promessa }. */
export function criarProcesso(nome, { dono = null, embaixador = null } = {}) {
  const ref = doc(collection(banco(), 'processos'));
  const promessa = setDoc(ref, {
    esquema: 1, nome, dono, embaixador, origemId: null, criadoEm: serverTimestamp(),
    planoAtualizadoEm: null, indicadoresAtualizadoEm: null, excluido: null,
    melhorias: {}, acoes: {}, indicadores: {}, alvo: null,
  });
  return { id: ref.id, promessa };
}

/** Exclusão lógica. alvo nulo = processo (uma gravação, sem carimbo). */
export function excluir(processoId, alvo, lote) {
  const marca = { em: serverTimestamp(), lote };
  if (!alvo) return updateDoc(REF(processoId), 'excluido', marca);
  return updateDoc(REF(processoId), new FieldPath(...caminho(alvo), 'excluido'), marca, carimbo(alvo), serverTimestamp(), 'alvo', alvoCompleto(alvo));
}

export function restaurar(processoId, alvo) {
  if (!alvo) return updateDoc(REF(processoId), 'excluido', null);
  return updateDoc(REF(processoId), new FieldPath(...caminho(alvo), 'excluido'), null, carimbo(alvo), serverTimestamp(), 'alvo', alvoCompleto(alvo));
}

/**
 * Purga os itens vencidos (um por gravação, ações antes da melhoria) e os processos vencidos.
 * Uma operação recusada é registrada e a purga segue com as demais (R2); só para por limite de cota ou falta de
 * conexão. A próxima abertura tenta de novo. Retorna { feitas, falhas: [{ op, tipo }], interrompida }.
 */
export async function purgarVencidos(agora = Date.now(), limite = 40) {
  const ops = purgaveis(ultimosDocs, agora, PRAZO_DESFAZER_DIAS).slice(0, limite);
  const resultado = await executarPurga(ops, (op) => {
    if (op.tipo === 'processo') return deleteDoc(REF(op.processoId));
    return updateDoc(REF(op.processoId), new FieldPath(...caminho(op.alvo)), deleteField(), 'alvo', alvoCompleto(op.alvo));
  });
  if (resultado.falhas.length) {
    // Sem dados do usuário no registro: só tipo, id e classe do erro.
    console.warn(`Purga: ${resultado.falhas.length} item(ns) não puderam ser apagados`,
      resultado.falhas.map((f) => `${f.op.alvo?.tipo ?? 'processo'}:${f.op.processoId}:${f.tipo}`));
  }
  return resultado;
}

/** Retrato diário das métricas: grava só se ausente ou diferente (regravável apenas no próprio dia). */
export async function atualizarRetratoDoDia(calcular) {
  const hoje = dataSaoPaulo(new Date());
  const ref = doc(banco(), 'retratos', hoje);
  try {
    const atual = await getDoc(ref);
    const novo = calcular();
    const existente = atual.exists() ? atual.data() : null;
    if (existente && retratosIguais(existente, novo)) return false;
    await setDoc(ref, { ...novo, calculadoEm: serverTimestamp() });
    return true;
  } catch {
    return false; // não é edição do usuário: sem aviso (arquitetura, seção 3.3)
  }
}
