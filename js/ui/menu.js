// Menu principal: no celular vira um botão (disclosure com aria-expanded) e começa fechado.
export function configurarMenu() {
  const botao = document.getElementById('btn-menu');
  const lista = document.getElementById('menu-lista');
  botao.addEventListener('click', () => {
    const aberto = botao.getAttribute('aria-expanded') === 'true';
    botao.setAttribute('aria-expanded', aberto ? 'false' : 'true');
    lista.hidden = aberto;
  });
}
